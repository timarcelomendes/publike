import { Laptop } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MODO_DEMO } from "@/lib/config";
import { ehModerador, meuCurriculoNaVitrine, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { obterIntencao } from "@/lib/servidor/intencao";
import { ehAdminLocal } from "@/lib/supabase/admin";
import { BotaoEntrarCabecalho, BotaoPublicar, PublicarECurriculo, type CurriculoNoTopo } from "./botao-publicar";
import { BotaoInstalarApp } from "./instalar-app";
import { MenuUsuario } from "./menu-usuario";
import { Notificacoes } from "./notificacoes";
import { BotaoTema } from "./tema";
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
          <Logo altura={34} />
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {/* Vagas e Serviços ficam nas abas da busca, na home (não repetimos aqui) */}
          <LinkNav href="/descobrir">Descobrir</LinkNav>
          <LinkNav href="/noticias">Notícias</LinkNav>
          <LinkNav href="/como-funciona">Como funciona</LinkNav>
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <BotaoInstalarApp variante="cabecalho" />
          <BotaoTema />
          {/* No celular, "Publicar" fica na barra de baixo */}
          <Suspense fallback={<BotaoPublicar />}>
            <PublicarDoTopo />
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
      {/* no celular, só o ícone (o cabeçalho tem também o botão do tema) */}
      <span className="sr-only sm:not-sr-only">Admin</span>
    </Link>
  );
}

/** "Publicar grátis" e, para quem procura trabalho, o "Currículo" do lado. Empresa e quem quer contratar não veem o currículo. */
async function PublicarDoTopo() {
  return <PublicarECurriculo curriculo={await curriculoNoTopo()} />;
}

async function curriculoNoTopo(): Promise<CurriculoNoTopo> {
  if (MODO_DEMO) return "cadastrar";
  const [perfil, intencao] = await Promise.all([obterMeuPerfil().catch(() => null), obterIntencao().catch(() => null)]);
  if (perfil && perfil.tipo !== "pessoa") return null;
  if (intencao === "contratar_pessoa" || intencao === "contratar_servico") return null;
  return perfil && (await meuCurriculoNaVitrine().catch(() => false)) ? "meu" : "cadastrar";
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
        candidatos={Boolean(perfil && perfil.tipo !== "pessoa")}
      />
    </>
  );
}
