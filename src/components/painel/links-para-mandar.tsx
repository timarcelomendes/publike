"use client";

import { Check, Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { classesBotao } from "../ui/botao";

// Os botões de copiar e mandar no WhatsApp um link (as páginas Para o cliente e Links). O bloco "Links para mandar"
// saiu da Hoje em 08/11/2026: cada vaga tem o Divulgar.

/** Copiar e mandar no WhatsApp, lado a lado (também nas páginas Para o cliente e Links). */
export function BotoesDoLink({
  url,
  nome,
  mensagem,
  comNome = false,
}: {
  url: string;
  nome: string;
  mensagem?: string;
  /** botões com o nome escrito ("Copiar o link", "WhatsApp"), na altura dos outros botões; sem ele, só o ícone */
  comNome?: boolean;
}) {
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(`${mensagem ?? nome}: ${url}`)}`;
  if (comNome) {
    return (
      <>
        <Copiar texto={url} nome={nome} comNome />
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Mandar no WhatsApp: ${nome}`}
          className={classesBotao("secundario", "sm")}
        >
          <MessageCircle aria-hidden />
          WhatsApp
        </a>
      </>
    );
  }
  return (
    <>
      <Copiar texto={url} nome={nome} />
      <a
        href={whatsapp}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Mandar no WhatsApp: ${nome}`}
        className="grid size-10 shrink-0 place-items-center rounded-md border border-line hover:bg-surface-300"
      >
        <MessageCircle aria-hidden className="size-[18px]" />
      </a>
    </>
  );
}

function Copiar({ texto, nome, comNome = false }: { texto: string; nome: string; comNome?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // sem a área de transferência: a pessoa abre o link e copia do navegador
      window.open(texto, "_blank", "noopener");
    }
  }
  if (comNome) {
    return (
      <button
        type="button"
        onClick={copiar}
        aria-label={copiado ? `Copiado: ${nome}` : `Copiar o link: ${nome}`}
        className={classesBotao("secundario", "sm")}
      >
        {copiado ? <Check aria-hidden className="text-cerrado-text" /> : <Copy aria-hidden />}
        {copiado ? "Copiado" : "Copiar o link"}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={copiado ? `Copiado: ${nome}` : `Copiar o link: ${nome}`}
      className="grid size-10 shrink-0 place-items-center rounded-md border border-line hover:bg-surface-300"
    >
      {copiado ? (
        <Check aria-hidden className="size-[18px] text-cerrado-text" />
      ) : (
        <Copy aria-hidden className="size-[18px]" />
      )}
    </button>
  );
}

/** "Divulgar a vaga": copia o link (com texto), para colar no WhatsApp ou nos grupos. */
export function CopiarLinkDaVaga({ url }: { url: string }) {
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      window.open(url, "_blank", "noopener");
    }
  }
  return (
    <button
      type="button"
      onClick={copiar}
      className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300"
    >
      {copiado ? (
        <Check aria-hidden className="size-[18px] text-cerrado-text" />
      ) : (
        <Copy aria-hidden className="size-[18px]" />
      )}
      <span aria-live="polite">{copiado ? "Link copiado" : "Copiar o link da vaga"}</span>
    </button>
  );
}
