import { CalendarClock, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { abaDaEtapa, esperaResposta } from "@/lib/constantes";
import { tempoRelativo } from "@/lib/formato";
import { quandoDaEntrevista } from "@/lib/recrutamento";
import type { ItemCaixa } from "@/lib/servidor/caixa";
import { Avatar } from "../ui/basicos";
import { NotaAderencia } from "./nota-aderencia";

/**
 * Onde a pessoa está, em palavras (claude/plano-fluxo-contratar.md: usar sem perguntar). `destaque`: pede uma ação
 * sua agora (responder, marcar a data, decidir depois da entrevista).
 */
export function estadoEmPalavras(c: ItemCaixa, agora: number): { texto: string; destaque: boolean } {
  if (c.status === "dispensada") return { texto: "Dispensado", destaque: false };
  if (c.status === "desfeito") return { texto: "Desfez o match", destaque: false };
  if (esperaResposta(c))
    return { texto: `Espera a sua resposta · ${tempoRelativo(c.curtido_em, agora)}`, destaque: true };
  if (c.aceita) return { texto: "Aceito: esperando o currículo", destaque: false };
  const aba = abaDaEtapa(c);
  if (aba === "contratados") return { texto: "Contratado", destaque: false };
  if (aba === "nao_seguiu") return { texto: "Não seguiu", destaque: false };
  if (c.entrevista) {
    if (c.entrevista.situacao === "escolher") return { texto: "Escolhendo o horário da entrevista", destaque: false };
    if (new Date(c.entrevista.quando).getTime() < agora)
      return { texto: `Entrevista foi ${quandoDaEntrevista(c.entrevista)}: decida`, destaque: true };
    return { texto: `Entrevista ${quandoDaEntrevista(c.entrevista)}`, destaque: false };
  }
  if (aba === "entrevista") return { texto: "Entrevista sem data: marque na ficha", destaque: true };
  if (aba === "analise") return { texto: "Aceito · você está olhando", destaque: false };
  return { texto: `Aceito · ${tempoRelativo(c.curtido_em, agora)}`, destaque: false };
}

/** Uma pessoa na lista de Candidatos (e em "Esperando sua resposta", no Hoje). `comVaga`: mostra a vaga dela. */
export function ItemDaLista({
  c,
  agora,
  href,
  aberto,
  comVaga = true,
}: {
  c: ItemCaixa;
  agora: number;
  href: string;
  aberto: boolean;
  comVaga?: boolean;
}) {
  const encerrado = c.status === "dispensada" || c.status === "desfeito";
  const estado = estadoEmPalavras(c, agora);
  return (
    <li>
      {/* data-mesa-*: com a lista recolhida (recolher-lista.tsx), fica só a foto, com o ponto de quem pede você */}
      <Link
        href={href}
        scroll={false}
        aria-current={aberto ? "true" : undefined}
        title={`${c.nome}: ${estado.texto}`}
        data-mesa-item
        className={`relative flex gap-3 px-4 py-3 transition-colors ${
          aberto ? "bg-surface-300 shadow-[inset_3px_0_0_var(--color-ink)]" : "hover:bg-surface-300"
        }`}
      >
        <span className="relative shrink-0 self-start">
          <Avatar nome={c.nome} foto={c.foto} tamanho={40} />
          {(estado.destaque || c.naoLidas > 0) && !encerrado && (
            <span
              aria-hidden
              data-mesa-ponto
              className={`absolute -top-0.5 -right-0.5 hidden size-3 rounded-pill ring-2 ring-surface-200 ${
                estado.destaque ? "bg-terra" : "bg-ink"
              }`}
            />
          )}
        </span>
        <span data-mesa-texto className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-label">{c.nome}</span>
            {c.aderencia && !encerrado && <NotaAderencia a={c.aderencia} />}
          </span>
          {comVaga && <span className="block truncate text-body-sm text-ink-muted">{c.anuncio_titulo}</span>}
          <span
            className={`mt-0.5 flex items-center gap-1.5 text-body-sm ${
              estado.destaque ? "font-semibold text-terra-text" : "text-ink-muted"
            }`}
          >
            {c.entrevista && <CalendarClock aria-hidden className="size-4 shrink-0" />}
            {estado.texto}
          </span>
          {c.mensagem && !encerrado && esperaResposta(c) && (
            <span className="mt-0.5 line-clamp-1 text-body-sm text-ink">“{c.mensagem}”</span>
          )}
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
