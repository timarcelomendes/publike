"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { ETAPAS_CANDIDATO, type EtapaCandidato } from "@/lib/constantes";
import { obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { FORMATOS_ENTREVISTA, preencherModelo } from "@/lib/recrutamento";
import { processarFilas } from "@/lib/servidor/filas";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { temContato, UUID } from "@/lib/validacao";

// Ações do quadro de candidatos e do painel de recrutamento: mover de etapa (um ou
// vários), mandar mensagem pronta para vários, marcar entrevista e as mensagens
// prontas da conta. As regras ficam no banco (responder_curtida, salvar_etapa_candidato,
// enviar_mensagem, marcar_entrevista); aqui só se combina cada passo.

const MAX_DE_UMA_VEZ = 100;

type Falha = { perfil: string; erro: string };
export type ResultadoEmMassa =
  { ok: true; feitos: number; falhas: Falha[]; mensagem: string } | { ok: false; erro: string };

function idsValidos(ids: unknown): string[] {
  return Array.isArray(ids) ? [...new Set(ids.filter((i): i is string => typeof i === "string" && UUID.test(i)))] : [];
}

/**
 * Leva um ou vários candidatos para uma coluna do quadro. Quem espera resposta e vai para
 * Entrevista ou Contratado ganha o match antes (é o que libera o contato); quem vai para
 * "Não seguiu" sem match é dispensado. A anotação de cada um fica como está. Na vaga que
 * pede currículo, quem ainda não mandou fica aceito, esperando o currículo: recebe o
 * pedido, e o match (e a etapa) vêm quando ele chegar.
 */
export async function moverCandidatos(anuncioId: string, perfis: string[], destino: string): Promise<ResultadoEmMassa> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const ids = idsValidos(perfis).slice(0, MAX_DE_UMA_VEZ);
  if (!UUID.test(anuncioId) || !ids.length || !(destino in ETAPAS_CANDIDATO))
    return { ok: false, erro: "Pedido inválido." };
  const etapa = destino as EtapaCandidato;
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();

  const [{ data: curtidas }, { data: etapas }] = await Promise.all([
    supabase.from("curtidas").select("perfil_id, status").eq("anuncio_id", anuncioId).in("perfil_id", ids),
    supabase.rpc("etapas_dos_candidatos", { p_anuncio: anuncioId }),
  ]);
  const notas = new Map((etapas ?? []).map((e) => [e.perfil_id, e.nota]));
  const nomes = new Map<string, string>();
  const falhas: Falha[] = [];
  const aceitos: string[] = [];
  let feitos = 0;

  for (const perfil of ids) {
    const status = curtidas?.find((c) => c.perfil_id === perfil)?.status;
    if (!status) {
      falhas.push({ perfil, erro: "Essa pessoa não se candidatou a esta vaga." });
      continue;
    }
    const decisao =
      etapa === "nao_seguiu"
        ? status === "pendente"
          ? "dispensada"
          : null
        : etapa === "entrevista" || etapa === "contratado"
          ? status === "pendente" || status === "dispensada" || status === "desfeito"
            ? "match"
            : null
          : status === "dispensada"
            ? "pendente"
            : null;
    if (decisao) {
      const { data, error } = await supabase.rpc("responder_curtida", {
        p_anuncio: anuncioId,
        p_perfil: perfil,
        p_decisao: decisao,
      });
      if (error) {
        falhas.push({ perfil, erro: mensagemDeErro(error) });
        continue;
      }
      // aceito, esperando o currículo: a etapa fica para depois do match
      if (data === "aceita") {
        aceitos.push(perfil);
        continue;
      }
    }
    // dispensar já encerra o processo para a pessoa; sem match não há etapa para guardar
    if (!(etapa === "nao_seguiu" && decisao === "dispensada")) {
      const { error } = await supabase.rpc("salvar_etapa_candidato", {
        p_anuncio: anuncioId,
        p_perfil: perfil,
        p_etapa: etapa,
        p_nota: notas.get(perfil) ?? null,
      });
      if (error) {
        falhas.push({ perfil, erro: mensagemDeErro(error) });
        continue;
      }
    }
    feitos++;
  }

  if (falhas.length || aceitos.length) {
    const { data } = await supabase
      .from("perfis")
      .select("id, nome")
      .in("id", [...falhas.map((f) => f.perfil), ...aceitos]);
    for (const p of data ?? []) nomes.set(p.id, p.nome.split(" ")[0]);
  }
  if (feitos || aceitos.length) after(processarFilas);
  refresh();
  const nome = ETAPAS_CANDIDATO[etapa].nome;
  const quemAceitou = aceitos.map((p) => nomes.get(p) ?? "Alguém");
  return {
    ok: true,
    feitos,
    falhas: falhas.map((f) => ({ ...f, perfil: nomes.get(f.perfil) ?? "Alguém" })),
    mensagem: [
      feitos ? `${feitos === 1 ? "1 candidato foi" : `${feitos} candidatos foram`} para ${nome}.` : "",
      quemAceitou.length === 1
        ? `${quemAceitou[0]} recebeu o seu aceite e o pedido do currículo, que esta vaga pede. Quando mandar, dá match e você move para ${nome}.`
        : quemAceitou.length > 1
          ? `${listaDeNomes(quemAceitou)} receberam o seu aceite e o pedido do currículo, que esta vaga pede. Quando mandarem, dá match e você move para ${nome}.`
          : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

/** "Ana", "Ana e Bia", "Ana, Bia e mais 3". */
function listaDeNomes(nomes: string[]) {
  if (nomes.length <= 2) return nomes.join(" e ");
  return `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`;
}

/** Manda a mesma mensagem (com {nome}, {vaga} e {empresa}) para vários candidatos com match. */
export async function mandarMensagemEmMassa(
  anuncioId: string,
  perfis: string[],
  texto: string,
): Promise<ResultadoEmMassa> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const ids = idsValidos(perfis).slice(0, MAX_DE_UMA_VEZ);
  const modelo = typeof texto === "string" ? texto.trim() : "";
  if (!UUID.test(anuncioId) || !ids.length) return { ok: false, erro: "Escolha pelo menos um candidato." };
  if (modelo.length < 5) return { ok: false, erro: "Escreva a mensagem." };
  if (modelo.length > 1800) return { ok: false, erro: "A mensagem passa de 1800 letras." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const [{ data: anuncio }, { data: curtidas }, perfil] = await Promise.all([
    supabase.from("anuncios").select("titulo, autor_id").eq("id", anuncioId).maybeSingle(),
    supabase.from("curtidas").select("perfil_id, status").eq("anuncio_id", anuncioId).in("perfil_id", ids),
    obterMeuPerfil(),
  ]);
  if (!anuncio || anuncio.autor_id !== usuario.id) return { ok: false, erro: "Vaga não encontrada." };
  const { data: pessoas } = await supabase.from("perfis").select("id, nome").in("id", ids);
  const nomeDe = new Map((pessoas ?? []).map((p) => [p.id, p.nome]));

  const falhas: Falha[] = [];
  let feitos = 0;
  for (const id of ids) {
    const nome = nomeDe.get(id) ?? "";
    const status = curtidas?.find((c) => c.perfil_id === id)?.status;
    if (status !== "match") {
      falhas.push({ perfil: nome.split(" ")[0] || "Alguém", erro: "Sem match ainda: a conversa abre com o match." });
      continue;
    }
    const final = preencherModelo(modelo, { nome, vaga: anuncio.titulo, empresa: perfil?.nome ?? "" });
    const { error } = await supabase.rpc("enviar_mensagem", { p_anuncio: anuncioId, p_perfil: id, p_texto: final });
    if (error) falhas.push({ perfil: nome.split(" ")[0] || "Alguém", erro: mensagemDeErro(error) });
    else feitos++;
  }
  if (feitos) after(processarFilas);
  refresh();
  return {
    ok: true,
    feitos,
    falhas,
    mensagem: feitos ? `Mensagem enviada para ${feitos === 1 ? "1 candidato" : `${feitos} candidatos`}.` : "",
  };
}

// ---------------------------------------------------------------- entrevistas

export type DadosEntrevista = {
  anuncioId: string;
  perfilId: string;
  /** "2026-10-22T14:00" no horário de Brasília (o campo datetime-local) */
  quando: string;
  formato: string;
  local: string;
  obs: string;
  duracao: number;
};

/** Marca (ou remarca) a entrevista. Quem ainda não tem match ganha o match antes. */
export async function marcarEntrevista(d: DadosEntrevista): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(d.anuncioId) || !UUID.test(d.perfilId)) return { ok: false, erro: "Pedido inválido." };
  if (!(d.formato in FORMATOS_ENTREVISTA)) return { ok: false, erro: "Escolha como vai ser a entrevista." };
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(d.quando ?? "");
  if (!m) return { ok: false, erro: "Escolha o dia e a hora." };
  // Brasília não tem horário de verão desde 2019: -03:00 o ano todo
  const quando = new Date(`${d.quando}:00-03:00`);
  if (Number.isNaN(quando.getTime())) return { ok: false, erro: "Escolha o dia e a hora." };
  const local = (d.local ?? "").trim().slice(0, 300);
  const obs = (d.obs ?? "").trim().slice(0, 500);
  if (temContato(obs))
    return { ok: false, erro: "Tire telefone e e-mail da observação: o contato já aparece no match." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();

  const { data: curtida } = await supabase
    .from("curtidas")
    .select("status")
    .eq("anuncio_id", d.anuncioId)
    .eq("perfil_id", d.perfilId)
    .maybeSingle();
  if (curtida && curtida.status !== "match") {
    const { data, error } = await supabase.rpc("responder_curtida", {
      p_anuncio: d.anuncioId,
      p_perfil: d.perfilId,
      p_decisao: "match",
    });
    if (error) return { ok: false, erro: mensagemDeErro(error) };
    // vaga que pede currículo e a pessoa ainda não mandou: aceita, mas a entrevista espera o match
    if (data === "aceita") {
      after(processarFilas);
      refresh();
      return {
        ok: false,
        erro: "Esta vaga pede currículo e a pessoa ainda não mandou. Ela foi aceita e recebeu o pedido: quando mandar, dá match e aí você marca a entrevista.",
      };
    }
  }
  const { error } = await supabase.rpc("marcar_entrevista", {
    p_anuncio: d.anuncioId,
    p_perfil: d.perfilId,
    p_quando: quando.toISOString(),
    p_formato: d.formato,
    p_local: d.formato === "telefone" ? null : local,
    p_obs: obs || null,
    p_duracao: Math.min(480, Math.max(10, Math.round(Number(d.duracao) || 30))),
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  after(processarFilas);
  refresh();
  return { ok: true, mensagem: "Entrevista marcada. O candidato recebeu o aviso e a mensagem na conversa." };
}

/** Quem publicou cancela a entrevista ou diz como foi. */
export async function mudarEntrevista(id: string, situacao: "cancelada" | "realizada" | "faltou"): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !["cancelada", "realizada", "faltou"].includes(situacao))
    return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("mudar_entrevista", { p_id: id, p_situacao: situacao });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}

/** O candidato confirma presença ou pede para remarcar. */
export async function responderEntrevista(id: string, resposta: "confirmada" | "remarcar"): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id) || !["confirmada", "remarcar"].includes(resposta)) return { ok: false, erro: "Pedido inválido." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("responder_entrevista", { p_id: id, p_resposta: resposta });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return {
    ok: true,
    mensagem:
      resposta === "confirmada" ? "Presença confirmada." : "Pedido enviado: a empresa vai propor outro horário.",
  };
}

// ---------------------------------------------------------------- mensagens prontas

export async function salvarModeloMensagem(nome: string, texto: string, id?: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const n = (nome ?? "").trim().slice(0, 60);
  const t = (texto ?? "").trim();
  if (n.length < 2) return { ok: false, erro: "Dê um nome à mensagem." };
  if (t.length < 5 || t.length > 1800) return { ok: false, erro: "A mensagem tem de 5 a 1800 letras." };
  if (temContato(t)) return { ok: false, erro: "Tire telefone e e-mail: o contato aparece sozinho no match." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  const supabase = await criarClienteServidor();
  if (id) {
    if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
    const { error } = await supabase.from("modelos_mensagem").update({ nome: n, texto: t }).eq("id", id);
    if (error) return { ok: false, erro: mensagemDeErro(error) };
  } else {
    const { count } = await supabase.from("modelos_mensagem").select("id", { count: "exact", head: true });
    if ((count ?? 0) >= 30)
      return { ok: false, erro: "Você já tem 30 mensagens prontas. Apague uma para criar outra." };
    const { error } = await supabase.from("modelos_mensagem").insert({ nome: n, texto: t });
    if (error) return { ok: false, erro: mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: "Mensagem pronta salva." };
}

export async function apagarModeloMensagem(id: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.from("modelos_mensagem").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}
