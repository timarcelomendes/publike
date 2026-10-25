"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import type { ModoPainel } from "@/lib/modo-painel";
import { abaDoCaminho } from "./barra-inferior-ativa";
import { abasDoTopo, type AbaInferior, type NumerosDaBarra } from "./barra-inferior-base";
import { useMensagensNovas } from "./numero-do-chat";

/** Link do menu do topo, sublinhado na página aberta (`ativo`; sem ele, pelo endereço). */
export function LinkTopo({ href, ativo, children }: { href: string; ativo?: boolean; children: ReactNode }) {
  const caminho = usePathname() ?? "";
  const aceso = ativo ?? (href === "/" ? caminho === "/" : caminho.startsWith(href));
  return (
    <Link
      href={href}
      aria-current={aceso ? "page" : undefined}
      className={`relative inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-label whitespace-nowrap transition-colors hover:bg-surface-300 hover:text-ink ${
        aceso
          ? "text-ink after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-pill after:bg-ink"
          : "text-ink-muted"
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * A aba acesa no topo: a da barra de baixo, mais a terceira (Talentos de quem contrata, a Vitrine de
 * quem presta serviço). O Publicar é o botão da direita, não uma aba.
 */
function abaDoTopo(caminho: string, tipo: string | null, modo: ModoPainel): AbaInferior {
  if (modo === "contratar" && (caminho.startsWith("/talentos") || caminho.startsWith("/painel/talentos")))
    return "terceira";
  if (modo === "servicos" && caminho.startsWith("/painel/servicos")) return "terceira";
  const aba = abaDoCaminho(caminho, tipo, modo);
  return aba === "publicar" ? null : aba;
}

/**
 * O menu do topo de quem entrou (computador): as abas da atividade da conta, as mesmas da barra de
 * baixo do celular, com os números do que espera a pessoa.
 */
export function NavDaConta({ modo, numeros }: { modo: ModoPainel; numeros: NumerosDaBarra }) {
  const caminho = usePathname() ?? "";
  const tipo = useSearchParams().get("tipo");
  // o número das mensagens acompanha o Chat (chega mensagem, a pessoa lê)
  const mensagens = useMensagensNovas(numeros.mensagens ?? 0);
  const ativa = abaDoTopo(caminho, tipo, modo);
  return (
    <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
      {abasDoTopo(modo, { ...numeros, mensagens }).map((a) => (
        <LinkTopo key={a.id} href={a.href} ativo={ativa === a.id}>
          {a.nome}
          {a.numero ? (
            <span className="min-w-5 rounded-pill bg-like px-1.5 text-center text-caption leading-5 text-on-like tabular-nums">
              <span aria-hidden>{a.numero > 99 ? "99+" : a.numero}</span>
              <span className="sr-only">, {a.leitor}</span>
            </span>
          ) : null}
        </LinkTopo>
      ))}
    </nav>
  );
}
