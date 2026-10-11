"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { lerUltimaBusca } from "@/lib/ultima-busca";
import type { TipoAnuncio } from "@/lib/tipos";

const nada = () => () => {};

/**
 * Topo da página do anúncio. Quem veio da busca do Publike volta para ela como deixou
 * (com os filtros). Quem chegou direto (Google, WhatsApp) vê "Ver mais vagas perto de
 * você" (ou profissionais) e vai para a busca do mesmo tipo.
 */
export function VerMaisPerto({ tipo }: { tipo: TipoAnuncio }) {
  const ultima = useSyncExternalStore(nada, lerUltimaBusca, () => null);
  return (
    <Link
      href={ultima ?? `/?tipo=${tipo}`}
      className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {ultima
        ? "Voltar para a busca"
        : tipo === "vaga"
          ? "Ver mais vagas perto de você"
          : "Ver mais profissionais perto de você"}
    </Link>
  );
}
