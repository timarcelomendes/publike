"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { nomeEscolaridade, nomeExperiencia, nomeJornada } from "@/lib/constantes";
import {
  contarLeitura,
  LOTE_COPILOTO,
  MAX_CRITERIOS,
  motivoProibido,
  type CriterioCopiloto,
  type OrigemCopiloto,
} from "@/lib/copiloto";
import { obterAnuncio, obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { lerCurriculo, sugerirCriterios } from "@/lib/ia/copiloto";
import { iaConfigurada, modeloDaIA } from "@/lib/ia/openai";
import { descreverAnuncio } from "@/lib/ia/tarefas";
import { avaliacoesDoCopiloto, configDoCopiloto, leituraAtual, pessoasDoCopiloto } from "@/lib/servidor/copiloto";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Json } from "@/lib/supabase/tipos-banco";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";
import { perguntasDoBanco } from "@/lib/vaga-extra";

// O copiloto de contratação (teste; migração 20261203120000). O banco confere de novo se a vaga é
// da conta e se a conta está liberada.

type MinhaVaga =
  | { erro: string }
  | {
      anuncio: NonNullable<Awaited<ReturnType<typeof obterAnuncio>>>;
      config: NonNullable<Awaited<ReturnType<typeof configDoCopiloto>>>;
    };

async function minhaVaga(anuncioId: string): Promise<MinhaVaga> {
  if (MODO_DEMO) return { erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { erro: "Entre na sua conta." };
  const anuncio = await obterAnuncio(anuncioId);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") return { erro: "Vaga não encontrada." };
  const config = await configDoCopiloto(anuncioId);
  if (!config?.liberado) return { erro: "O copiloto está em teste e não está liberado para a sua conta." };
  return { anuncio, config };
}

async function modeloEscolhido() {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("config_publica");
  return modeloDaIA(data?.[0]?.ia_modelo).id;
}

export type RespostaCriterios = { ok: true; criterios: CriterioCopiloto[] } | { ok: false; erro: string };

/** A IA sugere os critérios a partir da vaga. Não salva: a pessoa confere e salva. */
export async function sugerirCriteriosComIA(anuncioId: string): Promise<RespostaCriterios> {
  const v = await minhaVaga(anuncioId);
  if ("erro" in v) return { ok: false, erro: v.erro };
  if (!iaConfigurada()) return { ok: false, erro: "A ajuda da IA não está disponível agora." };
  const supabase = await criarClienteServidor();
  const { error: limite } = await supabase.rpc("usar_ia_resumo");
  if (limite) return { ok: false, erro: mensagemDeErro(limite) };
  const a = v.anuncio;
  const pede = [
    a.escolaridade_minima && `Escolaridade mínima: ${nomeEscolaridade(a.escolaridade_minima) ?? a.escolaridade_minima}`,
    a.experiencia && `Experiência: ${nomeExperiencia(a.experiencia) ?? a.experiencia}`,
    a.cnh && `CNH: ${a.cnh}`,
    a.jornada && `Jornada: ${nomeJornada(a.jornada) ?? a.jornada}`,
    ...perguntasDoBanco(a.perguntas).map((q) => `Pergunta para quem se candidata: ${q.nome}`),
  ].filter(Boolean);
  const texto = [
    descreverAnuncio({
      tipo: a.tipo,
      titulo: a.titulo,
      descricao: a.descricao,
      categoria: a.categoria,
      regime: a.regime,
      pagamento_valor: a.pagamento_valor,
      pagamento_unidade: a.pagamento_unidade,
      beneficios: a.beneficios,
      horario: a.horario,
      vagas: a.vagas,
      cidade: a.cidade,
      bairro: a.bairro,
      ganhos_extras: a.ganhos_extras,
    }),
    ...pede,
  ].join("\n");
  try {
    return { ok: true, criterios: await sugerirCriterios(texto, await modeloEscolhido()) };
  } catch (e) {
    console.error("Publike: o copiloto não sugeriu critérios:", e instanceof Error ? e.message : e);
    return { ok: false, erro: "A IA não conseguiu sugerir agora. Tente de novo ou escreva os critérios." };
  }
}

export type RespostaSalvarCriterios =
  { ok: true; mensagem: string } | { ok: false; erro: string; erros?: Record<string, string> };

export async function salvarCriterios(
  anuncioId: string,
  criterios: CriterioCopiloto[],
): Promise<RespostaSalvarCriterios> {
  const v = await minhaVaga(anuncioId);
  if ("erro" in v) return { ok: false, erro: v.erro };
  const lista = (Array.isArray(criterios) ? criterios : [])
    .map((c) => ({
      id: String(c?.id ?? ""),
      texto: String(c?.texto ?? "")
        .replace(/\s+/g, " ")
        .trim(),
      obrigatorio: c?.obrigatorio === true,
    }))
    .filter((c) => c.texto);
  if (!lista.length) return { ok: false, erro: "Ponha pelo menos um critério." };
  if (lista.length > MAX_CRITERIOS) return { ok: false, erro: `Ponha até ${MAX_CRITERIOS} critérios.` };
  const erros: Record<string, string> = {};
  const ids = new Set<string>();
  for (const c of lista) {
    if (!/^[a-z0-9]{1,12}$/.test(c.id) || ids.has(c.id)) return { ok: false, erro: "Pedido inválido." };
    ids.add(c.id);
    const motivo = motivoProibido(c.texto);
    if (motivo) erros[c.id] = motivo;
    else if (c.texto.length < 3) erros[c.id] = "Escreva um pouco mais.";
    else if (c.texto.length > 120) erros[c.id] = "Use até 120 letras.";
  }
  if (Object.keys(erros).length) return { ok: false, erro: "Confira os critérios marcados.", erros };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("copiloto_salvar_criterios", {
    p_anuncio: anuncioId,
    p_criterios: lista as unknown as Json,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, mensagem: "Critérios salvos. Agora é só buscar." };
}

export async function ligarPartesDoCopiloto(
  anuncioId: string,
  partes: { triagem: boolean; busca: boolean; padrao: boolean },
): Promise<Resultado> {
  const v = await minhaVaga(anuncioId);
  if ("erro" in v) return { ok: false, erro: v.erro };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("copiloto_ligar", {
    p_anuncio: anuncioId,
    p_triagem: partes.triagem === true,
    p_busca: partes.busca === true,
    p_padrao: partes.padrao === true,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  refresh();
  return { ok: true, mensagem: partes.padrao ? "Salvo, também para as próximas vagas." : "Salvo." };
}

export type RespostaLote = { ok: true; lidos: number; faltam: number; falhas: number } | { ok: false; erro: string };

/** Lê o próximo lote (até 6 currículos, 3 de cada vez) e guarda cada leitura. */
export async function lerLoteDoCopiloto(anuncioId: string, origem: OrigemCopiloto): Promise<RespostaLote> {
  if (origem !== "talento" && origem !== "candidato") return { ok: false, erro: "Pedido inválido." };
  const v = await minhaVaga(anuncioId);
  if ("erro" in v) return { ok: false, erro: v.erro };
  const { anuncio, config } = v;
  if (!config.criterios.length) return { ok: false, erro: "Salve os critérios primeiro." };
  if (origem === "talento" ? !config.busca : !config.triagem) return { ok: false, erro: "Esta parte está desligada." };
  if (!iaConfigurada()) return { ok: false, erro: "A ajuda da IA não está disponível agora." };

  const agora = Date.now();
  const [pessoas, avaliacoes] = await Promise.all([
    pessoasDoCopiloto(anuncio, origem, config.criterios, agora),
    avaliacoesDoCopiloto(anuncioId),
  ]);
  const fila = pessoas.filter((p) => p.curriculo && !leituraAtual(avaliacoes.get(p.perfil_id), config.versao, p));
  if (!fila.length) return { ok: true, lidos: 0, faltam: 0, falhas: 0 };

  const supabase = await criarClienteServidor();
  const { data: pode, error } = await supabase.rpc("copiloto_reservar", {
    p_anuncio: anuncioId,
    p_origem: origem,
    p_quantos: Math.min(LOTE_COPILOTO, fila.length),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para ler agora.") };
  const lote = fila.slice(0, pode ?? 0);
  const modelo = await modeloEscolhido();
  let lidos = 0;
  let falhas = 0;
  for (let i = 0; i < lote.length; i += 3) {
    await Promise.all(
      lote.slice(i, i + 3).map(async (p) => {
        try {
          const { modelo: usado, ...leitura } = await lerCurriculo(
            {
              vaga: { titulo: anuncio.titulo, descricao: anuncio.descricao ?? "" },
              criterios: config.criterios,
              curriculo: p.texto,
            },
            modelo,
          );
          const n = contarLeitura(config.criterios, leitura);
          const { error: e } = await supabase.rpc("copiloto_guardar", {
            p_anuncio: anuncioId,
            p_perfil: p.perfil_id,
            p_origem: origem,
            p_versao: config.versao,
            p_curriculo_em: p.curriculo!.atualizado_em,
            p_resultado: leitura as unknown as Json,
            p_atende: n.atende,
            p_obrigatorios_ok: n.obrigatoriosOk,
            p_modelo: usado,
          });
          if (e) throw new Error(e.message);
          lidos++;
        } catch (e) {
          falhas++;
          console.error("Publike: o copiloto não leu um currículo:", e instanceof Error ? e.message : e);
        }
      }),
    );
  }
  if (!lidos && falhas) return { ok: false, erro: "A IA não conseguiu ler agora. Tente de novo em instantes." };
  return { ok: true, lidos, faltam: Math.max(0, fila.length - lidos - falhas), falhas };
}

/** O Convidar do copiloto: o mesmo convite, com o limite de 3 por semana para cada pessoa. */
export async function convidarPeloCopiloto(anuncioId: string, perfilId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("copiloto_convidar", { p_anuncio: anuncioId, p_perfil: perfilId });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para convidar agora.") };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Convite enviado." };
}
