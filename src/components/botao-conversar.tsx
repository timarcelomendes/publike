import { MessagesSquare } from "lucide-react";
import { BotaoLink } from "./ui/botao";

/** Abre a conversa do match dentro do Publike. `outroId` é a outra pessoa do match. */
export function BotaoConversar({
  anuncioId,
  outroId,
  naoLidas = 0,
}: {
  anuncioId: string;
  outroId: string;
  naoLidas?: number;
}) {
  return (
    <BotaoLink href={`/painel/conversas/${anuncioId}/${outroId}`} tamanho="sm" className="self-start">
      <MessagesSquare aria-hidden />
      Conversar no Publike
      {naoLidas > 0 && (
        <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-pill bg-like px-1.5 text-caption text-on-like">
          {naoLidas}
          <span className="sr-only"> {naoLidas === 1 ? "mensagem nova" : "mensagens novas"}</span>
        </span>
      )}
    </BotaoLink>
  );
}
