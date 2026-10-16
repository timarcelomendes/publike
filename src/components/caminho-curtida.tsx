import { Check, X } from "lucide-react";

/**
 * Em que pé está a curtida. "antes": ainda não curtiu; "aceita": quem publicou
 * aceitou, mas a vaga pede currículo e a pessoa ainda não mandou.
 */
export type SituacaoDaCurtida = "antes" | "pendente" | "aceita" | "match" | "dispensada" | "desfeito";

type Estado = "feito" | "agora" | "depois" | "nao";
export type Passo = { estado: Estado; texto: string; ajuda?: string };

const CIRCULO: Record<Estado, string> = {
  feito: "bg-cerrado text-on-cerrado",
  agora: "bg-terra-soft text-terra-text",
  depois: "border border-line-strong bg-surface-200 text-ink-muted",
  nao: "bg-surface-300 text-ink-muted",
};

// Lado a lado quando o quadro passa de 32 rem (3 passos) ou de 42 rem (4 passos);
// antes disso, um embaixo do outro. As classes ficam escritas por inteiro para o Tailwind.
const LADO_A_LADO = {
  curto: {
    lista: "@lg:flex-row @lg:gap-3",
    passo: "@lg:flex-1 @lg:flex-col @lg:gap-2 @lg:pb-0",
    linha: "@lg:top-3 @lg:right-0 @lg:bottom-auto @lg:left-8 @lg:h-px @lg:w-auto",
    texto: "@lg:pt-0",
  },
  longo: {
    lista: "@2xl:flex-row @2xl:gap-3",
    passo: "@2xl:flex-1 @2xl:flex-col @2xl:gap-2 @2xl:pb-0",
    linha: "@2xl:top-3 @2xl:right-0 @2xl:bottom-auto @2xl:left-8 @2xl:h-px @2xl:w-auto",
    texto: "@2xl:pt-0",
  },
};

/**
 * Passos numerados, com o que já foi feito (✓), o que é agora, o que vem depois e o
 * que não aconteceu (✕). A largura que conta é a do próprio quadro: na coluna da
 * página do anúncio, fica em pé.
 */
export function Passos({ passos, rotulo, className = "" }: { passos: Passo[]; rotulo: string; className?: string }) {
  const l = passos.length > 3 ? LADO_A_LADO.longo : LADO_A_LADO.curto;
  return (
    <div className={`@container ${className}`}>
      <ol aria-label={rotulo} className={`flex flex-col ${l.lista}`}>
        {passos.map((p, i) => (
          <li key={i} className={`relative flex gap-3 pb-3 last:pb-0 ${l.passo}`}>
            {/* a linha até o próximo passo: para baixo, ou para o lado quando há espaço */}
            {i < passos.length - 1 && (
              <span aria-hidden className={`absolute top-7 bottom-1 left-3 w-px bg-line ${l.linha}`} />
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
            <span className={`flex min-w-0 flex-col pt-0.5 ${l.texto}`}>
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

/**
 * O caminho de uma curtida: você curte (ou pede o serviço), quem publicou decide se
 * aceita, e só com o aceite vocês se conectam (a conversa e o WhatsApp aparecem para
 * os dois). Na vaga que pede currículo, para quem ainda não mandou, entra um passo
 * entre o aceite e a conexão: você manda o currículo. O match sai assim que ele chega.
 */
export function CaminhoDaCurtida({
  situacao,
  quem,
  servico = false,
  passoDoCurriculo = false,
  className = "",
}: {
  situacao: SituacaoDaCurtida;
  /** quem decide: o nome de quem publicou a vaga ou do profissional */
  quem: string;
  servico?: boolean;
  /** a vaga pede currículo e a pessoa ainda não mandou */
  passoDoCurriculo?: boolean;
  className?: string;
}) {
  const aceitou = situacao === "aceita" || situacao === "match" || situacao === "desfeito";
  const comCurriculo =
    !servico && (situacao === "aceita" || (passoDoCurriculo && (situacao === "antes" || situacao === "pendente")));

  const curtir: Passo =
    situacao === "antes"
      ? { estado: "agora", texto: servico ? "Você pede o serviço" : "Você curte a vaga" }
      : { estado: "feito", texto: servico ? "Você pediu o serviço" : "Você curtiu a vaga" };

  const aceite: Passo = aceitou
    ? { estado: "feito", texto: situacao === "aceita" ? `${quem} aceitou você` : `${quem} aceitou` }
    : situacao === "dispensada"
      ? { estado: "nao", texto: `${quem} não aceitou` }
      : {
          estado: situacao === "pendente" ? "agora" : "depois",
          texto: `${quem} decide se aceita`,
          ajuda: situacao === "pendente" ? "Ainda não respondeu" : undefined,
        };

  const curriculo: Passo =
    situacao === "aceita"
      ? { estado: "agora", texto: "Você manda o currículo", ajuda: "É a sua vez. Leva uns 3 minutos" }
      : {
          estado: "depois",
          texto: "Você manda o currículo",
          ajuda:
            situacao === "pendente"
              ? "A vaga pede. Mandando antes, o match sai na hora do aceite"
              : "A vaga pede. Dá para mandar antes ou depois de curtir",
        };

  const conexao: Passo =
    situacao === "match"
      ? { estado: "feito", texto: "Vocês estão conectados", ajuda: "A conversa e o WhatsApp estão liberados" }
      : situacao === "desfeito"
        ? { estado: "nao", texto: "A conexão foi desfeita", ajuda: "O contato não aparece mais" }
        : situacao === "dispensada"
          ? { estado: "nao", texto: "Vocês não se conectaram", ajuda: "Seu contato não foi mostrado" }
          : situacao === "aceita"
            ? { estado: "depois", texto: "Vocês se conectam", ajuda: "A conversa e o WhatsApp aparecem para os dois" }
            : comCurriculo
              ? {
                  estado: "depois",
                  texto: "Vocês se conectam",
                  ajuda: "Com o aceite e o currículo, a conversa e o WhatsApp aparecem para os dois",
                }
              : {
                  estado: "depois",
                  texto: "Se aceitar, vocês se conectam",
                  ajuda: "A conversa e o WhatsApp aparecem para os dois",
                };

  return (
    <Passos
      passos={comCurriculo ? [curtir, aceite, curriculo, conexao] : [curtir, aceite, conexao]}
      rotulo="Caminho da curtida"
      className={className}
    />
  );
}

/**
 * O mesmo caminho, do lado de quem publicou a vaga, quando ela pede currículo e a
 * pessoa ainda não mandou: ela curtiu, você aceita, ela manda o currículo e dá match.
 */
export function CaminhoDoAceite({
  nome,
  aceita,
  className = "",
}: {
  /** o primeiro nome de quem curtiu */
  nome: string;
  /** você já aceitou (agora é com a pessoa) */
  aceita: boolean;
  className?: string;
}) {
  return (
    <Passos
      rotulo="Caminho até o match"
      className={className}
      passos={[
        { estado: "feito", texto: `${nome} curtiu a vaga` },
        aceita ? { estado: "feito", texto: "Você aceitou" } : { estado: "agora", texto: "Você decide se aceita" },
        aceita
          ? { estado: "agora", texto: `${nome} manda o currículo`, ajuda: "Já recebeu o pedido" }
          : { estado: "depois", texto: `${nome} manda o currículo`, ajuda: "Recebe o pedido com o seu aceite" },
        { estado: "depois", texto: "Deu match", ajuda: "O contato aparece para os dois" },
      ]}
    />
  );
}
