// Falhas ao publicar vaga e ao salvar currículo (o registro e o aviso para a equipe ficam no
// banco, em registrar_falha_cadastro). Este arquivo serve o servidor e o navegador.

export type OndeFalha = "vaga" | "curriculo";

/**
 * validacao: preenchimento; conexao: o salvar não chegou ao servidor; internet: a internet da pessoa caiu no meio
 * (não é erro do Publike: fica registrado, mas a equipe só recebe e-mail se acontecer com muita gente ao mesmo tempo).
 */
export type EtapaFalha = "validacao" | "banco" | "arquivo" | "leitura" | "conexao" | "internet" | "inesperado";

export const ONDES_FALHA: readonly OndeFalha[] = ["vaga", "curriculo"];
export const ETAPAS_FALHA: readonly EtapaFalha[] = [
  "validacao",
  "banco",
  "arquivo",
  "leitura",
  "conexao",
  "internet",
  "inesperado",
];

export const NOME_DA_ETAPA: Record<EtapaFalha, string> = {
  validacao: "Preenchimento",
  banco: "Banco de dados",
  arquivo: "Envio do arquivo",
  leitura: "Leitura pela IA",
  conexao: "Não chegou ao servidor",
  internet: "A internet da pessoa caiu",
  inesperado: "Erro inesperado",
};

export const NOME_DO_ONDE: Record<OndeFalha, string> = { vaga: "Vaga", curriculo: "Currículo" };

/** O que a pessoa vê quando a internet dela cai no meio do envio (não é erro do Publike). */
export const MENSAGEM_SEM_INTERNET = "A internet caiu no meio do envio. Quando o sinal voltar, é só tentar de novo.";

const SINAIS_DE_INTERNET = /StorageUnknownError|failed to fetch|networkerror|load failed|network request failed|sem internet/i;

/** A internet caiu ("Failed to fetch", "Load failed", aparelho sem rede): não é um erro do Publike. */
export function ehFalhaDeInternet(e: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const { name = "", message = "" } = (e ?? {}) as { name?: string; message?: string };
  return SINAIS_DE_INTERNET.test(`${name} ${message} ${typeof e === "string" ? e : ""}`);
}

/**
 * Do navegador: avisa a falha que o servidor não viu (o PDF que não subiu, o salvar que não chegou).
 * Vai por /api/falhas com sendBeacon, que funciona mesmo depois de uma publicação nova do site
 * (quando a ação do servidor já não existe) e mesmo saindo da página. Nunca dá erro.
 */
export function relatarFalha(d: {
  onde: OndeFalha;
  etapa: EtapaFalha;
  mensagem: string;
  detalhe?: string;
}) {
  try {
    // a internet da pessoa caiu: vai como "internet" (registrada, sem e-mail para a equipe), seja qual for o lugar
    const etapa =
      d.etapa !== "validacao" && (navigator.onLine === false || SINAIS_DE_INTERNET.test(d.detalhe ?? ""))
        ? "internet"
        : d.etapa;
    const corpo = JSON.stringify({ ...d, etapa, pagina: window.location.pathname });
    const blob = new Blob([corpo], { type: "application/json" });
    if (navigator.sendBeacon?.("/api/falhas", blob)) return;
    void fetch("/api/falhas", {
      method: "POST",
      body: corpo,
      headers: { "content-type": "application/json" },
      keepalive: true,
    }).catch(() => {});
  } catch {}
}

/** Texto curto de um erro qualquer, para o detalhe. */
export function detalheDoErro(e: unknown) {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 1000);
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message).slice(0, 1000);
  return String(e).slice(0, 1000);
}
