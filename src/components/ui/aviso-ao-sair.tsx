"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Botao } from "./botao";

/**
 * Pergunta antes de sair de um formulário com coisa por salvar. Um link do site abre a pergunta daqui
 * (salvar ou sair sem salvar); fechar a aba, recarregar ou ir para outro site fica com a pergunta do
 * próprio navegador, com o texto dele. O Safari do iPhone não pergunta ao fechar, e o Voltar do
 * celular não passa por aqui.
 */
export function AvisoAoSair({
  ativo,
  titulo,
  texto,
  rotuloSalvar,
  podeSalvar = true,
  aoSalvar,
}: {
  ativo: boolean;
  titulo: string;
  texto: string;
  rotuloSalvar: string;
  podeSalvar?: boolean;
  aoSalvar: () => void;
}) {
  const router = useRouter();
  const janela = useRef<HTMLDialogElement>(null);
  const [destino, setDestino] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo) return;
    const aoDescarregar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // navegadores mais antigos só perguntam com isso
      e.returnValue = "";
    };
    // na captura, antes do Link do Next: o clique para aqui e a pergunta aparece
    const aoClicar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;
      const url = new URL(link.href);
      // outro site: fica com a pergunta do navegador; a mesma página (uma âncora): não sai
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setDestino(`${url.pathname}${url.search}${url.hash}`);
    };
    window.addEventListener("beforeunload", aoDescarregar);
    window.addEventListener("click", aoClicar, true);
    return () => {
      window.removeEventListener("beforeunload", aoDescarregar);
      window.removeEventListener("click", aoClicar, true);
    };
  }, [ativo]);

  useEffect(() => {
    if (destino && !janela.current?.open) janela.current?.showModal();
  }, [destino]);

  function fechar() {
    janela.current?.close();
    setDestino(null);
  }

  return (
    <dialog
      ref={janela}
      aria-labelledby="sair-sem-salvar-titulo"
      aria-describedby="sair-sem-salvar-texto"
      onClose={() => setDestino(null)}
      onClick={(e) => {
        // toque fora do quadro: fica na página
        if (e.target === e.currentTarget) fechar();
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-lg border border-line-strong bg-surface-200 p-0 text-ink shadow-raised backdrop:bg-veu sm:m-auto sm:max-w-md sm:rounded-lg"
    >
      <div className="flex flex-col gap-5 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-7">
        <div>
          <h2 id="sair-sem-salvar-titulo" className="text-h2 text-balance">
            {titulo}
          </h2>
          <p id="sair-sem-salvar-texto" className="mt-2 text-body text-ink-muted">
            {texto}
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Botao
            variante="primario"
            disabled={!podeSalvar}
            onClick={() => {
              fechar();
              aoSalvar();
            }}
            className="w-full"
          >
            {rotuloSalvar}
          </Botao>
          <Botao
            variante="fantasma"
            onClick={() => {
              const para = destino;
              fechar();
              if (para) router.push(para);
            }}
            className="w-full"
          >
            Sair sem salvar
          </Botao>
        </div>
      </div>
    </dialog>
  );
}
