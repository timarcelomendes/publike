import "server-only";
import { LISTA_REGIMES } from "@/lib/constantes";
import type { RascunhoConvite } from "@/lib/convites";
import { anuncioRepetido, mensagemDeErro } from "@/lib/erros";
import { foraDoRascunho } from "@/lib/fora-da-regiao";
import type { ClienteBanco } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/tipos-banco";
import type { Regime } from "@/lib/tipos";
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

// --- O tipo de contratação (25/11/2026, migração 20270926120000) -------------------------------------------------
// O anúncio que não diz o tipo de contratação travava o "Sim, publicar" (o site exige) e ia para o site, onde a pessoa
// parava no entrar. Agora o WhatsApp pergunta, com os botões, e publica em seguida.

/** A marca das perguntas do tipo: a resposta escrita seguinte é lida como o tipo (`regimeDaResposta`). */
export const MARCA_DO_REGIME = "só falta o tipo de contratação";
/** A pergunta é de sim ou não ("sim" é CLT); o "não" e o "Outro tipo" levam à lista. */
export const PERGUNTA_DO_REGIME = `Para publicar, ${MARCA_DO_REGIME}. É com carteira assinada (CLT)? Se for outro, toque em *Outro tipo* ou escreva qual é: estágio, temporário, freelance, jovem aprendiz, PJ…`;
export const PERGUNTA_DO_OUTRO_REGIME = `Certo! Para publicar, ${MARCA_DO_REGIME}: qual é? Escreva um destes: estágio, jovem aprendiz, trainee, temporário, intermitente, diária, freelance, comissão, autônomo ou PJ.`;
export const botoesDoRegime = (token: string) => [
  { id: `a:regime:clt:${token}`, titulo: "Com carteira (CLT)" },
  { id: `a:regime:diaria:${token}`, titulo: "Diária" },
  { id: `a:regime:outro:${token}`, titulo: "Outro tipo" },
];
export const PAYLOAD_REGIME = /^a:regime:([a-z]+):([0-9a-f]{64})$/;

/** Os jeitos de escrever cada tipo (a ordem importa: "jovem aprendiz com carteira" é aprendiz). */
const TIPOS_ESCRITOS: [RegExp, Regime][] = [
  [/\b(?:jovem|menor)\s+aprendiz|\baprendiz\b/i, "aprendiz"],
  [/\best[aá]gi(?:o|[aá]ri[oa])s?\b/i, "estagio"],
  [/\btrainee\b/i, "trainee"],
  [/\btempor[aá]ri[oa]s?\b|\btemporada\b/i, "temporario"],
  [/\bintermitente\b/i, "intermitente"],
  [/\bdi[aá]rias?\b|\bdiarista\b|\bpor dia\b/i, "diaria"],
  [/\bfree\s*-?\s*lancer?s?\b|\bfreelas?\b|\bfrila\b|\bbico\b/i, "freelance"],
  [/\bcomiss(?:[aã]o|ionad[oa])\b|\bprodutividade\b|\bpor produ[cç][aã]o\b|\bpor venda\b/i, "produtividade"],
  [/\baut[oô]nom[oa]\b|\brpa\b/i, "autonomo"],
  [/\bpj\b|\bmei\b|\bcnpj\b|\bpessoa jur[ií]dica\b/i, "pj"],
  [/\bclt\b|\bcarteira\b|\bregistrad[oa]\b|\befetiv[oa]\b/i, "clt"],
];

/**
 * O tipo de contratação escrito na conversa ("CLT", "é estágio", "sim" para a pergunta da carteira). `null`: não deu
 * para saber (uma pergunta, um "não", outra coisa).
 */
export function regimeDaResposta(texto: string): Regime | null {
  const t = texto.replace(/\s+/g, " ").trim();
  if (!t || t.length > 80 || t.includes("?")) return null;
  for (const [re, regime] of TIPOS_ESCRITOS) if (re.test(t)) return regime;
  if (/^(?:sim|isso|isso mesmo|exato|correto|positivo|[eé] sim|sim,? [eé])[\s!.]*$/i.test(t)) return "clt";
  return null;
}

export const ehRegime = (x: string): x is Regime => (LISTA_REGIMES as readonly string[]).includes(x);

/**
 * Guarda o tipo nas vagas do anúncio que ainda não têm (`token`: a do botão; sem ele, o último anúncio da conversa).
 * Volta a primeira vaga ainda sem publicar e quantas faltam; `null`: sem a função no banco ou sem vaga esperando.
 */
export async function guardarRegime(
  banco: ClienteBanco,
  chave: string,
  conversa: string,
  token: string | null,
  regime: Regime,
): Promise<{ token: string; n: number } | null> {
  const { data, error } = await banco.rpc("servidor_whatsapp_regime_das_vagas", {
    p_chave: chave,
    p_conversa: conversa,
    p_token: token,
    p_regime: regime,
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: o tipo de contratação da vaga do WhatsApp não foi gravado:", error.message);
    return null;
  }
  const r = (data ?? {}) as { ok?: boolean; token?: string; n?: number };
  return r.ok && r.token ? { token: r.token, n: Number(r.n) || 1 } : null;
}

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
): Promise<
  { ok: true; registro: ReturnType<typeof registroDoAnuncio> } | { ok: false; erros: string[]; campos: string[] }
> {
  const f = formularioDaVagaLida(r);
  const trocas = await completarAnuncio(f);
  const leitura = lerAnuncio(f);
  if (!leitura.ok) {
    const erros = ajustarErros(leitura.erros, trocas);
    return { ok: false, erros: [...new Set(Object.values(erros))], campos: Object.keys(erros) };
  }
  return { ok: true, registro: registroDoAnuncio(leitura.dados) };
}

/** Só falta o tipo de contratação (o resto passa nas regras do site): a pergunta vai na conversa. */
export const soFaltaORegime = (r: { ok: false; campos: string[] }) => r.campos.length === 1 && r.campos[0] === "regime";

/** Os erros do banco que são regra (repetir não muda): os outros (tempo, conexão) ganham mais uma tentativa. */
const ERROS_DE_REGRA = new Set(["P0001", "P0002", "22023", "42501", "23505", "23514", "23503", "PGRST202"]);

export type ResultadoPublicar =
  | {
      tipo: "publicada";
      token: string;
      anuncioId: string;
      contaNova: boolean;
      restantes: number;
      titulo: string;
      /** a vaga do convite pelo WhatsApp oficial (migração 20271012120000): os avisos já ficam ligados */
      convite: boolean;
    }
  | { tipo: "ja"; anuncioId: string | null }
  | { tipo: "pedir_nome" }
  | { tipo: "nome_ruim" }
  /** as regras do site não passaram: o link para completar lá */
  | { tipo: "site"; token: string; erros: string[]; titulo?: string }
  /** só falta o tipo de contratação: a pergunta, com os botões (migração 20270926120000) */
  | { tipo: "regime"; token: string; titulo?: string }
  /** a vaga é de fora de onde o Publike funciona: não publica */
  | { tipo: "fora"; token: string; lugar: string; titulo?: string }
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
  convite?: boolean;
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

  // a vaga de fora de onde o Publike funciona nunca é publicada (25/11/2026: a de Barueri, SP, ia como Goiânia)
  const fora = foraDoRascunho(v.rascunho);
  const titulo = v.rascunho.titulo?.trim() || undefined;
  if (fora) return { tipo: "fora", token: v.token, lugar: fora, titulo };

  // as regras do site antes do nome: o que falta e se responde aqui (o tipo de contratação) vem antes da pergunta do
  // nome, que não fica guardada (a resposta do nome publica na hora)
  const conferida = await registroDaVagaLida(v.rascunho);
  if (!conferida.ok)
    return soFaltaORegime(conferida) && !v.rascunho.regime
      ? { tipo: "regime", token: v.token, titulo }
      : { tipo: "site", token: v.token, erros: conferida.erros, titulo };

  // o nome só importa sem o perfil: o que ela respondeu ou, sem resposta, o lido no anúncio
  const precisaNome = !v.tem_perfil;
  const nome = precisaNome ? (p.nome != null ? nomeDaEmpresa(p.nome) : nomeDaEmpresa(v.empresa)) : null;
  if (precisaNome && !nome) return p.nome != null ? { tipo: "nome_ruim" } : { tipo: "pedir_nome" };

  const publicar = () =>
    p.banco.rpc("servidor_whatsapp_publicar_aqui", {
      p_chave: p.chave,
      p_conversa: p.conversa,
      p_token: v.token!,
      p_nome: nome ?? "",
      p_registro: conferida.registro as unknown as Json,
    });
  let { data: pub, error: erroPub } = await publicar();
  // o erro de passagem do banco (tempo, conexão; 24/11/2026, o "Não deu certo agora" do João, que ao repetir saiu):
  // mais uma tentativa. Se a primeira tinha publicado, a segunda só devolve a vaga ("ja")
  if (erroPub && !anuncioRepetido(erroPub) && !ERROS_DE_REGRA.has(erroPub.code ?? "")) {
    console.warn("Publike: a vaga do WhatsApp não saiu na primeira tentativa:", erroPub.code, erroPub.message);
    await new Promise((r) => setTimeout(r, 1500));
    ({ data: pub, error: erroPub } = await publicar());
  }
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
    convite: Boolean(v.convite),
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

/**
 * O motivo de a vaga do lote não ter saído pelo WhatsApp, numa linha (26/11/2026; Marcelo: "nesses casos, o ideal é
 * informar o motivo"): "*Auxiliar fiscal*: falta o tipo de contratação."
 */
export function motivoDoAcerto(r: ResultadoPublicar): string | null {
  const nome = "titulo" in r && r.titulo ? `*${r.titulo}*` : "Uma vaga";
  if (r.tipo === "regime") return `${nome}: falta dizer o tipo de contratação (CLT, PJ, freelancer…).`;
  if (r.tipo === "fora") return `${nome}: é de ${r.lugar}, fora de onde o Publike funciona (Goiânia e região).`;
  if (r.tipo === "site") {
    const erro = r.erros.map((x) => x.trim()).filter(Boolean)[0];
    return `${nome}: ${erro ? erro.charAt(0).toLowerCase() + erro.slice(1) : "falta completar um dado."}`;
  }
  if (r.tipo === "erro") return `${nome}: ${r.mensagem.charAt(0).toLowerCase()}${r.mensagem.slice(1)}`;
  return null;
}
