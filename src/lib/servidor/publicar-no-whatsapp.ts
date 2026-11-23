import "server-only";
import type { RascunhoConvite } from "@/lib/convites";
import { anuncioRepetido, mensagemDeErro } from "@/lib/erros";
import type { ClienteBanco } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/tipos-banco";
import { lerAnuncio, registroDoAnuncio } from "@/lib/validacao";
import { ajustarErros, completarAnuncio } from "./completar-anuncio";

// Publicar a vaga dentro do WhatsApp (23/11/2026, migração 20270914120000; Marcelo: "pode"). De 19 a 22/11, nenhuma
// vaga preparada pelo WhatsApp foi publicada: quem respondeu tudo abria o link e parava no entrar e no perfil do site.
// Agora a vaga preparada (uma só) vem com "Sim, publicar": o servidor monta o formulário do site com a vaga lida, confere
// com as mesmas regras (`completarAnuncio` e `lerAnuncio`) e o banco publica na conta do celular, ou numa conta nova
// com o login pelo WhatsApp e o nome da empresa. O que não passa nas regras vai para o site, com o link de antes.

/** Os botões da vaga preparada (até 20 letras cada; o token tem 64). */
export const botoesDaVagaPreparada = (token: string) => [
  { id: `a:publicar:${token}`, titulo: "Sim, publicar" },
  { id: `a:conferir:${token}`, titulo: "Conferir no site" },
  { id: "a:trabalho", titulo: "Procuro emprego" },
];
export const PAYLOAD_PUBLICAR = /^a:publicar:([0-9a-f]{64})$/;
/** O anúncio com várias vagas (migração 20270916140000): o token da primeira; o lote vem do banco. */
export const botoesDoLotePreparado = (token: string, n: number) => [
  { id: `a:lote:${token}`, titulo: `Sim, publicar as ${n}`.slice(0, 20) },
  { id: `a:conferir_lote:${token}`, titulo: "Conferir no site" },
  { id: "a:trabalho", titulo: "Procuro emprego" },
];
export const PAYLOAD_LOTE = /^a:lote:([0-9a-f]{64})$/;
/** Com a pergunta do lugar (migração 20270916150000): conferir no site ou "Procuro emprego"; a resposta é escrita. */
export const botoesDoLugar = (token: string, n: number) => [
  { id: n > 1 ? `a:conferir_lote:${token}` : `a:conferir:${token}`, titulo: "Conferir no site" },
  { id: "a:trabalho", titulo: "Procuro emprego" },
];
export const PAYLOAD_CONFERIR_LOTE = /^a:conferir_lote:([0-9a-f]{64})$/;
export const PAYLOAD_CONFERIR = /^a:conferir:([0-9a-f]{64})$/;

/** A pergunta do nome, quando o número ainda não tem conta (a resposta seguinte é o nome). */
export const PERGUNTA_DO_NOME =
  "Última coisa: qual é o nome da empresa? É o nome que aparece na vaga para os candidatos. Se for para a sua casa, pode mandar o seu nome.";
export const MARCA_DA_PERGUNTA_DO_NOME = "qual é o nome da empresa?";

/** Dá para tentar publicar aqui: o cargo e o bairro vieram (sem o bairro, a vaga não tem lugar no mapa). */
export function podePublicarAqui(v: RascunhoConvite) {
  return (v.titulo ?? "").trim().length >= 5 && Boolean((v.bairro ?? "").trim()) && Boolean((v.cidade ?? "").trim());
}

/**
 * O nome da empresa (o que a pessoa escreveu, ou o lido no anúncio): 2 a 80 letras, sem telefone, e-mail ou link.
 * `null`: não serve.
 */
export function nomeDaEmpresa(bruto: string | null | undefined): string | null {
  const n = (bruto ?? "")
    .replace(/\s+/g, " ")
    // "Nome: Padaria Pão Quente", "É Padaria Pão Quente"
    .replace(/^(nome da empresa|nome|empresa)\s*[:\-–]\s*/i, "")
    .replace(/^é\s+/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  if (n.length < 2 || n.length > 80) return null;
  if (!/\p{L}{2}/u.test(n)) return null;
  if (/\d{6,}/.test(n.replace(/[\s().-]/g, "")) || /@|https?:|www\.|\.com\b/i.test(n)) return null;
  if (n.endsWith("?")) return null;
  return n;
}

/** O formulário do publicar do site, preenchido com a vaga lida (os mesmos nomes de campo do `lerAnuncio`). */
export function formularioDaVagaLida(r: RascunhoConvite): FormData {
  const f = new FormData();
  const preencher = (k: string, v: string | number | null | undefined) => {
    if (v != null && String(v).trim() !== "") f.set(k, String(v));
  };
  const numero = (n: number | null | undefined) => (n == null ? null : String(n).replace(".", ","));
  f.set("tipo", "vaga");
  preencher("titulo", r.titulo);
  preencher("descricao", r.descricao);
  preencher("categoria", r.categoria);
  preencher("regime", r.regime);
  if (r.salario == null) f.set("combinar", "on");
  else {
    preencher("pagamento_valor", numero(r.salario));
    preencher("pagamento_ate", numero(r.salario_ate));
  }
  f.set("pagamento_unidade", r.salario != null ? r.unidade || "mes" : "mes");
  for (const b of r.beneficios ?? []) if (b) f.append("beneficios_lista", b);
  if (r.beneficios_extras?.length) {
    f.set("beneficios_extras_enviado", "1");
    for (const b of r.beneficios_extras) f.append("beneficios_extras", b);
  }
  if (r.ganhos_extras?.length) f.set("ganhos_extras", JSON.stringify(r.ganhos_extras));
  if (r.horario_detalhe) f.set("horario_detalhe", JSON.stringify(r.horario_detalhe));
  preencher("escolaridade_minima", r.escolaridade_minima);
  preencher("experiencia", r.experiencia);
  preencher("cnh", r.cnh);
  preencher("jornada", r.jornada);
  preencher("modelo", r.modelo);
  preencher("pcd", r.pcd);
  if (r.comeca_ja) {
    f.set("comeca_ja_enviado", "1");
    f.set("comeca_ja", "on");
  }
  f.set("vagas", String(r.quantidade && r.quantidade > 0 && r.quantidade <= 99 ? r.quantidade : 1));
  preencher("cidade", r.cidade);
  preencher("bairro", r.bairro);
  f.set("prazo", "30");
  return f;
}

/** O registro da vaga com as regras do site, ou o que falta (os erros dos campos, em frases). */
export async function registroDaVagaLida(
  r: RascunhoConvite,
): Promise<{ ok: true; registro: ReturnType<typeof registroDoAnuncio> } | { ok: false; erros: string[] }> {
  const f = formularioDaVagaLida(r);
  const trocas = await completarAnuncio(f);
  const leitura = lerAnuncio(f);
  if (!leitura.ok) return { ok: false, erros: [...new Set(Object.values(ajustarErros(leitura.erros, trocas)))] };
  return { ok: true, registro: registroDoAnuncio(leitura.dados) };
}

export type ResultadoPublicar =
  | { tipo: "publicada"; token: string; anuncioId: string; contaNova: boolean; restantes: number; titulo: string }
  | { tipo: "ja"; anuncioId: string | null }
  | { tipo: "pedir_nome" }
  | { tipo: "nome_ruim" }
  /** as regras do site não passaram: o link para completar lá */
  | { tipo: "site"; token: string; erros: string[] }
  | { tipo: "nao_achou" }
  | { tipo: "desligado" }
  | { tipo: "erro"; token: string | null; mensagem: string };

type VagaParaPublicar = {
  ligado: boolean;
  achou?: boolean;
  token?: string;
  rascunho?: RascunhoConvite;
  empresa?: string | null;
  publicada?: boolean;
  anuncio_id?: string | null;
  conta?: string | null;
  tem_perfil?: boolean;
};

/**
 * Publica a vaga preparada na conversa. `token`: a do botão; sem ele, a última ainda não publicada (a resposta do
 * nome). `nome`: o que a pessoa respondeu à pergunta do nome.
 */
export async function publicarPeloWhatsapp(p: {
  banco: ClienteBanco;
  chave: string;
  conversa: string;
  token: string | null;
  nome: string | null;
}): Promise<ResultadoPublicar> {
  const { data, error } = await p.banco.rpc("servidor_whatsapp_vaga_para_publicar", {
    p_chave: p.chave,
    p_conversa: p.conversa,
    p_token: p.token ?? "",
  });
  if (error) {
    // sem a migração: fica como antes (o link)
    if (error.code === "PGRST202") return { tipo: "desligado" };
    console.error("Publike: a vaga para publicar pelo WhatsApp não veio:", error.message);
    return { tipo: "erro", token: p.token, mensagem: "Não consegui abrir a vaga agora." };
  }
  const v = (data ?? { ligado: false }) as unknown as VagaParaPublicar;
  if (!v.ligado) return { tipo: "desligado" };
  if (!v.achou || !v.token || !v.rascunho) return { tipo: "nao_achou" };
  if (v.publicada) return { tipo: "ja", anuncioId: v.anuncio_id ?? null };

  // o nome só importa sem o perfil: o que ela respondeu ou, sem resposta, o lido no anúncio
  const precisaNome = !v.tem_perfil;
  const nome = precisaNome ? (p.nome != null ? nomeDaEmpresa(p.nome) : nomeDaEmpresa(v.empresa)) : null;
  if (precisaNome && !nome) return p.nome != null ? { tipo: "nome_ruim" } : { tipo: "pedir_nome" };

  const conferida = await registroDaVagaLida(v.rascunho);
  if (!conferida.ok) return { tipo: "site", token: v.token, erros: conferida.erros };

  const { data: pub, error: erroPub } = await p.banco.rpc("servidor_whatsapp_publicar_aqui", {
    p_chave: p.chave,
    p_conversa: p.conversa,
    p_token: v.token,
    p_nome: nome ?? "",
    p_registro: conferida.registro as unknown as Json,
  });
  if (erroPub) {
    const repetido = anuncioRepetido(erroPub);
    if (repetido) return { tipo: "ja", anuncioId: repetido };
    console.error("Publike: a vaga não foi publicada pelo WhatsApp:", erroPub.message);
    return { tipo: "erro", token: v.token, mensagem: mensagemDeErro(erroPub) };
  }
  const r = (pub ?? {}) as { ok?: boolean; erro?: string; ja?: boolean; anuncio_id?: string; conta_nova?: boolean; restantes?: number };
  if (!r.ok) {
    if (r.erro === "falta_nome") return { tipo: "pedir_nome" };
    if (r.erro === "desligado") return { tipo: "desligado" };
    if (r.erro === "nao_achou") return { tipo: "nao_achou" };
    return {
      tipo: "erro",
      token: v.token,
      mensagem: r.erro === "suspensa" ? "A conta deste número está suspensa." : "Não consegui publicar por aqui.",
    };
  }
  if (r.ja || !r.anuncio_id) return { tipo: "ja", anuncioId: r.anuncio_id ?? null };
  return {
    tipo: "publicada",
    token: v.token,
    anuncioId: r.anuncio_id,
    contaNova: Boolean(r.conta_nova),
    restantes: Number(r.restantes) || 0,
    titulo: conferida.registro.titulo,
  };
}

/**
 * As vagas do lote que ainda não foram publicadas, na ordem do anúncio (migração 20270916140000). `null`: não deu para
 * saber (sem a função, ou erro do banco): quem chama manda o link do lote.
 */
export async function tokensDoLote(banco: ClienteBanco, chave: string, conversa: string, token: string): Promise<string[] | null> {
  const { data, error } = await banco.rpc("servidor_whatsapp_tokens_do_lote", { p_chave: chave, p_conversa: conversa, p_token: token });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: as vagas do lote não vieram:", error.message);
    return null;
  }
  return (data as string[] | null) ?? [];
}
