import { FileText } from "lucide-react";
import Link from "next/link";

/** O currículo, que volta para a vaga depois de salvar. */
export const linkDoCurriculoDaVaga = (anuncioId: string) =>
  `/perfil/curriculo?next=${encodeURIComponent(`/anuncio/${anuncioId}`)}`;

/**
 * O passo do currículo logo depois da curtida, para quem ainda não tem (12/11/2026, claude/plano-mais-curriculos.md:
 * a pessoa se candidatava, ia para o WhatsApp e saía sem currículo, e nenhuma tela pedia). Diz o que muda para quem
 * publicou e os jeitos rápidos de fazer (os mesmos do alto da página do currículo).
 *   quadro .. o quadro da vaga, depois da curtida
 *   match ... depois do match (contato direto): com o currículo, o link dele vai na mensagem do WhatsApp
 *   balao ... o balão do cartão e o aviso do Descobrir (curto)
 */
export function PassoDoCurriculo({
  anuncioId,
  quem,
  jeito,
  pede = false,
  secundario = false,
  aoIr,
  className = "",
}: {
  anuncioId: string;
  /** o nome de quem publicou (sem ele, "quem publicou") */
  quem?: string | null;
  jeito: "quadro" | "match" | "balao";
  /** a vaga pede currículo: o match espera por ele */
  pede?: boolean;
  /** abaixo do botão principal (o WhatsApp ou a conversa): o botão do currículo fica só com o contorno */
  secundario?: boolean;
  /** antes de ir para o currículo (a pergunta do match fecha sem contar o "agora não") */
  aoIr?: () => void;
  className?: string;
}) {
  const nome = quem?.trim() || "quem publicou";
  const href = linkDoCurriculoDaVaga(anuncioId);

  if (jeito === "balao") {
    return (
      <p className={`text-body-sm ${className}`}>
        <strong className="font-semibold">Falta o seu currículo.</strong> Sem ele, {nome} vê só o seu nome.{" "}
        <Link href={href} onClick={aoIr} className="font-semibold text-terra-text underline underline-offset-2">
          Fazer agora
        </Link>
      </p>
    );
  }

  const titulo = jeito === "match" ? "Mande o seu currículo junto" : pede ? "Esta vaga pede currículo" : "Agora, o seu currículo";
  const porQue =
    jeito === "match"
      ? `Sem currículo, ${nome} vê só o seu nome. Com ele, a mensagem do WhatsApp leva o link do seu currículo.`
      : pede
        ? `Mandando agora, o match sai na hora em que ${nome} aceitar.`
        : `Sem currículo, ${nome} vê só o seu nome e a sua foto. Com ele, vê o que você já fez.`;
  return (
    <div className={`flex flex-col gap-2.5 rounded-md border-2 border-terra bg-surface-200 p-3.5 text-ink ${className}`}>
      <div className="flex items-start gap-2.5">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-pill bg-terra-soft">
          <FileText className="size-5 text-terra-text" />
        </span>
        <div className="min-w-0">
          <p className="text-label">{titulo}</p>
          <p className="mt-0.5 text-body-sm">{porQue}</p>
        </div>
      </div>
      <p className="text-body-sm text-ink-muted">
        Conte falando, mande a foto do currículo de papel ou o PDF. Leva uns 3 minutos.
      </p>
      <Link
        href={href}
        onClick={aoIr}
        // depois do match, o WhatsApp é o botão cheio (o encontro vem primeiro): aqui, só o contorno
        className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-pill px-4 text-label ${
          jeito === "match" || secundario
            ? "border-2 border-terra bg-surface-100 text-terra-text hover:bg-terra-soft"
            : "bg-terra text-on-terra hover:bg-terra-hover"
        }`}
      >
        <FileText aria-hidden className="size-4" />
        Fazer meu currículo
      </Link>
    </div>
  );
}
