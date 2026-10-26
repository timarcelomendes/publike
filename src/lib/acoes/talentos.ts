"use server";

import { after } from "next/server";
import { refresh } from "next/cache";
import { atendeEmParte } from "@/lib/aderencia";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import { listarCurriculosDosInteressados, obterAnuncio, obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { iaConfigurada, MODELO_PADRAO } from "@/lib/ia/openai";
import { resumirCandidato, type ResumoCandidato } from "@/lib/ia/tarefas";
import { processarFilas } from "@/lib/servidor/filas";
import { montarQuadro } from "@/lib/servidor/quadro";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Painel 2.0, entrega 3: o resumo do candidato pela IA, os convites de Talentos e a
// escolha de quem deixa as empresas acharem o currículo.

export type RespostaResumo = { ok: true; resumo: ResumoCandidato } | { ok: false; erro: string };

/** O resumo da IA de um candidato de uma vaga minha. Guardado: só refaz se o currículo mudar. */
export async function resumirCandidatoComIA(anuncioId: string, perfilId: string): Promise<RespostaResumo> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  if (!iaConfigurada()) return { ok: false, erro: "A ajuda da IA não está disponível agora." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const anuncio = await obterAnuncio(anuncioId);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") {
    return { ok: false, erro: "Vaga não encontrada." };
  }
  const cv = (await listarCurriculosDosInteressados(anuncioId).catch(() => null))?.get(perfilId);
  if (!cv) return { ok: false, erro: "Sem currículo para resumir." };

  const supabase = await criarClienteServidor();
  const { data: guardado } = await supabase
    .from("resumos_candidato")
    .select("conteudo, curriculo_em")
    .eq("anuncio_id", anuncioId)
    .eq("perfil_id", perfilId)
    .maybeSingle();
  if (guardado && new Date(guardado.curriculo_em).getTime() === new Date(cv.atualizado_em).getTime()) {
    return { ok: true, resumo: guardado.conteudo as ResumoCandidato };
  }

  const { error: limite } = await supabase.rpc("usar_ia_resumo");
  if (limite) return { ok: false, erro: mensagemDeErro(limite) };
  const { data: config } = await supabase.rpc("config_publica");
  const modelo = config?.[0]?.ia_modelo ?? MODELO_PADRAO;

  // a vaga, o que dá para comparar e o currículo; sem nome, foto nem contato
  const { cartoes } = await montarQuadro(anuncio, Date.now());
  const c = cartoes.find((x) => x.perfil_id === perfilId);
  if (!c) return { ok: false, erro: "Candidato não encontrado." };
  const linhas = [
    "<vaga>",
    `Título: ${anuncio.titulo}`,
    `Descrição: ${(anuncio.descricao ?? "").slice(0, 1500)}`,
    "</vaga>",
    "<comparacao>",
    ...c.aderencia.criterios.map(
      (k) =>
        `- ${k.nome}: ${atendeEmParte(k) ? "atende em parte" : k.ok === true ? "atende" : k.ok === false ? "não atende" : "sem informação"} (${k.detalhe})`,
    ),
    "</comparacao>",
    "<curriculo>",
    cv.titulo ? `O que faz: ${cv.titulo}` : "",
    cv.habilidades?.length ? `Habilidades: ${cv.habilidades.join(", ")}` : "",
    `Escolaridade: ${nomeEscolaridade(cv.escolaridade) ?? "não informou"}${cv.curso ? ` · ${cv.curso}` : ""}`,
    `CNH: ${cv.cnh ?? "não tem ou não informou"}`,
    `Pode trabalhar: ${cv.disponibilidade.map(nomeDisponibilidade).join(", ") || "não informou"}`,
    `Cursos: ${cv.cursos.join(", ") || "nenhum"}`,
    "Experiências:",
    ...(cv.experiencias.length
      ? cv.experiencias.map(
          (e) =>
            `- ${e.cargo} em ${e.onde}, de ${e.inicio} até ${e.fim ?? "hoje"}${e.descricao ? `: ${e.descricao}` : ""}`,
        )
      : ["- nenhuma (primeiro emprego)"]),
    "</curriculo>",
    "<respostas>",
    ...(c.respostas.length
      ? c.respostas.map((r) => `- ${r.pergunta}: ${r.resposta || "não respondeu"}`)
      : ["- nenhuma"]),
    "</respostas>",
    c.mensagem ? `<recado>${c.mensagem}</recado>` : "",
  ];

  try {
    const { modelo: usado, ...resumo } = await resumirCandidato(linhas.filter(Boolean).join("\n"), modelo);
    const { error } = await supabase
      .from("resumos_candidato")
      .upsert({
        anuncio_id: anuncioId,
        perfil_id: perfilId,
        curriculo_em: cv.atualizado_em,
        conteudo: resumo,
        modelo: usado,
        criado_em: new Date().toISOString(),
      });
    if (error) console.error(`Publike: o resumo da IA não foi guardado: ${error.message}`);
    return { ok: true, resumo };
  } catch (e) {
    console.error("Publike: o resumo da IA falhou:", e instanceof Error ? e.message : e);
    return { ok: false, erro: "A IA não conseguiu resumir agora. Tente de novo." };
  }
}

/** Convida alguém de Talentos para uma vaga minha: a pessoa recebe o aviso e decide se curte. */
export async function convidarParaVaga(anuncioId: string, perfilId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/talentos" };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("convidar_para_vaga", { p_anuncio: anuncioId, p_perfil: perfilId });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para convidar agora.") };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Convite enviado." };
}

/** "Deixar as empresas me encontrarem": entra ou sai de Talentos. */
export async function mudarVisibilidadeCurriculo(visivel: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/perfil/curriculo" };
  const supabase = await criarClienteServidor();
  const { error } = visivel
    ? await supabase.from("curriculo_visivel").upsert({ perfil_id: usuario.id }, { ignoreDuplicates: true })
    : await supabase.from("curriculo_visivel").delete().eq("perfil_id", usuario.id);
  if (error) {
    return {
      ok: false,
      erro: /foreign key|violates/i.test(error.message)
        ? "Salve o currículo primeiro."
        : mensagemDeErro(error, "Não deu para salvar agora."),
    };
  }
  refresh();
  return {
    ok: true,
    mensagem: visivel
      ? "Pronto: empresas com vagas na sua cidade podem achar seu currículo e convidar você."
      : "Pronto: seu currículo não aparece mais para as empresas.",
  };
}

/**
 * "Aparecer na aba Talentos": o resumo do currículo na busca, aberto a quem visita. Quem
 * aparece na aba também aparece para as empresas (o "Para a sua vaga"); sair das empresas
 * tira da aba (o banco apaga junto).
 */
export async function mudarVitrineCurriculo(ligar: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/perfil/curriculo" };
  const supabase = await criarClienteServidor();
  if (ligar) {
    const visivel = await supabase
      .from("curriculo_visivel")
      .upsert({ perfil_id: usuario.id }, { ignoreDuplicates: true });
    const { error } = visivel.error
      ? visivel
      : await supabase.from("curriculo_na_vitrine").upsert({ perfil_id: usuario.id }, { ignoreDuplicates: true });
    if (error) {
      return {
        ok: false,
        erro: /foreign key|violates/i.test(error.message)
          ? "Salve o currículo primeiro."
          : mensagemDeErro(error, "Não deu para salvar agora."),
      };
    }
  } else {
    const { error } = await supabase.from("curriculo_na_vitrine").delete().eq("perfil_id", usuario.id);
    if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora.") };
  }
  refresh();
  return {
    ok: true,
    mensagem: ligar
      ? "Pronto: você aparece na aba Talentos. Quem visita vê o resumo; as empresas, o currículo completo."
      : "Pronto: você saiu da aba Talentos. As empresas com vaga na sua cidade ainda acham seu currículo.",
  };
}
