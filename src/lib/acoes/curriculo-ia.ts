"use server";

import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import {
  CNHS,
  DISPONIBILIDADES,
  ESCOLARIDADES,
  EXPERIENCIAS,
  MAX_CURSOS,
  MAX_EXPERIENCIAS,
  nomeEscolaridade,
} from "@/lib/constantes";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import {
  sugerirMelhoriasNoCurriculo,
  type CurriculoParaIA,
  type SugestaoCurriculo,
  type VagaParaIA,
} from "@/lib/ia/curriculo-melhorar";
import { iaConfigurada } from "@/lib/ia/openai";
import { vagasDaFuncaoPerto, type VagaDoMercado } from "@/lib/servidor/curriculo-mercado";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { MAX_HABILIDADES } from "@/lib/talentos";
import { modeloPara } from "@/lib/ia/funcionalidades";

// "Melhorar com a IA" em Meu currículo (claude/plano-salario-e-curriculo.md, parte 4). Só quando a pessoa pede, com a
// cota da ajuda da IA (usar_ia_texto: ligada no admin, 20 por dia). Nada é salvo aqui: as sugestões voltam para o
// formulário, e a pessoa escolhe o que usa e salva.

export type RespostaMelhorarCurriculo = { ok: true; sugestoes: SugestaoCurriculo[] } | { ok: false; erro: string };

const MES = /^\d{4}-\d{2}$/;

function limpar(r: Partial<CurriculoParaIA> | null | undefined): CurriculoParaIA {
  const t = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  const lista = (v: unknown, quantos: number, cada: number) =>
    Array.isArray(v)
      ? v
          .map((x) => t(x, cada))
          .filter(Boolean)
          .slice(0, quantos)
      : [];
  const entre = (v: unknown, validos: readonly string[]) => (typeof v === "string" && validos.includes(v) ? v : "");
  const periodos = DISPONIBILIDADES.map((d) => d.valor as string);
  return {
    titulo: t(r?.titulo, 60),
    habilidades: lista(r?.habilidades, MAX_HABILIDADES, 40),
    escolaridade: entre(
      r?.escolaridade,
      ESCOLARIDADES.map((e) => e.valor),
    ),
    curso: t(r?.curso, 80),
    cnh: entre(r?.cnh, CNHS),
    disponibilidade: Array.isArray(r?.disponibilidade)
      ? [...new Set(r.disponibilidade.filter((d) => periodos.includes(d)))]
      : [],
    cursos: lista(r?.cursos, MAX_CURSOS, 80),
    // na ordem do formulário (a sugestão volta pela posição), até o máximo
    experiencias: (Array.isArray(r?.experiencias) ? r.experiencias : []).slice(0, MAX_EXPERIENCIAS).map((e) => ({
      cargo: t(e?.cargo, 80),
      onde: t(e?.onde, 80),
      inicio: MES.test(String(e?.inicio ?? "")) ? String(e.inicio) : "",
      fim: MES.test(String(e?.fim ?? "")) ? String(e.fim) : "",
      atual: e?.atual === true,
      descricao: t(e?.descricao, 300),
    })),
  };
}

/** "Ensino médio completo; pelo menos 6 meses de experiência; CNH B": o que a vaga pede, para a IA. */
function oQueAVagaPede(v: VagaDoMercado) {
  const experiencia = EXPERIENCIAS.find((e) => e.valor === v.experiencia && e.valor !== "sem");
  return [
    nomeEscolaridade(v.escolaridade_minima),
    experiencia ? `${experiencia.nome.toLowerCase()} de experiência` : null,
    v.cnh ? `CNH ${v.cnh}` : null,
    v.horario ? `horário: ${v.horario}` : null,
  ]
    .filter(Boolean)
    .join("; ");
}

/** As sugestões da IA para o currículo que está no formulário (até 5). */
export async function melhorarCurriculoComIA(rascunho: CurriculoParaIA): Promise<RespostaMelhorarCurriculo> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!iaConfigurada()) return { ok: false, erro: "A ajuda da IA não está disponível agora." };
  const entrada = limpar(rascunho);
  if (entrada.titulo.length < 2 && !entrada.experiencias.some((e) => e.cargo.length >= 2)) {
    return {
      ok: false,
      erro: "Preencha o que você faz ou uma experiência primeiro: a IA melhora o que você escreveu.",
    };
  }
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para usar a ajuda da IA." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("usar_ia_texto");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const [{ data: config }, perfil] = await Promise.all([
    supabase.rpc("config_publica"),
    obterMeuPerfil().catch(() => null),
  ]);
  const modelo = modeloPara(config?.[0], "textos");
  // o que as vagas da mesma função perto pedem (dados públicos das vagas): a IA pergunta o que falta
  const vagas: VagaParaIA[] = perfil
    ? (
        await vagasDaFuncaoPerto(
          { id: usuario.id, cidade: perfil.cidade, bairro: null },
          {
            titulo: entrada.titulo,
            experiencias: entrada.experiencias.map((e) => ({ ...e, fim: e.fim || null })),
          },
        )
      ).map((v) => ({ titulo: v.titulo, pede: oQueAVagaPede(v), descricao: v.descricao }))
    : [];
  try {
    const sugestoes = await sugerirMelhoriasNoCurriculo(entrada, vagas, modelo);
    if (!sugestoes.length) {
      return { ok: false, erro: "A IA não achou o que melhorar agora. Tente de novo depois de mexer no currículo." };
    }
    return { ok: true, sugestoes };
  } catch (e) {
    // o motivo técnico (chave, créditos, modelo) fica no registro do servidor, não na tela
    console.error("Publike: a ajuda da IA no currículo falhou:", e instanceof Error ? e.message : e);
    return { ok: false, erro: "A IA não conseguiu ajudar agora. Tente de novo." };
  }
}
