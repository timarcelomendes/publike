import { Check, X } from "lucide-react";

/** Em que pé está a curtida ("antes": ainda não curtiu). */
export type SituacaoDaCurtida = "antes" | "pendente" | "match" | "dispensada" | "desfeito";

type Estado = "feito" | "agora" | "depois" | "nao";

const CIRCULO: Record<Estado, string> = {
  feito: "bg-cerrado text-on-cerrado",
  agora: "bg-terra-soft text-terra-text",
  depois: "border border-line-strong bg-surface-200 text-ink-muted",
  nao: "bg-surface-300 text-ink-muted",
};

/**
 * O caminho de uma curtida, em 3 passos: você curte (ou pede o serviço), quem
 * publicou decide se aceita, e só com o aceite vocês se conectam (a conversa e o
 * WhatsApp aparecem para os dois). Mostra em que passo a curtida está.
 * Um passo embaixo do outro; lado a lado quando o espaço passa de 32 rem (pela
 * largura do próprio quadro: na coluna da página do anúncio fica em pé).
 */
export function CaminhoDaCurtida({
  situacao,
  quem,
  servico = false,
  className = "",
}: {
  situacao: SituacaoDaCurtida;
  /** quem decide: o nome de quem publicou a vaga ou do profissional */
  quem: string;
  servico?: boolean;
  className?: string;
}) {
  const aceitou = situacao === "match" || situacao === "desfeito";
  const passos: { estado: Estado; texto: string; ajuda?: string }[] = [
    {
      estado: situacao === "antes" ? "agora" : "feito",
      texto:
        situacao === "antes"
          ? servico
            ? "Você pede o serviço"
            : "Você curte a vaga"
          : servico
            ? "Você pediu o serviço"
            : "Você curtiu a vaga",
    },
    aceitou
      ? { estado: "feito", texto: `${quem} aceitou` }
      : situacao === "dispensada"
        ? { estado: "nao", texto: `${quem} não aceitou` }
        : {
            estado: situacao === "pendente" ? "agora" : "depois",
            texto: `${quem} decide se aceita`,
            ajuda: situacao === "pendente" ? "Ainda não respondeu" : undefined,
          },
    situacao === "match"
      ? { estado: "feito", texto: "Vocês estão conectados", ajuda: "A conversa e o WhatsApp estão liberados" }
      : situacao === "desfeito"
        ? { estado: "nao", texto: "A conexão foi desfeita", ajuda: "O contato não aparece mais" }
        : situacao === "dispensada"
          ? { estado: "nao", texto: "Vocês não se conectaram", ajuda: "Seu contato não foi mostrado" }
          : {
              estado: "depois",
              texto: "Se aceitar, vocês se conectam",
              ajuda: "A conversa e o WhatsApp aparecem para os dois",
            },
  ];

  return (
    <div className={`@container ${className}`}>
      <ol aria-label="Caminho da curtida" className="flex flex-col @lg:flex-row @lg:gap-3">
        {passos.map((p, i) => (
          <li key={i} className="relative flex gap-3 pb-3 last:pb-0 @lg:flex-1 @lg:flex-col @lg:gap-2 @lg:pb-0">
            {/* a linha até o próximo passo: para baixo, ou para o lado quando há espaço */}
            {i < passos.length - 1 && (
              <span
                aria-hidden
                className="absolute top-7 bottom-1 left-3 w-px bg-line @lg:top-3 @lg:right-0 @lg:bottom-auto @lg:left-8 @lg:h-px @lg:w-auto"
              />
            )}
            <span
              aria-hidden
              className={`relative flex size-6 shrink-0 items-center justify-center rounded-pill text-caption ${CIRCULO[p.estado]}`}
            >
              {p.estado === "feito" ? (
                <Check className="size-3.5" strokeWidth={3} />
              ) : p.estado === "nao" ? (
                <X className="size-3.5" strokeWidth={3} />
              ) : (
                i + 1
              )}
            </span>
            <span className="flex min-w-0 flex-col pt-0.5 @lg:pt-0">
              <span
                className={
                  p.estado === "agora"
                    ? "text-label text-ink"
                    : p.estado === "feito"
                      ? "text-body-sm text-ink"
                      : "text-body-sm text-ink-muted"
                }
              >
                {/* para leitor de tela: em que pé está cada passo */}
                <span className="sr-only">
                  {p.estado === "feito"
                    ? "Feito: "
                    : p.estado === "agora"
                      ? "Agora: "
                      : p.estado === "nao"
                        ? "Não: "
                        : "Depois: "}
                </span>
                {p.texto}
              </span>
              {p.ajuda && <span className="text-body-sm text-ink-muted">{p.ajuda}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
