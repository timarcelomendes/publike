// De qual campanha a pessoa chegou: o link do anúncio leva ?utm_source=google&utm_campaign=servicos.
// O site guarda só "google:servicos" num cookie próprio por 7 dias e, quando a pessoa cria a conta
// (por qualquer jeito de entrar: celular, e-mail, Google...), grava no banco (registrar_origem).
// Anúncio do Google sem utm (só a marcação automática, ?gclid=...): "google-ads", com o número da
// campanha quando o Google manda (gad_campaignid). Nada vai para fora; o admin vê em /admin/campanhas.

export const COOKIE_ORIGEM = "publike_origem";
export const DURACAO_ORIGEM = 60 * 60 * 24 * 7;

const FORMATO = /^[a-z0-9_-]{1,40}(:[a-z0-9_-]{1,40})?$/;

/** "Google Ads" → "google-ads": minúsculas, sem acento, só letras, números, - e _. */
function parte(valor: string | null) {
  if (!valor) return "";
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

/** O clique veio de um anúncio do Google (marcação automática do Google Ads). */
function anuncioDoGoogle(params: URLSearchParams) {
  return params.has("gclid") || params.has("gbraid") || params.has("wbraid");
}

/**
 * A origem do link (utm_source e utm_campaign), ou null se o link não tem campanha. Sem utm, o
 * anúncio do Google entra como "google-ads" (com o número da campanha, se vier).
 */
export function origemDoLink(params: URLSearchParams): string | null {
  const google = anuncioDoGoogle(params);
  const fonte = parte(params.get("utm_source")) || (google ? "google-ads" : "");
  const campanha = parte(params.get("utm_campaign")) || (google ? parte(params.get("gad_campaignid")) : "");
  const origem = fonte && campanha ? `${fonte}:${campanha}` : fonte || (campanha ? `campanha:${campanha}` : "");
  return origemValida(origem) ? origem : null;
}

export function origemValida(origem: string | null | undefined): origem is string {
  return typeof origem === "string" && FORMATO.test(origem);
}
