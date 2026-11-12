import "server-only";

// A API do Google Ads (o impulso da vaga, claude/plano-impulsionar-vaga.md), pelo REST, sem biblioteca. O acesso é o
// OAuth da conta do Google Ads, gerado uma vez (como o do Google Meet): GOOGLE_ADS_CLIENT_ID e
// GOOGLE_ADS_CLIENT_SECRET (sem eles, usa os do Meet, se o projeto do Google Cloud for o mesmo), GOOGLE_ADS_REFRESH_TOKEN
// (escopo https://www.googleapis.com/auth/adwords) e GOOGLE_ADS_CONTA (o id da conta de anúncios, 123-456-7890).
// Opcionais: GOOGLE_ADS_CONTA_GESTORA (a conta de administrador, quando o acesso vem por ela) e GOOGLE_ADS_DEVELOPER_TOKEN
// (desde 09/09/2026 o acesso é do projeto do Google Cloud, e o token deixou de ser usado). Para os testes:
// GOOGLE_ADS_API_URL e GOOGLE_ADS_TOKEN_URL apontam para o Google falso. As chaves ficam só no servidor.

const env = (nome: string) => (process.env[nome] || "").trim();
const soNumeros = (v: string) => v.replace(/\D/g, "");

const VERSAO = () => env("GOOGLE_ADS_VERSAO") || "v26";
const BASE = () => (env("GOOGLE_ADS_API_URL") || "https://googleads.googleapis.com").replace(/\/+$/, "");
const URL_DO_TOKEN = () => env("GOOGLE_ADS_TOKEN_URL") || "https://oauth2.googleapis.com/token";

const clienteId = () => env("GOOGLE_ADS_CLIENT_ID") || env("GOOGLE_MEET_CLIENT_ID");
const clienteSegredo = () => env("GOOGLE_ADS_CLIENT_SECRET") || env("GOOGLE_MEET_CLIENT_SECRET");

/** O id da conta de anúncios, só os números (o Google mostra 123-456-7890). */
export function contaDeAnuncios() {
  return soNumeros(env("GOOGLE_ADS_CONTA"));
}

/** O que falta para ligar (os nomes, nunca os valores). */
export function situacaoGoogleAds(): { ligado: boolean; falta: string[] } {
  const falta: string[] = [];
  if (!clienteId()) falta.push("GOOGLE_ADS_CLIENT_ID");
  if (!clienteSegredo()) falta.push("GOOGLE_ADS_CLIENT_SECRET");
  if (!env("GOOGLE_ADS_REFRESH_TOKEN")) falta.push("GOOGLE_ADS_REFRESH_TOKEN");
  if (!/^\d{10}$/.test(contaDeAnuncios())) falta.push("GOOGLE_ADS_CONTA");
  return { ligado: falta.length === 0, falta };
}

export function googleAdsLigado() {
  return situacaoGoogleAds().ligado;
}

/** O erro do Google, com o que o robô precisa: se é a política (anúncio recusado) e se vale tentar de novo. */
export class ErroGoogleAds extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** o anúncio ou a palavra-chave bateu na política do Google (não adianta tentar igual) */
    readonly politica: boolean,
    /** os códigos do Google (para o registro) */
    readonly codigos: string[],
    /** a campanha (ou o que se queria mexer) não existe mais */
    readonly naoExiste = false,
  ) {
    super(message);
  }
}

let token: { valor: string; ate: number } | null = null;

async function tokenDoGoogle() {
  if (token && token.ate > Date.now() + 60_000) return token.valor;
  const r = await fetch(URL_DO_TOKEN(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clienteId(),
      client_secret: clienteSegredo(),
      refresh_token: env("GOOGLE_ADS_REFRESH_TOKEN"),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) {
    // o motivo do Google (nunca as chaves)
    const motivo = await r
      .json()
      .then((d: { error?: unknown }) => String(d?.error ?? ""))
      .catch(() => "");
    throw new ErroGoogleAds(
      motivo === "invalid_client"
        ? "O Google recusou a chave secreta (invalid_client): confira GOOGLE_ADS_CLIENT_SECRET."
        : motivo === "invalid_grant"
          ? "O Google recusou o refresh token (invalid_grant): gere outro com o escopo do Google Ads e ponha em GOOGLE_ADS_REFRESH_TOKEN."
          : `O Google não aceitou o acesso ao Google Ads (código ${r.status}${motivo ? `: ${motivo}` : ""}).`,
      r.status,
      false,
      motivo ? [motivo] : [],
    );
  }
  const d = (await r.json()) as { access_token?: string; expires_in?: number };
  if (!d.access_token) throw new ErroGoogleAds("O Google não devolveu o acesso.", 500, false, []);
  token = { valor: d.access_token, ate: Date.now() + (d.expires_in ?? 3600) * 1000 };
  return token.valor;
}

type FalhaDoGoogle = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: { errors?: { errorCode?: Record<string, string>; message?: string }[] }[];
  };
};

async function chamar<T>(caminho: string, corpo?: unknown): Promise<T> {
  const acesso = await tokenDoGoogle();
  const cabecalhos: Record<string, string> = {
    Authorization: `Bearer ${acesso}`,
    "Content-Type": "application/json",
  };
  const gestora = soNumeros(env("GOOGLE_ADS_CONTA_GESTORA"));
  if (gestora) cabecalhos["login-customer-id"] = gestora;
  const dev = env("GOOGLE_ADS_DEVELOPER_TOKEN");
  if (dev) cabecalhos["developer-token"] = dev;
  const r = await fetch(`${BASE()}/${VERSAO()}/${caminho}`, {
    method: corpo === undefined ? "GET" : "POST",
    headers: cabecalhos,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await r.text();
  if (!r.ok) {
    let d: FalhaDoGoogle = {};
    try {
      d = JSON.parse(texto) as FalhaDoGoogle;
    } catch {
      // sem JSON: fica a mensagem do status
    }
    const erros = (d.error?.details ?? []).flatMap((x) => x.errors ?? []);
    const codigos = erros.flatMap((e) => Object.entries(e.errorCode ?? {}).map(([k, v]) => `${k}:${v}`));
    const politica = codigos.some((c) => /^policy(Finding|Violation)Error:/.test(c));
    const naoExiste = codigos.some((c) => /RESOURCE_NOT_FOUND|NOT_FOUND|OPERATION_NOT_PERMITTED_FOR_REMOVED_RESOURCE/.test(c));
    const mensagem = erros.map((e) => e.message).filter(Boolean)[0] ?? d.error?.message ?? `código ${r.status}`;
    throw new ErroGoogleAds(`Google Ads: ${mensagem}`.slice(0, 480), r.status, politica, codigos, naoExiste);
  }
  return (texto ? JSON.parse(texto) : {}) as T;
}

/** O caminho de um recurso da conta ("customers/123/campaigns/-2"). */
export function recurso(tipo: string, id: string | number) {
  return `customers/${contaDeAnuncios()}/${tipo}/${id}`;
}

export type RespostaDoMutate = { mutateOperationResponses?: Record<string, { resourceName?: string }>[] };

/** Várias mudanças de uma vez, tudo ou nada (os ids temporários negativos ligam umas às outras). */
export function mutar(operacoes: unknown[]) {
  return chamar<RespostaDoMutate>(`customers/${contaDeAnuncios()}/googleAds:mutate`, { mutateOperations: operacoes });
}

/** Uma consulta GAQL, com as páginas. */
export async function consultar<T = Record<string, unknown>>(gaql: string): Promise<T[]> {
  const linhas: T[] = [];
  let pagina: string | undefined;
  for (let i = 0; i < 20; i++) {
    const r = await chamar<{ results?: T[]; nextPageToken?: string }>(
      `customers/${contaDeAnuncios()}/googleAds:search`,
      pagina ? { query: gaql, pageToken: pagina } : { query: gaql },
    );
    linhas.push(...(r.results ?? []));
    pagina = r.nextPageToken;
    if (!pagina) break;
  }
  return linhas;
}

/** As contas que o acesso enxerga (para conferir a ligação no Admin). */
export async function contasAcessiveis(): Promise<string[]> {
  const r = await chamar<{ resourceNames?: string[] }>("customers:listAccessibleCustomers");
  return (r.resourceNames ?? []).map((x) => x.replace(/^customers\//, ""));
}

/** O id no fim do caminho ("customers/1/campaigns/22" → "22"; "customers/1/adGroupAds/3~44" → "44"). */
export function idDoRecurso(caminho: string | undefined | null) {
  const m = /\/(\d+)(?:~(\d+))?$/.exec(caminho ?? "");
  return m ? (m[2] ?? m[1]) : null;
}
