import { ArrowLeft, ChevronRight, KanbanSquare, List, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/config";
import { STATUS_ANUNCIO } from "@/lib/constantes";
import { copilotoLiberado } from "@/lib/dados";
import { formatarLugar } from "@/lib/formato";
import type { StatusAnuncio } from "@/lib/tipos";
import { SeloCortesia } from "../selo-cortesia";
import { Selo } from "../ui/basicos";
import { CopiarLinkDaVaga } from "./links-para-mandar";
import { MaisDaVaga } from "./mais-da-vaga";

export type AbaDaVaga = "candidatos" | "copiloto" | "testes" | "editar";

/**
 * O alto de toda página de uma vaga no painel: a volta para Vagas, o nome, onde e quantos candidatos, o
 * link da vaga, o "Mais" e as abas (Candidatos, Copiloto, Testes e Editar). Assim a vaga é um lugar só:
 * de qualquer aba se chega às outras.
 */
export async function CabecalhoDaVaga({
  anuncio,
  aba,
  resumo,
  cliente,
  acoes,
  nota,
}: {
  anuncio: { id: string; titulo: string; status: string; cidade: string; bairro: string | null };
  aba: AbaDaVaga;
  /** "3 candidatos · 1 para responder" */
  resumo?: string | null;
  /** agência: o cliente da vaga, na trilha */
  cliente?: { id: string; nome: string } | null;
  /** botões a mais, à direita (agência: os finalistas) */
  acoes?: ReactNode;
  /** uma linha embaixo do nome (agência: o cliente em sigilo) */
  nota?: ReactNode;
}) {
  const copiloto = await copilotoLiberado();
  const status = anuncio.status as StatusAnuncio;
  const noAr = status === "ativo";
  const id = anuncio.id;
  const abas: { aba: AbaDaVaga; nome: string; href: string; icone?: ReactNode; cortesia?: boolean }[] = [
    { aba: "candidatos", nome: "Candidatos", href: `/painel/anuncio/${id}/quadro` },
    ...(copiloto
      ? [
          {
            aba: "copiloto" as const,
            nome: "Copiloto",
            href: `/painel/anuncio/${id}/copiloto`,
            icone: <Sparkles aria-hidden className="size-4 text-terra-text" />,
            cortesia: true,
          },
        ]
      : []),
    { aba: "testes", nome: "Testes", href: `/painel/anuncio/${id}/testes`, cortesia: true },
    { aba: "editar", nome: "Editar", href: `/painel/anuncio/${id}/editar` },
  ];
  return (
    <div className="flex flex-col gap-3">
      <nav aria-label="Trilha" className="flex flex-wrap items-center gap-1 text-label text-ink-muted">
        <Link href="/painel/anuncios?tipo=vaga" className="inline-flex min-h-11 items-center gap-1.5 hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" />
          Vagas
        </Link>
        {cliente && (
          <>
            <ChevronRight aria-hidden className="size-4" />
            <Link href={`/painel/clientes/${cliente.id}`} className="inline-flex min-h-11 items-center hover:text-ink">
              {cliente.nome}
            </Link>
          </>
        )}
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Selo variante={noAr ? "match" : "contorno"}>{STATUS_ANUNCIO[status]?.nome ?? status}</Selo>
            <span className="text-body-sm text-ink-muted">
              {[formatarLugar(anuncio.bairro, anuncio.cidade), resumo].filter(Boolean).join(" · ")}
            </span>
          </div>
          <h2 className="mt-2 text-h2">{anuncio.titulo}</h2>
          {nota}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {acoes}
          {noAr && <CopiarLinkDaVaga url={`${SITE_URL}/anuncio/${id}`} />}
          <MaisDaVaga id={id} noAr={noAr} />
        </div>
      </div>
      <nav aria-label="Partes da vaga" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {abas.map((a) => (
            <li key={a.aba}>
              <Link
                href={a.href}
                scroll={false}
                aria-current={a.aba === aba ? "page" : undefined}
                className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-2 px-3 text-label ${
                  a.aba === aba ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
                }`}
              >
                {a.icone}
                {a.nome}
                {a.cortesia && <SeloCortesia curto />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Dentro de Candidatos: o quadro (por etapa) ou a lista, a escolha de cada um. */
export function VistaDosCandidatos({ id, atual }: { id: string; atual: "quadro" | "lista" }) {
  const opcoes = [
    { vista: "quadro" as const, nome: "Quadro", href: `/painel/anuncio/${id}/quadro`, icone: KanbanSquare },
    { vista: "lista" as const, nome: "Lista", href: `/painel/anuncio/${id}`, icone: List },
  ];
  return (
    <div
      role="group"
      aria-label="Ver os candidatos em"
      className="inline-flex self-start rounded-pill border border-line p-1"
    >
      {opcoes.map((o) => {
        const Icone = o.icone;
        const ativo = o.vista === atual;
        return (
          <Link
            key={o.vista}
            href={o.href}
            scroll={false}
            aria-current={ativo ? "page" : undefined}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3.5 text-label ${
              ativo ? "bg-ink text-surface-100" : "text-ink-muted hover:text-ink"
            }`}
          >
            <Icone aria-hidden className="size-4" />
            {o.nome}
          </Link>
        );
      })}
    </div>
  );
}
