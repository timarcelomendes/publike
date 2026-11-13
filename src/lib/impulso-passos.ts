// O caminho de quem chega pelo anúncio do impulso (claude/plano-impulsionar-vaga.md, 12/11/2026): abriu a vaga
// (a visita), tocou em Curtir, entrou ou criou a conta, a vaga pediu as perguntas ou o WhatsApp, respondeu e curtiu.
// O meio do caminho vem do quadro de curtir (src/components/anuncio/painel-curtir.tsx) para /api/impulso/passo.

export const PASSOS_DO_IMPULSO = ["tocou", "entrou", "pedido", "respondeu"] as const;
export type PassoDoImpulso = (typeof PASSOS_DO_IMPULSO)[number];

export function ehPassoDoImpulso(x: unknown): x is PassoDoImpulso {
  return typeof x === "string" && (PASSOS_DO_IMPULSO as readonly string[]).includes(x);
}

/** Avisa um passo, sem esperar (o servidor só conta para quem chegou pelo anúncio desta vaga). */
export function avisarPassoDoImpulso(anuncio: string, passo: PassoDoImpulso): void {
  if (typeof window === "undefined") return;
  const corpo = JSON.stringify({ anuncio, passo });
  try {
    if (navigator.sendBeacon?.("/api/impulso/passo", new Blob([corpo], { type: "application/json" }))) return;
  } catch {
    // segue para o fetch
  }
  void fetch("/api/impulso/passo", {
    method: "POST",
    body: corpo,
    keepalive: true,
    headers: { "content-type": "application/json" },
  }).catch(() => {});
}
