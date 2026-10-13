import { Send } from "lucide-react";
import { classesBotao } from "../ui/botao";

/**
 * Indicar alguém pelo WhatsApp: vaga de bairro anda no boca a boca, e o
 * boca a boca vira candidato. Link comum (funciona sem JavaScript); o
 * `?origem=indicacao` deixa medir de onde a pessoa veio.
 */
export function linkDeIndicacao({
  url,
  titulo,
  lugar,
  vaga,
  proprio,
}: {
  url: string;
  titulo: string;
  lugar: string;
  vaga: boolean;
  /** quem publicou pedindo indicação */
  proprio: boolean;
}) {
  const link = `${url}?origem=indicacao`;
  const texto = proprio
    ? vaga
      ? `Estou contratando: ${titulo} (${lugar}). Conhece alguém? Pode se candidatar de graça pelo Publike: ${link}`
      : `Estou atendendo: ${titulo} (${lugar}). Se conhecer quem precise, me indica: ${link}`
    : vaga
      ? `Lembrei de você: ${titulo} (${lugar}). É de graça para se candidatar no Publike: ${link}`
      : `Conhece quem precise? ${titulo} (${lugar}), no Publike: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** O quadro "Conhece quem faria essa vaga?" da página do anúncio. */
export function QuadroIndicar(props: Parameters<typeof linkDeIndicacao>[0]) {
  const { vaga, proprio } = props;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
      <p className="text-label">
        {proprio
          ? "Peça indicações"
          : vaga
            ? "Conhece quem faria essa vaga?"
            : "Conhece quem precisa desse serviço?"}
      </p>
      <p className="text-body-sm text-ink-muted">
        {proprio
          ? "Mande para amigos e grupos do bairro. Indicação de conhecido costuma trazer gente boa."
          : "Mande pelo WhatsApp. Uma indicação sua pode ser o próximo emprego de alguém."}
      </p>
      <a
        href={linkDeIndicacao(props)}
        target="_blank"
        rel="noopener noreferrer"
        className={classesBotao("secundario", "sm", "self-start")}
      >
        <Send aria-hidden />
        {proprio ? "Pedir indicação no WhatsApp" : "Indicar pelo WhatsApp"}
      </a>
    </div>
  );
}
