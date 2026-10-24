"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Botao } from "./botao";

/**
 * Pergunta antes de sair de um formulário com coisa por salvar. Um link do site abre a pergunta daqui
 * (salvar ou sair sem salvar); fechar a aba, recarregar ou ir para outro site fica com a pergunta do
 * próprio navegador, com o texto dele. O Safari do iPhone não pergunta ao fechar, e o Voltar do
 * celular não passa por aqui.
 */
export function AvisoAoSair({
  ativo,
  mudou,
  perguntarAoFechar = true,
  titulo,
  texto,
  rotuloSalvar,
  rotuloSair = "Sair sem salvar",
  podeSalvar = true,
  aoSalvar,
}: {
  ativo: boolean;
  /** conferido na hora de sair (sem: com `ativo`, sempre pergunta); ver useFormularioMudou */
  mudou?: () => boolean;
  /** false: fechar a aba e recarregar não perguntam (o que foi escrito já fica guardado no aparelho) */
  perguntarAoFechar?: boolean;
  titulo: string;
  texto: string;
  rotuloSalvar: string;
  rotuloSair?: string;
  podeSalvar?: boolean;
  aoSalvar: () => void;
}) {
  const router = useRouter();
  const janela = useRef<HTMLDialogElement>(null);
  const [destino, setDestino] = useState<string | null>(null);
  // a conferência mais nova, sem ligar e desligar a escuta a cada desenho
  const conferir = useRef(mudou);
  useEffect(() => {
    conferir.current = mudou;
  });

  useEffect(() => {
    if (!ativo) return;
    const temCoisaPorSalvar = () => !conferir.current || conferir.current();
    const aoDescarregar = (e: BeforeUnloadEvent) => {
      if (!temCoisaPorSalvar()) return;
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
      if (!temCoisaPorSalvar()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setDestino(`${url.pathname}${url.search}${url.hash}`);
    };
    if (perguntarAoFechar) window.addEventListener("beforeunload", aoDescarregar);
    window.addEventListener("click", aoClicar, true);
    return () => {
      window.removeEventListener("beforeunload", aoDescarregar);
      window.removeEventListener("click", aoClicar, true);
    };
  }, [ativo, perguntarAoFechar]);

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
            {rotuloSair}
          </Botao>
        </div>
      </div>
    </dialog>
  );
}

/** O que o formulário manda, em texto (de arquivo, o nome e o tamanho). */
function retratoDoFormulario(f: HTMLFormElement) {
  const partes: string[] = [];
  new FormData(f).forEach((v, k) => partes.push(`${k}=${typeof v === "string" ? v : `${v.name}:${v.size}`}`));
  return partes.join("\n");
}

/**
 * O `mudou` do AvisoAoSair para um formulário comum: compara o que ele manda agora com o de antes do
 * primeiro toque da pessoa (o que a página preenche sozinha ao abrir não conta) ou com o do último
 * salvar que deixou a pessoa na página (`salvo` muda a cada salvar que deu certo).
 */
export function useFormularioMudou(formulario: RefObject<HTMLFormElement | null>, salvo?: unknown) {
  const base = useRef<string | null>(null);
  useEffect(() => {
    const f = formulario.current;
    if (!f) return;
    const guardar = () => {
      if (base.current === null) base.current = retratoDoFormulario(f);
    };
    const eventos = ["pointerdown", "keydown", "focusin"] as const;
    for (const ev of eventos) f.addEventListener(ev, guardar, true);
    return () => {
      for (const ev of eventos) f.removeEventListener(ev, guardar, true);
    };
  }, [formulario]);
  useEffect(() => {
    if (salvo && formulario.current) base.current = retratoDoFormulario(formulario.current);
  }, [salvo, formulario]);
  return () => {
    const f = formulario.current;
    return f !== null && base.current !== null && retratoDoFormulario(f) !== base.current;
  };
}
