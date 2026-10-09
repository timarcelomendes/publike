import { Laptop } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MODO_DEMO } from "@/lib/config";
import { ehModerador, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { ehAdminLocal } from "@/lib/supabase/admin";
import { BotaoEntrarCabecalho, BotaoPublicar, BotaoPublicarCabecalho } from "./botao-publicar";
import { MenuUsuario } from "./menu-usuario";
import { Notificacoes } from "./notificacoes";
import { Container, Logo } from "./ui/basicos";

function LinkNav({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="rounded-md px-3 py-2 text-label text-ink-muted transition-colors hover:bg-surface-300 hover:text-ink">
      {children}
    </Link>
  );
}

export function Cabecalho() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface-100/90 backdrop-blur-md">
      <Container className="flex h-16 items-center gap-2">
        <Link href="/" aria-label="Publike, página inicial" className="mr-3 shrink-0 rounded-sm">
          <Logo altura={30} />
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          <LinkNav href="/?tipo=vaga">Vagas</LinkNav>
          <LinkNav href="/?tipo=servico">Serviços</LinkNav>
          <LinkNav href="/como-funciona">Como funciona</LinkNav>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {/* No celular, "Publicar" fica na barra de baixo */}
          <Suspense fallback={<BotaoPublicar />}>
            <BotaoPublicarCabecalho />
          </Suspense>
          <Suspense fallback={<div className="size-10 animate-pulse rounded-pill bg-surface-300" />}>
            <AreaUsuario />
          </Suspense>
        </div>
      </Container>
    </header>
  );
}

/** Só aparece no computador do dono, com o admin ligado. */
function LinkAdmin() {
  return (
    <Link
      href="/admin"
      className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-label text-ink-muted transition-colors hover:bg-surface-300 hover:text-ink"
    >
      <Laptop aria-hidden className="size-4" />
      Admin
    </Link>
  );
}

async function AreaUsuario() {
  const [usuario, adminLocal] = await Promise.all([MODO_DEMO ? null : obterUsuario(), ehAdminLocal()]);
  if (!usuario) {
    return (
      <>
        {adminLocal && <LinkAdmin />}
        <BotaoEntrarCabecalho />
      </>
    );
  }
  const [perfil, moderador] = await Promise.all([obterMeuPerfil(), ehModerador()]);
  return (
    <>
      {adminLocal && <LinkAdmin />}
      <Notificacoes usuarioId={usuario.id} />
      <MenuUsuario
        nome={perfil?.nome ?? "Minha conta"}
        foto={perfil?.foto ?? null}
        perfilId={usuario.id}
        temPerfil={Boolean(perfil)}
        moderador={moderador}
      />
    </>
  );
}
