"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { categoria as categoriaDe, ETAPAS_CANDIDATO, etapasPermitidas, type EtapaCandidato } from "@/lib/constantes";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { mensagemDeErro, precisaCompletarPerfil } from "@/lib/erros";
import { marcarConversao } from "@/lib/servidor/conversao";
import { processarFilas } from "@/lib/servidor/filas";
import { lerCandidatosNovos } from "@/lib/servidor/triagem-automatica";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm, Resultado } from "@/lib/tipos";
import { lerDesfazerMatch, temContato, UUID } from "@/lib/validacao";
import { lerRespostas, perguntasDoBanco, type Respostas } from "@/lib/vaga-extra";
import { salvarBusca } from "./buscas";

const RESPONDER = (anuncioId: string) => `/anuncio/${anuncioId}?responder=1`;

/** O aviso de vaga nova ligado sozinho na primeira curtida (o balão mostra e deixa parar). */
export type AvisoLigado = { id: number; area: string };
export type ResultadoCurtida = Resultado & { aviso?: AvisoLigado | null };

// uma vez por navegador: quem parou o aviso (ou já tinha busca com aviso) não ganha outro
const COOKIE_AVISO_AUTO = "publike_aviso_auto";

/**
 * Na primeira curtida de vaga de uma pessoa sem nenhuma busca com aviso: liga o aviso de vaga nova da área da
 * vaga, perto de onde ela mora (o mesmo `salvarBusca` do "Me avise"). Vaga em "Outros" não liga (não há área).
 */
async function avisoDaPrimeiraCurtida(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  categoria: string | null,
): Promise<AvisoLigado | null> {
  const jar = await cookies();
  if (jar.get(COOKIE_AVISO_AUTO) || !categoria || categoria === "outros") return null;
  const perfil = await obterMeuPerfil().catch(() => null);
  if (perfil?.tipo !== "pessoa") return null;
  const marcar = () => jar.set(COOKIE_AVISO_AUTO, "1", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const { count } = await supabase.from("buscas_salvas").select("id", { count: "exact", head: true });
  if (count === null || count > 0) {
    if (count) marcar();
    return null;
  }
  const r = await salvarBusca(`/?tipo=vaga&categoria=${categoria}`);
  if (!r.ok || !r.id) return null;
  marcar();
  return { id: r.id, area: categoriaDe(categoria).nome };
}

/**
 * Curtir = "tenho interesse". Se a vaga tem perguntas, as respostas vão junto. Sem elas
 * (curtiu pelo cartão ou pelo Descobrir) e com pergunta obrigatória, leva à página da vaga.
 */
export async function curtirAnuncio(
  anuncioId: string,
  mensagem: string | null = null,
  respostasBrutas: Respostas | null = null,
): Promise<ResultadoCurtida> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Anúncio não encontrado." };
  const voltar = `/anuncio/${anuncioId}`;
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre para curtir.", ir: `/entrar?next=${encodeURIComponent(voltar)}` };

  const texto = (mensagem ?? "").trim().slice(0, 280) || null;
  if (temContato(texto)) {
    return { ok: false, erro: "Tire o telefone ou e-mail da mensagem. O contato aparece sozinho quando der match." };
  }

  const supabase = await criarClienteServidor();
  const { data: alvo } = await supabase
    .from("anuncios")
    .select("perguntas, tipo, categoria")
    .eq("id", anuncioId)
    .maybeSingle();
  const perguntas = perguntasDoBanco(alvo?.perguntas);
  let respostas: Respostas = {};
  if (perguntas.length) {
    const lidas = lerRespostas(perguntas, respostasBrutas ?? {});
    if (!lidas.ok) {
      return respostasBrutas
        ? { ok: false, erro: lidas.erro }
        : { ok: false, erro: "A empresa fez perguntas para esta vaga. Responda para curtir.", ir: RESPONDER(anuncioId) };
    }
    respostas = lidas.respostas;
  }
  const { error } = await supabase.from("curtidas").insert({ anuncio_id: anuncioId, mensagem: texto, respostas });
  if (error) {
    if (error.hint === "perguntas") return { ok: false, erro: mensagemDeErro(error), ir: RESPONDER(anuncioId) };
    if (precisaCompletarPerfil(error) || error.code === "23503") {
      return {
        ok: false,
        erro: "Complete seu perfil com um WhatsApp para curtir.",
        ir: `/perfil?completar=1&next=${encodeURIComponent(voltar)}`,
      };
    }
    if (error.code === "23505") {
      refresh();
      return { ok: true };
    }
    if (error.code === "42501")
      return { ok: false, erro: "Este anúncio não pode ser curtido (é seu ou já saiu do ar)." };
    return { ok: false, erro: mensagemDeErro(error) };
  }

  after(processarFilas);
  // a Triagem com IA lê a candidatura logo (só na vaga de quem tem o recurso; o banco confere)
  if (alvo?.tipo === "vaga") after(() => lerCandidatosNovos(3));
  // candidatura a vaga vale para a campanha (Google Ads)
  if (alvo?.tipo === "vaga") await marcarConversao("candidatura");
  refresh();
  // contato direto: a curtida já virou match
  const { data: feita } = await supabase
    .from("curtidas")
    .select("status")
    .eq("anuncio_id", anuncioId)
    .eq("perfil_id", usuario.id)
    .maybeSingle();
  // primeira curtida de vaga: o aviso de vaga nova da mesma área já vem ligado
  const aviso = alvo?.tipo === "vaga" ? await avisoDaPrimeiraCurtida(supabase, alvo.categoria).catch(() => null) : null;
  if (feita?.status === "match") {
    return { ok: true, mensagem: "Deu match! O contato já está liberado: chame no WhatsApp.", aviso };
  }
  return {
    ok: true,
    mensagem: "Pronto! Agora quem publicou decide se aceita. Se aceitar, vocês se conectam e o contato aparece no seu painel.",
    aviso,
  };
}

/** O candidato muda as respostas às perguntas da vaga (enquanto a curtida está de pé). */
export async function responderPerguntas(anuncioId: string, respostasBrutas: Respostas): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Anúncio não encontrado." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=/anuncio/${anuncioId}` };
  const supabase = await criarClienteServidor();
  const { data: alvo } = await supabase.from("anuncios").select("perguntas").eq("id", anuncioId).maybeSingle();
  const lidas = lerRespostas(perguntasDoBanco(alvo?.perguntas), respostasBrutas);
  if (!lidas.ok) return { ok: false, erro: lidas.erro };
  const { error } = await supabase.rpc("responder_perguntas", { p_anuncio: anuncioId, p_respostas: lidas.respostas });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Respostas salvas." };
}

/** Desfaz a curtida enquanto ainda não houve resposta. */
export async function descurtirAnuncio(anuncioId: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Anúncio não encontrado." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("curtidas")
    .delete()
    .eq("anuncio_id", anuncioId)
    .eq("perfil_id", usuario.id)
    .select("anuncio_id");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  if (!data?.length) return { ok: false, erro: "Essa curtida já teve resposta e não pode ser desfeita." };

  refresh();
  return { ok: true };
}

/** Quem publicou responde: dar match, dispensar ou desfazer a resposta. */
export async function responderCurtida(
  anuncioId: string,
  perfilId: string,
  decisao: "match" | "dispensada" | "pendente",
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId) || !["match", "dispensada", "pendente"].includes(decisao)) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=/painel" };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("responder_curtida", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_decisao: decisao,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };

  if (decisao === "match") after(processarFilas);
  refresh();
  // vaga que pede currículo e a pessoa ainda não mandou: o aceite fica guardado e ela
  // recebe o pedido; o match sai sozinho quando o currículo chegar (o cartão mostra isso)
  if (data === "aceita") return { ok: true };
  if (decisao === "match") return { ok: true, mensagem: "Deu match! Agora é só conversar." };
  return { ok: true };
}

/**
 * Um dos lados desiste do match. Precisa de motivo e justificativa: a outra
 * pessoa vê o motivo; a justificativa fica só para a equipe. O contato some
 * para os dois na hora.
 */
export async function desfazerMatch(_anterior: EstadoForm, formData: FormData): Promise<EstadoForm> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const leitura = lerDesfazerMatch(formData);
  if (!leitura.ok) return { ok: false, erro: "Confira os campos marcados.", erros: leitura.erros };
  const d = leitura.dados;
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta para continuar." };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("desfazer_match", {
    p_anuncio: d.anuncio,
    p_perfil: d.perfil,
    p_motivo: d.motivo,
    p_justificativa: d.justificativa,
    p_futuro: d.futuro === "sim",
  });
  if (error) {
    const campo =
      error.hint === "motivo" || error.hint === "justificativa" || error.hint === "futuro" ? error.hint : null;
    const erro = mensagemDeErro(error, "Não foi possível desfazer o match agora.");
    return campo ? { ok: false, erro, erros: { [campo]: erro } } : { ok: false, erro };
  }

  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Match desfeito. O contato não aparece mais para nenhum dos dois." };
}

/** "Não quero mais negociar com X" (ou desfazer isso). Só com quem já houve curtida. */
export async function bloquearPessoa(outroId: string, bloquear: boolean): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(outroId)) return { ok: false, erro: "Pessoa não encontrada." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("bloquear_pessoa", { p_outro: outroId, p_bloquear: bloquear });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return {
    ok: true,
    mensagem: bloquear
      ? "Pronto. Essa pessoa não consegue mais procurar você."
      : "Desbloqueado. Vocês podem negociar de novo.",
  };
}

/** Curtir de novo um anúncio cujo match foi desfeito (se quem publicou não bloqueou). */
export async function curtirDeNovo(anuncioId: string, mensagem: string | null = null): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Anúncio não encontrado." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=/anuncio/${anuncioId}` };
  const texto = (mensagem ?? "").trim().slice(0, 280) || null;
  if (temContato(texto)) {
    return { ok: false, erro: "Tire o telefone ou e-mail da mensagem. O contato aparece sozinho quando der match." };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("curtir_de_novo", { p_anuncio: anuncioId, p_mensagem: texto });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não foi possível curtir de novo agora.") };
  after(processarFilas);
  refresh();
  const { data: feita } = await supabase
    .from("curtidas")
    .select("status")
    .eq("anuncio_id", anuncioId)
    .eq("perfil_id", usuario.id)
    .maybeSingle();
  if (feita?.status === "match") return { ok: true, mensagem: "Deu match de novo! O contato já está liberado." };
  return { ok: true, mensagem: "Pronto! Se a outra pessoa topar, dá match de novo." };
}

/** Quem publicou a vaga muda a etapa e a anotação de um interessado (só ele vê). */
export async function salvarEtapaCandidato(
  anuncioId: string,
  perfilId: string,
  etapa: string,
  nota: string | null,
): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(anuncioId) || !UUID.test(perfilId) || !(etapa in ETAPAS_CANDIDATO)) {
    return { ok: false, erro: "Pedido inválido." };
  }
  const texto = typeof nota === "string" ? nota.trim() : "";
  if (texto.length > 1000) return { ok: false, erro: "A anotação passa de 1000 letras." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: `/entrar?next=/painel/anuncio/${anuncioId}` };

  const supabase = await criarClienteServidor();
  // Entrevista e Contratado (no serviço, Orçamento, Agendado e Concluído) só depois do
  // match; dispensado ou match desfeito não muda de etapa. Só a anotação continua livre.
  const [{ data: curtida }, { data: anuncio }] = await Promise.all([
    supabase
      .from("curtidas")
      .select("status, aceita_em")
      .eq("anuncio_id", anuncioId)
      .eq("perfil_id", perfilId)
      .maybeSingle(),
    supabase.from("anuncios").select("tipo").eq("id", anuncioId).maybeSingle(),
  ]);
  if (!curtida || !anuncio) return { ok: false, erro: "Essa pessoa não curtiu um anúncio seu." };
  if (!etapasPermitidas(anuncio.tipo, curtida.status).includes(etapa as EtapaCandidato)) {
    const { data: atuais } = await supabase.rpc("etapas_dos_candidatos", { p_anuncio: anuncioId });
    const atual = atuais?.find((l) => l.perfil_id === perfilId)?.etapa ?? "novo";
    if (atual !== etapa) {
      const servico = anuncio.tipo === "servico";
      return {
        ok: false,
        erro:
          curtida.status === "pendente"
            ? servico
              ? "Aceite o pedido primeiro: orçamento, agendamento e conclusão vêm depois."
              : curtida.aceita_em
                ? "Falta o currículo: entrevista e contratação vêm depois do match, assim que ele chegar."
                : "Aceite primeiro: entrevista e contratação vêm depois do match."
            : `Essa pessoa não está mais no processo ${servico ? "deste serviço" : "desta vaga"}.`,
      };
    }
  }
  const { error } = await supabase.rpc("salvar_etapa_candidato", {
    p_anuncio: anuncioId,
    p_perfil: perfilId,
    p_etapa: etapa,
    p_nota: texto || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  // etapa nova: o aviso por e-mail para quem curtiu sai pela fila
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Salvo." };
}
