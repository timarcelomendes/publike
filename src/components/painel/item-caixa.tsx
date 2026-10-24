import { CalendarClock, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { tempoRelativo } from "@/lib/formato";
import { dataDaEntrevista } from "@/lib/recrutamento";
import type { ItemCaixa } from "@/lib/servidor/caixa";
import { Avatar } from "../ui/basicos";
import { NotaAderencia } from "./nota-aderencia";

/** Uma pessoa na lista da caixa de entrada (e em "Esperando sua resposta", no Hoje). */
export function ItemDaLista({ c, agora, href, aberto }: { c: ItemCaixa; agora: number; href: string; aberto: boolean }) {
  const encerrado = c.status === "dispensada" || c.status === "desfeito";
  return (
    <li>
      <Link
        href={href}
        scroll={false}
        aria-current={aberto ? "true" : undefined}
        className={`flex gap-3 px-4 py-3 transition-colors ${
          aberto ? "bg-surface-300 shadow-[inset_3px_0_0_var(--color-ink)]" : "hover:bg-surface-300"
        }`}
      >
        <Avatar nome={c.nome} foto={c.foto} tamanho={40} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-label">{c.nome}</span>
            {c.aderencia && !encerrado && <NotaAderencia a={c.aderencia} />}
          </span>
          {/* o título da vaga encurta; a hora fica sempre inteira */}
          <span className="flex min-w-0 gap-1 text-body-sm text-ink-muted">
            <span className="truncate">{c.anuncio_titulo}</span>
            <span className="shrink-0 whitespace-nowrap">· {tempoRelativo(c.curtido_em, agora)}</span>
          </span>
          {c.entrevista ? (
            <span className="mt-0.5 flex items-center gap-1.5 text-body-sm font-semibold">
              <CalendarClock aria-hidden className="size-4 shrink-0 text-ink-muted" />
              {dataDaEntrevista(c.entrevista.quando)}
            </span>
          ) : c.aceita ? (
            <span className="mt-0.5 block text-body-sm text-ink-muted">Aceito: esperando o currículo</span>
          ) : c.mensagem && !encerrado ? (
            <span className="mt-0.5 line-clamp-1 text-body-sm text-ink">“{c.mensagem}”</span>
          ) : null}
          {c.naoLidas > 0 && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-pill bg-ink px-2 text-caption leading-5 text-surface-100">
              <MessagesSquare aria-hidden className="size-3.5" />
              {c.naoLidas} {c.naoLidas === 1 ? "mensagem nova" : "mensagens novas"}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
