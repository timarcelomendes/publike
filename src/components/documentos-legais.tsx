import Link from "next/link";
import type { ReactNode } from "react";
import { Container } from "@/components/ui/basicos";
import { CONTATO_EMAIL } from "@/lib/config";
import { VERSAO_TERMOS } from "@/lib/constantes";

// As três páginas das regras do site: Privacidade (/privacidade), Cookies (/cookies) e Regras (/regras).
// Todas com a mesma versão (a data em VERSAO_TERMOS) e uma barra para passar de uma para a outra.

const DOCUMENTOS = [
  { href: "/privacidade", nome: "Privacidade" },
  { href: "/cookies", nome: "Cookies" },
  { href: "/regras", nome: "Regras" },
] as const;

export type Documento = (typeof DOCUMENTOS)[number]["href"];

// "2026-10-13" -> "13 de outubro de 2026"
const DATA_DA_VERSAO = new Date(`${VERSAO_TERMOS}T12:00:00Z`).toLocaleDateString("pt-BR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function PaginaDoDocumento({
  atual,
  titulo,
  resumo,
  children,
}: {
  atual: Documento;
  titulo: string;
  resumo: string;
  children: ReactNode;
}) {
  return (
    <Container className="max-w-3xl py-10">
      <nav aria-label="Regras do site" className="mb-6 flex flex-wrap gap-2">
        {DOCUMENTOS.map((d) => (
          <Link
            key={d.href}
            href={d.href}
            aria-current={d.href === atual ? "page" : undefined}
            className={
              d.href === atual
                ? "inline-flex min-h-10 items-center rounded-pill bg-ink px-4 text-label text-surface-100"
                : "inline-flex min-h-10 items-center rounded-pill border border-line-strong px-4 text-label hover:bg-surface-300"
            }
          >
            {d.nome}
          </Link>
        ))}
      </nav>
      <h1 className="text-h1">{titulo}</h1>
      <p className="mt-3 mb-8 text-body-lg text-ink-muted">
        {resumo} Versão de {DATA_DA_VERSAO}.
      </p>
      <div className="flex flex-col gap-8">{children}</div>
    </Container>
  );
}

/** Onde mandar pedidos sobre os dados: o e-mail de contato ou, sem ele, a página de sugestões. */
export function CanalDePedidos() {
  return CONTATO_EMAIL ? (
    <a href={`mailto:${CONTATO_EMAIL}`} className="underline">
      {CONTATO_EMAIL}
    </a>
  ) : (
    <Link href="/sugerir" className="underline">
      Sugestões e erros
    </Link>
  );
}

export function Secao({ id, titulo, children }: { id?: string; titulo: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line pt-8">
      <h2 className="text-h2">{titulo}</h2>
      <div className="mt-3 flex flex-col gap-3 text-body text-ink">{children}</div>
    </section>
  );
}

export function Lista({ itens }: { itens: ReactNode[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {itens.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-pill bg-ink" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
