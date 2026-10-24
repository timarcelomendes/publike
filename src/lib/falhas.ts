// Falhas ao publicar vaga e ao salvar currículo (o registro e o aviso para a equipe ficam no
// banco, em registrar_falha_cadastro). Este arquivo serve o servidor e o navegador.

export type OndeFalha = "vaga" | "curriculo";

/** validacao: preenchimento; conexao: o salvar não chegou ao servidor. */
export type EtapaFalha = "validacao" | "banco" | "arquivo" | "leitura" | "conexao" | "inesperado";

export const ONDES_FALHA: readonly OndeFalha[] = ["vaga", "curriculo"];
export const ETAPAS_FALHA: readonly EtapaFalha[] = ["validacao", "banco", "arquivo", "leitura", "conexao", "inesperado"];

export const NOME_DA_ETAPA: Record<EtapaFalha, string> = {
  validacao: "Preenchimento",
  banco: "Banco de dados",
  arquivo: "Envio do arquivo",
  leitura: "Leitura pela IA",
  conexao: "Não chegou ao servidor",
  inesperado: "Erro inesperado",
};

export const NOME_DO_ONDE: Record<OndeFalha, string> = { vaga: "Vaga", curriculo: "Currículo" };

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
    const corpo = JSON.stringify({ ...d, pagina: window.location.pathname });
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
