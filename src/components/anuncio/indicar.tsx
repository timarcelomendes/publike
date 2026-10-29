import { Send, UsersRound } from "lucide-react";
import { classesBotao } from "../ui/botao";

/**
 * Indicar alguém pelo WhatsApp: vaga de bairro anda no boca a boca, e o
 * boca a boca vira candidato. Link comum (funciona sem JavaScript); o
 * utm (whatsapp:indicacao, whatsapp:compartilhar) fica como origem da conta
 * nova em Admin › Campanhas.
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
  const link = `${url}?utm_source=whatsapp&utm_campaign=indicacao`;
  const texto = proprio
    ? vaga
      ? `Estou contratando: ${titulo} (${lugar}). Conhece alguém? Pode se candidatar de graça pelo Publike: ${link}`
      : `Estou atendendo: ${titulo} (${lugar}). Se conhecer quem precise, me indica: ${link}`
    : vaga
      ? `Lembrei de você: ${titulo} (${lugar}). É de graça para se candidatar no Publike: ${link}`
      : `Conhece quem precise? ${titulo} (${lugar}), no Publike: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** "Mandar no grupo": a vaga com o valor e o lugar, para o grupo do bairro ou da família. */
export function linkDoGrupo({
  url,
  titulo,
  lugar,
  valor,
}: {
  url: string;
  titulo: string;
  lugar: string;
  valor: string | null;
}) {
  const link = `${url}?utm_source=whatsapp&utm_campaign=compartilhar`;
  const quanto = valor && valor !== "A combinar" ? `, ${valor}` : "";
  const texto = `Vaga: ${titulo}${quanto}, ${lugar}. Candidate-se grátis pelo Publike: ${link}`;
  return `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** O quadro "Conhece quem faria essa vaga?" da página do anúncio. */
export function QuadroIndicar(props: Parameters<typeof linkDeIndicacao>[0] & { valor?: string | null }) {
  const { vaga, proprio, valor = null, ...resto } = props;
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
      <div className="flex flex-wrap gap-2">
        <a
          href={linkDeIndicacao({ ...resto, vaga, proprio })}
          target="_blank"
          rel="noopener noreferrer"
          className={classesBotao("secundario", "sm")}
        >
          <Send aria-hidden />
          {proprio ? "Pedir indicação no WhatsApp" : "Indicar alguém"}
        </a>
        {vaga && !proprio && (
          <a
            href={linkDoGrupo({ url: resto.url, titulo: resto.titulo, lugar: resto.lugar, valor })}
            target="_blank"
            rel="noopener noreferrer"
            className={classesBotao("secundario", "sm")}
          >
            <UsersRound aria-hidden />
            Mandar no grupo
          </a>
        )}
      </div>
    </div>
  );
}
