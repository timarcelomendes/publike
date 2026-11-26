"use client";

import { CircleCheck, CircleHelp, Hourglass, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { perguntarSeContinua } from "@/lib/acoes/vaga-continua";
import { linhaDaContinua, type SituacaoContinua } from "@/lib/vaga-continua";
import { pedirEntrar } from "../folha-de-entrar";

const ICONES = {
  confirmada: CircleCheck,
  aguardando: Hourglass,
  sem_resposta: CircleHelp,
  perguntou: Hourglass,
  perguntar: MessageCircleQuestion,
} as const;

/**
 * A vaga ainda está aberta? (migração 20271003120000): a confirmação de quem publicou, a pergunta em andamento ou o botão
 * "Ainda está aberta?". No cartão (`cartao`), uma linha curta entre os indicadores, e o botão só com 10 curtidas ou mais;
 * na página da vaga, junto de quando foi publicada.
 */
export function SituacaoDaContinua({
  anuncioId,
  situacao,
  agora,
  logado,
  cartao = false,
  curtidas = null,
}: {
  anuncioId: string;
  situacao: SituacaoContinua | null | undefined;
  agora: number;
  logado: boolean;
  cartao?: boolean;
  curtidas?: number | null;
}) {
  const [perguntou, setPerguntou] = useState<{ confirmada: boolean } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  const efetiva: SituacaoContinua | null = perguntou
    ? perguntou.confirmada
      ? { estado: "confirmada", confirmadaEm: null, pedi: false }
      : { estado: situacao?.estado ?? "pode_perguntar", confirmadaEm: situacao?.confirmadaEm ?? null, pedi: true }
    : (situacao ?? null);
  const linha = linhaDaContinua(efetiva, agora, { cartao, curtidas });
  if (!linha) return null;
  const Icone = ICONES[linha.tipo];
  const cor =
    linha.tipo === "confirmada" ? "text-cerrado-text" : linha.tipo === "sem_resposta" ? "text-terra-text" : "text-ink-muted";

  if (linha.tipo !== "perguntar") {
    return (
      <span className={`flex items-center gap-1 ${cor}`}>
        <Icone aria-hidden className="size-4 shrink-0" />
        <span className="leading-tight">{linha.texto}</span>
      </span>
    );
  }

  const classeBotao = `relative z-10 inline-flex min-h-9 items-center gap-1 rounded-pill text-label underline underline-offset-2 hover:text-ink disabled:opacity-60 ${
    cartao ? "text-ink-muted" : "text-ink"
  }`;
  const proximo = `/anuncio/${anuncioId}`;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {/* sem resposta da empresa (na página da vaga): o aviso e o "Perguntar de novo" */}
      {linha.texto && (
        <span className="flex items-center gap-1 text-terra-text">
          <CircleHelp aria-hidden className="size-4 shrink-0" />
          <span className="leading-tight">{linha.texto}</span>
        </span>
      )}
      {logado ? (
        <button
          type="button"
          disabled={pendente}
          className={classeBotao}
          title="Pergunta à empresa se a vaga continua aberta. Você recebe a resposta no aviso."
          onClick={() =>
            iniciar(async () => {
              const r = await chamarAcao(() => perguntarSeContinua(anuncioId));
              if (r.ok) {
                setErro(null);
                setPerguntou({ confirmada: "confirmada" in r && Boolean(r.confirmada) });
              } else setErro(r.erro);
            })
          }
        >
          {!linha.texto && <MessageCircleQuestion aria-hidden className="size-4 shrink-0" />}
          {pendente ? "Perguntando…" : linha.botao}
        </button>
      ) : (
        <Link
          rel="nofollow"
          href={`/entrar?next=${encodeURIComponent(proximo)}`}
          onClick={(e) => {
            if (pedirEntrar({ proximo })) e.preventDefault();
          }}
          className={classeBotao}
        >
          {!linha.texto && <MessageCircleQuestion aria-hidden className="size-4 shrink-0" />}
          {linha.botao}
        </Link>
      )}
      {erro && (
        <span role="alert" className="text-body-sm text-terra-text">
          {erro}
        </span>
      )}
    </span>
  );
}
