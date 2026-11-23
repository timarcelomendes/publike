import { KeyRound, Laptop } from "lucide-react";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { AbasAdmin, MenuAdmin, SeloAdmin, type ModoAdmin } from "@/components/admin/abas";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { JanelaDasConversas } from "@/components/admin/janela-das-conversas";
import { Aviso, Container, Logo } from "@/components/ui/basicos";
import { telasNoSite } from "@/lib/servidor/telas-do-admin";
import { numerosDoMenu } from "@/lib/admin/painel";
import { adminSemCookie, criarClienteAdmin, ehAdminLocal, exigirAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Publike" },
  robots: { index: false, follow: false },
};

export default function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  return (
    <Container className="py-8">
      <Suspense
        fallback={
          <>
            <Topo modo={null} />
            <div className="mt-6">
              <EsqueletoAdmin />
            </div>
          </>
        }
      >
        <ConteudoComModo>{children}</ConteudoComModo>
      </Suspense>
    </Container>
  );
}

async function ConteudoComModo({ children }: { children: ReactNode }) {
  // A equipe com login (moderador ou publike.org) vê as telas liberadas para ela; o admin pede o link do terminal.
  const admin = await ehAdminLocal();
  const telas = admin ? [] : await telasNoSite();
  const modo: ModoAdmin = admin ? "admin" : telas.length ? "moderador" : null;
  if (!modo && (await adminSemCookie())) return <AbrirPeloTerminal />;
  // a janela flutuante das conversas do WhatsApp: em todas as telas do Admin, para quem vê Admin › WhatsApp
  // o WhatsApp só para os números de teste: a faixa vermelha no alto de todas as telas (migração 20270916170000)
  const modoTeste =
    modo === "admin" || telas.includes("/admin/whatsapp") ? (
      <Suspense fallback={null}>
        <FaixaModoDeTeste admin={modo === "admin"} />
      </Suspense>
    ) : null;
  const conversas =
    modo === "admin" || telas.includes("/admin/whatsapp") ? (
      <Suspense fallback={null}>
        <JanelaDasConversas />
      </Suspense>
    ) : null;
  if (modo !== "admin") {
    return (
      <>
        <Topo modo={modo} telas={telas} />
        {modoTeste}
        <div className="mt-6">{children}</div>
        {conversas}
      </>
    );
  }
  // o admin: o menu da lateral (no celular, o "Seções" no alto) e a página ao lado
  return (
    <>
      <Topo modo={modo} />
      {modoTeste}
      <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start lg:gap-10">
        <Suspense fallback={<MenuAdmin numeros={{}} />}>
          <MenuComNumeros />
        </Suspense>
        <div className="min-w-0">{children}</div>
      </div>
      {conversas}
    </>
  );
}

/** O menu com os números do que espera a equipe (sem eles se o resumo falhar). */
async function MenuComNumeros() {
  // só os 2 números que o menu mostra (admin_numeros_do_menu; sem a migração, do resumo do Painel)
  const c = await exigirAdminLocal().catch(() => null);
  const n = c ? await numerosDoMenu(c).catch(() => null) : null;
  return <MenuAdmin numeros={n ? { "/admin/denuncias": n.denuncias, "/admin/anuncios": n.filaIA } : {}} />;
}

function Topo({ modo, telas = [] }: { modo: ModoAdmin; telas?: string[] }) {
  if (modo === "admin") {
    // o admin: a logo com o selo Admin (no computador ela fica no alto do menu lateral) e, à direita, discreto,
    // o lembrete de que só abre neste computador
    return (
      <div className="flex items-center justify-between gap-3">
        <h1 className="sr-only">Admin</h1>
        <Link href="/admin" className="flex items-center gap-2 lg:invisible" aria-label="Publike Admin: Painel">
          <Logo altura={24} />
          <SeloAdmin />
        </Link>
        <p className="flex items-center gap-1.5 text-caption font-normal text-ink-muted">
          <Laptop aria-hidden className="size-3.5 shrink-0" />
          Só neste computador
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {/* a equipe no site no ar: números e moderação no mesmo lugar */}
        <h1 className="text-h2 sm:text-h1">Equipe do Publike</h1>
      </div>
      {modo && <AbasAdmin modo={modo} telas={telas} />}
    </>
  );
}

/** O admin está ligado neste computador, mas este navegador ainda não abriu o link do terminal. */
function AbrirPeloTerminal() {
  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <h1 className="text-h2 sm:text-h1">Admin</h1>
      <Aviso tipo="info" titulo="Abra o admin pelo link do terminal">
        <p>
          Quando o <code>npm run dev</code> começa, ele mostra no terminal uma linha <strong>Admin do Publike</strong> com
          um link. Abra esse link neste navegador: ele grava uma chave que vale por 30 dias.
        </p>
        <p className="flex items-center gap-2 text-ink-muted">
          <KeyRound aria-hidden className="size-4 shrink-0" />
          Sem esse link, ninguém abre o admin, mesmo que alcance o seu computador pela rede.
        </p>
      </Aviso>
    </div>
  );
}

/**
 * O envio pelo WhatsApp está só para os números de teste (23/11/2026: ficou assim um dia inteiro, sem ninguém ver, e
 * 169 avisos foram descartados). Sem a migração 20270916170000, nada.
 */
async function FaixaModoDeTeste({ admin }: { admin: boolean }) {
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_whatsapp_modo_teste");
  const r = (data ?? {}) as { teste?: boolean; descartados?: number };
  if (error || !r.teste) return null;
  const n = Number(r.descartados) || 0;
  return (
    <div className="mt-4">
      <Aviso tipo="erro" titulo="O WhatsApp está só para os números de teste">
        Quem aceitou receber pelo WhatsApp não está recebendo nada
        {n > 0 ? `: ${n === 1 ? "1 aviso foi descartado" : `${n} avisos foram descartados`} nas últimas 24 horas` : ""}.{" "}
        <Link href="/admin/whatsapp?aba=parametros" className="underline underline-offset-2">
          Ligar para todos em Admin › WhatsApp › Parâmetros
        </Link>
      </Aviso>
    </div>
  );
}
