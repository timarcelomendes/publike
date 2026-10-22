"use client";

import { PenLine, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { COOKIE_CONVITE_RECADO, valorConviteRecadoFechado } from "@/lib/convite-recado";
import { ConviteRecado, type TextoDoConvite } from "../../recados/convite-recado";
import { EscreverRecado } from "../../recados/escrever-recado";
import { EVENTO_FILTROS } from "./abas-da-linha";

/**
 * No celular e no tablet, a busca, o Filtros (só no celular, um ícone: no tablet ele fica na linha das
 * abas) e o "Recado" numa linha só (a primeira vaga sobe na tela): o campo do recado abre ao tocar no
 * botão. No computador, a busca fica no cabeçalho e o campo do recado aparece sempre. Para a conta
 * que nunca deixou recado, um convite aponta para o campo (o "Escrever meu recado" abre e põe o cursor nele).
 */
export function BuscaERecado({
  busca,
  recado,
  mudados = 0,
  convite = null,
}: {
  busca: ReactNode;
  /** sem conta (ou só olhando), sem o Recado */
  recado?: ComponentProps<typeof EscreverRecado>;
  /** quantos filtros foram mudados (o número no ícone) */
  mudados?: number;
  /** a conta nunca deixou recado (e não fechou o convite há pouco): o convite em cima do campo */
  convite?: TextoDoConvite | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [focar, setFocar] = useState(0);
  const [comConvite, setComConvite] = useState(Boolean(convite));

  // "Agora não": volta em 7 dias, até 3 vezes (o servidor lê o cookie)
  function fecharConvite() {
    const atual = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_CONVITE_RECADO}=([^;]*)`))?.[1];
    const valor = valorConviteRecadoFechado(atual ? decodeURIComponent(atual) : null, Date.now());
    document.cookie = `${COOKIE_CONVITE_RECADO}=${encodeURIComponent(valor)}; path=/; max-age=${60 * 60 * 24 * 180}; samesite=lax`;
    setComConvite(false);
  }
  const id = useId();
  return (
    <>
      <div className="flex items-center gap-2 lg:hidden">
        <div className="min-w-0 flex-1">{busca}</div>
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(EVENTO_FILTROS))}
          title="Filtros"
          className="relative grid size-12 shrink-0 place-items-center rounded-pill border border-line bg-surface-200 text-ink hover:bg-surface-300 sm:hidden"
        >
          <SlidersHorizontal aria-hidden className="size-[18px]" />
          <span className="sr-only">Filtros</span>
          {mudados > 0 && (
            <span className="absolute -top-1 -right-1 min-w-5 rounded-pill bg-ink px-1.5 text-center text-caption leading-5 text-surface-100">
              {mudados}
              <span className="sr-only"> {mudados === 1 ? "mudado" : "mudados"}</span>
            </span>
          )}
        </button>
        {recado && (
          <button
            type="button"
            aria-expanded={aberto}
            aria-controls={id}
            onClick={() => {
              if (!aberto) setFocar((n) => n + 1);
              setAberto(!aberto);
            }}
            className={`inline-flex h-12 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
              aberto ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-200 text-ink hover:bg-surface-300"
            }`}
          >
            <PenLine aria-hidden className="size-[18px]" />
            Recado
            <span className="sr-only">: escrever um recado para quem está perto</span>
          </button>
        )}
      </div>
      {recado && convite && comConvite && (
        <ConviteRecado
          texto={convite}
          aoFechar={fecharConvite}
          aoEscrever={() => {
            setComConvite(false);
            setAberto(true);
            setFocar((n) => n + 1);
          }}
        />
      )}
      {recado && (
        <div id={id} className={aberto ? "" : "max-lg:hidden"}>
          <EscreverRecado {...recado} focar={focar} aoEnviar={() => setComConvite(false)} />
        </div>
      )}
    </>
  );
}
