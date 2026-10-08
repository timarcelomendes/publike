import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MODO_DEMO } from "@/lib/config";
import { ehModerador, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { BotaoPublicar, BotaoPublicarCabecalho } from "./botao-publicar";
import { MenuUsuario } from "./menu-usuario";
import { Notificacoes } from "./notificacoes";
import { Container, Logo } from "./ui/basicos";
import { BotaoLink } from "./ui/botao";

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

async function AreaUsuario() {
  const usuario = MODO_DEMO ? null : await obterUsuario();
  if (!usuario) {
    return (
      <BotaoLink href="/entrar" variante="secundario" tamanho="sm">
        Entrar
      </BotaoLink>
    );
  }
  const [perfil, moderador] = await Promise.all([obterMeuPerfil(), ehModerador()]);
  return (
    <>
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
