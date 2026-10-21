"use client";

import { Check, Copy, MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

// "Links para mandar", ao lado da Hoje de quem contrata: a página com todas as vagas, o link de
// finalistas de cada vaga para o cliente (agência) e o link de cada vaga no ar, para copiar ou
// mandar no WhatsApp sem procurar dentro de cada vaga.

export type LinkParaMandar = {
  titulo: string;
  /** a linha de baixo: o endereço curto ou o estado ("ainda não criado") */
  detalhe: string;
  /** o endereço completo; sem ele, o link ainda não existe e o botão leva para criar */
  url?: string;
  /** o texto que vai com o link no WhatsApp */
  mensagem?: string;
  /** sem url: onde criar */
  criar?: string;
};

export function LinksParaMandar({ links, mais }: { links: LinkParaMandar[]; mais?: string }) {
  return (
    <section
      aria-labelledby="links-para-mandar"
      className="flex flex-col rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
    >
      <h2 id="links-para-mandar" className="text-h3">
        Links para mandar
      </h2>
      <p className="mt-1 text-body-sm text-ink-muted">Copie e mande no WhatsApp, no e-mail ou no site.</p>
      <ul className="mt-2 flex flex-col">
        {links.map((l) => (
          <li key={l.titulo} className="flex items-center gap-2 border-t border-line py-2.5 first:mt-1">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-label">{l.titulo}</span>
              <span className="block truncate text-body-sm text-ink-muted">{l.detalhe}</span>
            </span>
            {l.url ? (
              <BotoesDoLink url={l.url} nome={l.titulo} mensagem={l.mensagem} />
            ) : l.criar ? (
              <Link
                href={l.criar}
                aria-label={`Criar: ${l.titulo}`}
                className="grid size-10 shrink-0 place-items-center rounded-md border border-line hover:bg-surface-300"
              >
                <Plus aria-hidden className="size-[18px]" />
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
      {mais && (
        <Link
          href={mais}
          className="mt-1 self-start text-label text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Todos os links e o código para o site
        </Link>
      )}
    </section>
  );
}

/** Copiar e mandar no WhatsApp, lado a lado (também nas páginas Para o cliente e Links). */
export function BotoesDoLink({ url, nome, mensagem }: { url: string; nome: string; mensagem?: string }) {
  return (
    <>
      <Copiar texto={url} nome={nome} />
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${mensagem ?? nome}: ${url}`)}`}
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

function Copiar({ texto, nome }: { texto: string; nome: string }) {
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
