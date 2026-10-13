// De qual campanha a pessoa chegou: o link do anúncio leva ?utm_source=google&utm_campaign=servicos.
// O site guarda só "google:servicos" num cookie próprio por 7 dias e, quando a pessoa cria a conta,
// grava no banco (registrar_origem). Nada vai para fora; o admin vê o total em /admin/campanhas.

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

/** A origem do link (utm_source e utm_campaign), ou null se o link não tem campanha. */
export function origemDoLink(params: URLSearchParams): string | null {
  const fonte = parte(params.get("utm_source"));
  const campanha = parte(params.get("utm_campaign"));
  const origem = fonte && campanha ? `${fonte}:${campanha}` : fonte || (campanha ? `campanha:${campanha}` : "");
  return origemValida(origem) ? origem : null;
}

export function origemValida(origem: string | null | undefined): origem is string {
  return typeof origem === "string" && FORMATO.test(origem);
}
