"use client";

import { Lock } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Botao, BotaoLink } from "./botao";

// O que é dos planos, à vista para quem está no grátis: o toque abre o pedido para assinar (11/11/2026), em vez de
// um cadeado ou de um liga travado que não fazem nada. O mesmo quadro do "sair sem salvar": embaixo no celular, no
// meio no computador.

type Pedido = {
  titulo: string;
  texto: ReactNode;
  /** para onde vai o botão (os planos, ou a assinatura de um recurso) */
  href?: string;
  acao?: string;
};

/** O quadro do pedido, aberto por quem chama (o liga de uma vaga, de uma regra). */
export function JanelaPedirPlano({
  aberta,
  fechar,
  titulo,
  texto,
  href = "/painel/planos",
  acao = "Ver os planos",
}: Pedido & { aberta: boolean; fechar: () => void }) {
  const janela = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    if (aberta && !janela.current?.open) janela.current?.showModal();
    if (!aberta && janela.current?.open) janela.current.close();
  }, [aberta]);
  return (
    <dialog
      ref={janela}
      aria-labelledby={`${id}-t`}
      aria-describedby={`${id}-x`}
      onClose={fechar}
      onClick={(e) => {
        // toque fora do quadro: fecha
        if (e.target === e.currentTarget) fechar();
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-lg border border-line-strong bg-surface-200 p-0 text-ink shadow-raised backdrop:bg-veu sm:m-auto sm:max-w-md sm:rounded-lg"
    >
      <div className="flex flex-col gap-5 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-7">
        <div>
          <h2 id={`${id}-t`} className="text-h2 text-balance">
            {titulo}
          </h2>
          <div id={`${id}-x`} className="mt-2 text-body text-ink-muted">
            {texto}
          </div>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <BotaoLink href={href} variante="primario">
            {acao}
          </BotaoLink>
          <Botao onClick={fechar}>Agora não</Botao>
        </div>
      </div>
    </dialog>
  );
}

/** O lugar travado (um número, uma parte da tela) como botão que abre o pedido. */
export function PedirPlano({
  rotulo,
  children,
  className = "",
  ...pedido
}: Pedido & {
  /** o que o leitor de tela diz do botão ("Até 15 min de ônibus: nos planos") */
  rotulo: string;
  /** o que aparece no lugar travado (sem nada: o cadeado) */
  children?: ReactNode;
  className?: string;
}) {
  const [aberta, setAberta] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={rotulo}
        aria-haspopup="dialog"
        onClick={() => setAberta(true)}
        className={`inline-flex min-h-10 items-center gap-1.5 rounded-md text-label text-ink-muted hover:text-ink ${className}`}
      >
        {children ?? <Lock aria-hidden className="size-5" />}
      </button>
      <JanelaPedirPlano aberta={aberta} fechar={() => setAberta(false)} {...pedido} />
    </>
  );
}
