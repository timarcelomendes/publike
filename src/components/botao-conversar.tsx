import { MessagesSquare } from "lucide-react";
import { caminhoConversa } from "@/lib/conversas";
import { BotaoLink } from "./ui/botao";

/**
 * Abre a conversa com a outra pessoa dentro do Publike (uma por pessoa: as vagas em comum e a
 * conexão ficam juntas). `outroId` é a outra pessoa do match.
 */
export function BotaoConversar({ outroId, naoLidas = 0 }: { outroId: string; naoLidas?: number }) {
  return (
    <BotaoLink href={caminhoConversa(outroId)} tamanho="sm" className="self-start">
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
