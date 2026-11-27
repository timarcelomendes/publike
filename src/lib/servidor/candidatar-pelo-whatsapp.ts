import "server-only";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { LIMITES_EXTRA, perguntasDoBanco, type Pergunta } from "@/lib/vaga-extra";
import { caminhoDeEntrar } from "./entrar-pelo-whatsapp";

// Candidatar-se pelo WhatsApp (25/11/2026, migração 20270927120000; Marcelo, com o que o mercado já tem: a Gupy faz a
// inscrição em um toque, sem login, com a pré-entrevista na conversa). Depois das vagas da busca vai "Quer se
// candidatar a alguma?", com um botão por vaga (até 3). O toque começa a candidatura: as perguntas da vaga, uma de cada
// vez (sim ou não e as opções curtas em botões; o resto escrito ou falado), o nome (só quando o número não tem conta e
// o nome do WhatsApp não serve) e a curtida, feita no banco pela conta do número, com as regras do site.

export const PAYLOAD_QUERO = /^c:quero:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
/** A resposta em botão da pergunta da vez: sim, não, pular ou a opção (o índice). */
export const PAYLOAD_RESPOSTA = /^c:resp:(sim|nao|pular|\d{1,2})$/;
/** As marcas das mensagens: a resposta escrita seguinte é lida como a resposta da pergunta, ou o nome. */
export const MARCA_DA_PERGUNTA = "Pergunta da empresa";
export const MARCA_DO_NOME = "Para mandar a sua candidatura, qual é o seu nome completo?";
export const QUER_SE_CANDIDATAR =
  "Quer se candidatar a alguma? Toque na vaga que eu mando a sua candidatura daqui mesmo, sem precisar entrar no site. 😊";

export type Contexto = {
  banco: ClienteBanco;
  chave: string;
  conversa: string;
  numero: string;
  /** o nome do perfil do WhatsApp */
  nomeDoWhatsapp: string | null;
};
export type Resposta = {
  texto: string;
  botoes?: { id: string; titulo: string }[];
  botao?: { titulo: string; caminho: string } | null;
};

type Conta = { existe: boolean; tipo?: string | null; nome?: string | null; tem_curriculo?: boolean };
type Estado = { anuncio_id: string; vez: number; respostas: Record<string, string>; perguntas: unknown; titulo: string; conta: Conta };

const cortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

/** O botão de cada vaga (até 3), com o título curto e sem repetir. */
export function botoesDasVagas(vagas: { id: string; titulo: string }[]) {
  const usados = new Set<string>();
  return vagas.slice(0, 3).map((v, i) => {
    let titulo = cortar(v.titulo.replace(/\s+/g, " ").trim() || `Vaga ${i + 1}`, 20);
    if (usados.has(titulo)) titulo = cortar(`${i + 1}. ${titulo}`, 20);
    usados.add(titulo);
    return { id: `c:quero:${v.id}`, titulo };
  });
}

/** A mensagem depois das vagas da busca. null: nenhuma vaga para tocar. */
export function mensagemParaCandidatar(vagas: { id: string; titulo: string }[]): Resposta | null {
  const botoes = botoesDasVagas(vagas);
  if (!botoes.length) return null;
  const outras = vagas.length > botoes.length ? " Para as outras, toque no link de cada uma." : "";
  return { texto: `${QUER_SE_CANDIDATAR}${outras}`, botoes };
}

/** O nome do WhatsApp serve como o nome da pessoa? ("Maria Souza" sim; "🌸Ju🌸", "Loja do Zé", "." não) */
export function nomeServe(nome: string | null | undefined) {
  const n = (nome ?? "").replace(/\s+/g, " ").trim();
  return (
    /^[\p{L}][\p{L}'. -]{1,58}[\p{L}.]$/u.test(n) &&
    !/\b(loja|empresa|ltda|me|eireli|com[eé]rcio|vagas?|rh|recrutamento|consultoria|oficial)\b/i.test(n)
  );
}
const nomeLimpo = (nome: string) =>
  nome
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_, s: string, l: string) => s + l.toUpperCase())
    .replace(/\s(D[aeo]s?|E)\s/g, (x) => x.toLowerCase());

/** A pergunta da vez, com os botões que cabem. */
export function textoDaPergunta(perguntas: Pergunta[], vez: number, antes = ""): Resposta {
  const p = perguntas[vez];
  const cabeca = `${antes}📝 *${MARCA_DA_PERGUNTA}* (${vez + 1} de ${perguntas.length}): ${p.nome}`;
  const pular = p.obrigatoria ? "" : " Se preferir não responder, escreva *pular*.";
  if (p.tipo === "sim_nao")
    return {
      texto: cabeca,
      botoes: [
        { id: "c:resp:sim", titulo: "Sim" },
        { id: "c:resp:nao", titulo: "Não" },
        ...(p.obrigatoria ? [] : [{ id: "c:resp:pular", titulo: "Pular" }]),
      ],
    };
  if (p.tipo === "opcoes") {
    const cabem = p.opcoes.length <= (p.obrigatoria ? 3 : 2) && p.opcoes.every((o) => o.length <= 20);
    if (cabem)
      return {
        texto: cabeca,
        botoes: [
          ...p.opcoes.map((o, i) => ({ id: `c:resp:${i}`, titulo: o })),
          ...(p.obrigatoria ? [] : [{ id: "c:resp:pular", titulo: "Pular" }]),
        ],
      };
    return {
      texto: `${cabeca}\n\n${p.opcoes.map((o, i) => `*${i + 1}.* ${o}`).join("\n")}\n\nResponda com o número da opção.${pular}`,
    };
  }
  if (p.tipo === "numero") return { texto: `${cabeca}\n\nResponda com um número.${pular}` };
  return { texto: `${cabeca}\n\nPode escrever ou mandar áudio.${pular}` };
}

const simples = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * O valor da resposta, pela pergunta: "sim"/"nao", a opção, o número ou o texto. "" é o pulo (só na opcional); null:
 * não deu para entender.
 */
export function valorDaResposta(p: Pergunta, payload: string | null, texto: string): string | null {
  const botao = payload ? PAYLOAD_RESPOSTA.exec(payload)?.[1] : null;
  const t = simples(texto);
  if (botao === "pular" || (!botao && /^(pular|pula|prefiro nao responder|nao quero responder)$/.test(t)))
    return p.obrigatoria ? null : "";
  if (p.tipo === "sim_nao") {
    if (botao === "sim" || /^(sim|s|tenho|posso|claro|com certeza|sim tenho|sim posso)\b/.test(t)) return "sim";
    if (botao === "nao" || /^(nao|n|nao tenho|nao posso)\b/.test(t)) return "nao";
    return null;
  }
  if (p.tipo === "opcoes") {
    const i = botao && /^\d+$/.test(botao) ? Number(botao) : /^\d{1,2}$/.test(t) ? Number(t) - 1 : -1;
    if (i >= 0 && i < p.opcoes.length) return p.opcoes[i];
    return p.opcoes.find((o) => simples(o) === t) ?? p.opcoes.find((o) => t.length >= 3 && simples(o).includes(t)) ?? null;
  }
  if (p.tipo === "numero") {
    const n = /(\d+(?:[.,]\d+)?)/.exec(texto)?.[1];
    if (n) return String(Number(n.replace(",", ".")));
    if (/^(nenhum|nenhuma|zero)\b/.test(t)) return "0";
    return null;
  }
  const livre = texto.replace(/\s+/g, " ").trim().slice(0, LIMITES_EXTRA.resposta);
  return livre.length >= 1 ? livre : null;
}

function estadoDe(data: unknown): Estado | null {
  if (!data || typeof data !== "object") return null;
  const e = data as Estado;
  return e.anuncio_id ? { ...e, respostas: e.respostas ?? {}, conta: e.conta ?? { existe: false } } : null;
}

/** O próximo passo: a pergunta da vez, o nome ou a candidatura. */
async function proximoPasso(ctx: Contexto, e: Estado, antes = ""): Promise<Resposta> {
  const perguntas = perguntasDoBanco(e.perguntas);
  if (e.vez < perguntas.length) return textoDaPergunta(perguntas, e.vez, antes);
  // o nome só importa sem a conta (ou sem o perfil): o do WhatsApp, se serve; senão, a pergunta
  const precisaNome = !e.conta.existe || !e.conta.tipo;
  const nome = precisaNome && nomeServe(ctx.nomeDoWhatsapp) ? nomeLimpo(ctx.nomeDoWhatsapp!) : null;
  if (precisaNome && !nome) return { texto: `${antes}${MARCA_DO_NOME} _Ex.: Maria da Silva._` };
  return candidatar(ctx, nome);
}

/** A mensagem do erro da candidatura (e da vaga que não dá para candidatar daqui). */
function respostaDoErro(erro: string | undefined, titulo: string | undefined, anuncioId: string | null, mensagem?: string): Resposta {
  const vaga = titulo ? `*${titulo}*` : "essa vaga";
  const verAVaga = anuncioId ? { titulo: "Ver a vaga", caminho: `/anuncio/${anuncioId}` } : null;
  switch (erro) {
    case "ja":
      return { texto: `Você já se candidatou a ${vaga}. ✅ Se a empresa aceitar, eu te aviso aqui.` };
    case "nao_achou":
      return { texto: "Essa vaga saiu do ar. 😕 Quer que eu procure outras? Me conta o que você faz e o bairro onde mora." };
    case "preenchida":
      return { texto: `A vaga de ${vaga} já foi preenchida. 😕 Quer que eu procure outras? Me conta o que você faz e o bairro onde mora.` };
    case "site":
      return { texto: `A vaga de ${vaga} recebe os candidatos no site da empresa. Toque em *Ver a vaga* para se candidatar por lá.`, botao: verAVaga };
    case "propria":
      return { texto: "Essa vaga é sua. 😊 Para ver quem se candidatou, entre no Publike." };
    case "tipo":
      return {
        texto: "Este WhatsApp está numa conta de quem contrata no Publike, e ela não se candidata a vagas. Para se candidatar, use o site com a sua conta pessoal.",
        botao: verAVaga,
      };
    case "suspensa":
      return { texto: "Não consegui mandar a sua candidatura. Para falar com a equipe, escreva *equipe*." };
    case "bloqueado":
    case "limite":
      return { texto: mensagem || "Não consegui mandar a sua candidatura agora. 😕", botao: null };
    case "preenchida_agora":
      return { texto: `A vaga de ${vaga} acabou de ser preenchida. 😕` };
    default:
      return {
        texto: `Não consegui mandar a sua candidatura agora. 😕 Toque em *Ver a vaga* para se candidatar pelo site.`,
        botao: verAVaga,
      };
  }
}

/** A vaga pede o currículo (o "Pedir currículo" de quem publicou)? Na dúvida, não. */
async function vagaPedeCurriculo(ctx: Contexto, anuncio: string | undefined) {
  if (!anuncio) return false;
  const { data } = await ctx.banco.from("anuncios").select("pede_curriculo").eq("id", anuncio).maybeSingle();
  return data?.pede_curriculo === true;
}

/** O pedido do currículo depois da candidatura: mandar o pronto aqui mesmo, ou fazer junto por áudio. */
export function pedidoDoCurriculo(pede: boolean) {
  return [
    pede ? "📄 *Esta vaga pede o currículo.*" : "📄 A empresa decide mais rápido quando vê o currículo.",
    "Já tem o seu pronto? Mande aqui o PDF ou uma foto de cada página, que ele vai junto com a sua candidatura.",
    "Não tem? Escreva *currículo* que a gente faz junto, aqui mesmo, por áudio.",
  ].join(" ");
}

/** A curtida, no banco, pela conta do número (ou a nova); a resposta do fim. */
async function candidatar(ctx: Contexto, nome: string | null): Promise<Resposta> {
  const { data, error } = await ctx.banco.rpc("servidor_whatsapp_candidatar", {
    p_chave: ctx.chave,
    p_conversa: ctx.conversa,
    p_nome: nome,
  });
  if (error) {
    console.error("Publike: a candidatura pelo WhatsApp não saiu:", error.message);
    return respostaDoErro("falhou", undefined, null);
  }
  const r = (data ?? {}) as {
    ok?: boolean;
    erro?: string;
    mensagem?: string;
    status?: string;
    titulo?: string;
    anuncio_id?: string;
    conta_nova?: boolean;
    tem_curriculo?: boolean;
  };
  if (!r.ok) {
    if (r.erro === "falta_nome") return { texto: `${MARCA_DO_NOME} _Ex.: Maria da Silva._` };
    if (r.erro === "falhou" || r.erro === "perguntas" || r.erro === "sem_candidatura")
      console.error("Publike: a candidatura pelo WhatsApp foi recusada:", r.erro, r.mensagem);
    const dica = r.erro === "preenchida" ? "preenchida_agora" : r.erro === "contato_no_texto" ? "falhou" : r.erro;
    return respostaDoErro(dica, r.titulo, r.anuncio_id ?? null, r.mensagem);
  }
  const titulo = r.titulo ? `*${r.titulo}*` : "a vaga";
  const avisos = "Eu te aviso aqui no WhatsApp quando a empresa responder (para parar os avisos, é só escrever *PARAR*).";
  // sem currículo: o pedido claro (a vaga que pede diz que pede), com os dois caminhos, mandar o pronto ou fazer junto
  // (27/11/2026; Marcelo: "deixar claro que a vaga exige o currículo, já pedindo que envie... ou a gente faz junto")
  const curriculo = r.tem_curriculo ? "" : `\n\n${pedidoDoCurriculo(await vagaPedeCurriculo(ctx, r.anuncio_id))}`;
  if (r.status === "match") {
    // contato direto: a empresa já recebeu o contato; o dela fica no Publike (o link entra com um toque)
    const destino = `/anuncio/${r.anuncio_id}`;
    const caminho = (await caminhoDeEntrar(ctx.numero, destino).catch(() => null)) ?? destino;
    return {
      texto: `Pronto! ✅ Você se candidatou a ${titulo}. Essa vaga é de contato direto: a empresa já recebeu o seu WhatsApp e pode te chamar. Toque em *Ver o contato* para falar com ela também.${curriculo}`,
      botao: { titulo: "Ver o contato", caminho },
    };
  }
  return { texto: `Pronto! ✅ Mandei a sua candidatura para ${titulo}. ${avisos}${curriculo}` };
}

/**
 * O toque em "Quer se candidatar?": começa a candidatura. null: o recurso desligado ou sem a migração (o atendimento
 * segue como antes).
 */
export async function comecarCandidatura(ctx: Contexto, anuncioId: string): Promise<Resposta | null> {
  const { data, error } = await ctx.banco.rpc("servidor_whatsapp_vaga_para_candidatar", {
    p_chave: ctx.chave,
    p_conversa: ctx.conversa,
    p_anuncio: anuncioId,
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: a candidatura pelo WhatsApp não começou:", error.message);
    return null;
  }
  const r = (data ?? {}) as { ligado?: boolean; ok?: boolean; erro?: string; titulo?: string } & Partial<Estado>;
  if (!r.ligado) return null;
  if (!r.ok) return respostaDoErro(r.erro, r.titulo, anuncioId);
  const perguntas = perguntasDoBanco(r.perguntas);
  const antes = perguntas.length
    ? `Ótimo! Para se candidatar a *${r.titulo}*, a empresa quer saber ${perguntas.length === 1 ? "uma coisa" : `${perguntas.length} coisas`}.\n\n`
    : "";
  return proximoPasso(
    ctx,
    { anuncio_id: anuncioId, vez: 0, respostas: {}, perguntas: r.perguntas, titulo: r.titulo ?? "", conta: r.conta ?? { existe: false } },
    antes,
  );
}

/**
 * A resposta dentro da candidatura: o botão da pergunta, a resposta escrita (ou falada) depois da pergunta e o nome.
 * null: não é da candidatura (o atendimento segue).
 */
export async function respostaNaCandidatura(
  ctx: Contexto,
  m: { payload: string | null; texto: string; minhaUltima: string },
): Promise<Resposta | null> {
  const botao = m.payload && PAYLOAD_RESPOSTA.test(m.payload) ? m.payload : null;
  // o áudio chega transcrito, com o "🎤" na frente
  const escrito = m.texto.replace(/^\s*🎤\s*/u, "").replace(/\s+/g, " ").trim();
  const respondeuAPergunta = Boolean(botao) || (!m.payload && Boolean(escrito) && m.minhaUltima.includes(MARCA_DA_PERGUNTA));
  const respondeuONome = !m.payload && Boolean(escrito) && m.minhaUltima.includes(MARCA_DO_NOME);
  if (!respondeuAPergunta && !respondeuONome) return null;
  // a pergunta para o Publike, no meio: segue o atendimento (a candidatura continua esperando)
  if (!botao && escrito.includes("?")) return null;
  if (!botao && /^(cancelar|cancela|desisto|desistir|nao quero mais)$/.test(simples(escrito))) {
    await ctx.banco.rpc("servidor_whatsapp_candidatura_cancelar", { p_chave: ctx.chave, p_conversa: ctx.conversa });
    return { texto: "Tudo bem, cancelei essa candidatura. Quando quiser ver outras vagas, é só me dizer o que você faz e o bairro. 😊" };
  }
  const { data, error } = await ctx.banco.rpc("servidor_whatsapp_candidatura_da_vez", {
    p_chave: ctx.chave,
    p_conversa: ctx.conversa,
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: a candidatura da vez não foi lida:", error.message);
    return null;
  }
  const e = estadoDe(data);
  if (!e) return null;
  if (respondeuONome) {
    if (!nomeServe(escrito)) return { texto: `Me diga só o seu nome completo, por favor. ${MARCA_DO_NOME} _Ex.: Maria da Silva._` };
    return candidatar(ctx, nomeLimpo(escrito));
  }
  const perguntas = perguntasDoBanco(e.perguntas);
  const p = perguntas[e.vez];
  if (!p) return proximoPasso(ctx, e);
  const valor = valorDaResposta(p, botao, escrito);
  if (valor === null)
    return textoDaPergunta(perguntas, e.vez, "Não entendi a resposta. 😅 Se quiser desistir da candidatura, escreva *cancelar*.\n\n");
  const { data: depois, error: erroResp } = await ctx.banco.rpc("servidor_whatsapp_candidatura_responder", {
    p_chave: ctx.chave,
    p_conversa: ctx.conversa,
    p_pergunta: p.id,
    p_valor: valor,
  });
  if (erroResp) {
    console.error("Publike: a resposta da candidatura não foi guardada:", erroResp.message);
    return respostaDoErro("falhou", e.titulo, e.anuncio_id);
  }
  const e2 = estadoDe(depois);
  return e2 ? proximoPasso(ctx, e2) : null;
}
