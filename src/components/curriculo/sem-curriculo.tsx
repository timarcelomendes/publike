import { FileWarning } from "lucide-react";
import { BotaoLink } from "../ui/botao";

// Quem procura trabalho e ainda não tem currículo (02/11/2026, pedido do Marcelo: "deixar isso evidente em todos
// lugares possíveis"): a pílula "Falta" no menu do painel e no menu da conta, e o aviso com o botão nas páginas
// em que a empresa olha a pessoa (Candidaturas, Quem viu seu perfil e o próprio perfil).

/** A pílula "Falta" ao lado de "Currículo" nos menus. */
export function PilulaFaltaCurriculo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-pill bg-terra px-2 py-0.5 text-[12px] leading-4 font-bold text-on-terra ${className}`}
    >
      Falta
      <span className="sr-only">: você ainda não tem currículo</span>
    </span>
  );
}

/**
 * O aviso grande: o que a pessoa perde sem currículo e o botão para fazer. `onde` muda a frase do meio (o que a
 * empresa vê naquela página).
 */
export function AvisoSemCurriculo({
  onde,
  className = "",
}: {
  onde: "candidaturas" | "visitas" | "perfil";
  className?: string;
}) {
  const frase = {
    candidaturas: "Nas suas candidaturas, quem publicou a vaga vê só o seu nome e a sua foto, sem a sua experiência.",
    visitas: "Quem abre o seu perfil não vê a sua experiência, e as empresas não acham você na aba Talentos.",
    perfil: "Quem abre o seu perfil não vê a sua experiência, e as empresas não acham você na aba Talentos.",
  }[onde];
  return (
    <section
      aria-labelledby={`sem-curriculo-${onde}`}
      className={`flex flex-col gap-3 rounded-lg border-2 border-terra bg-terra-soft p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-5 ${className}`}
    >
      <FileWarning aria-hidden className="size-8 shrink-0 text-terra-text" />
      <div className="min-w-0 flex-1">
        <h2 id={`sem-curriculo-${onde}`} className="text-label text-ink">
          Você ainda não tem currículo
        </h2>
        <p className="mt-0.5 text-body-sm text-ink">{frase} Leva uns 5 minutos.</p>
      </div>
      <BotaoLink href="/perfil/curriculo" variante="primario" className="shrink-0 self-start sm:self-center">
        Fazer meu currículo
      </BotaoLink>
    </section>
  );
}
