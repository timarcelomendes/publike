import { Laptop, Search } from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { MODO_DEMO } from "@/lib/config";
import { ehModerador, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { vapidPublica } from "@/lib/servidor/ambiente";
import { obterIntencao } from "@/lib/servidor/intencao";
import { modoDaConta } from "@/lib/servidor/modo";
import { navegacaoDaConta } from "@/lib/servidor/navegacao";
import { ehAdminLocal } from "@/lib/supabase/admin";
import {
  BotaoEntrarCabecalho,
  BotaoPublicar,
  CurriculoDaConta,
  PublicarDaConta,
  PublicarECurriculo,
  type CurriculoNoTopo,
} from "./botao-publicar";
import { EntradaComABusca, EntradaDaBusca } from "./busca-do-topo";
import { BotaoInstalarApp } from "./instalar-app";
import { NavDaConta } from "./nav-topo";
import { MenuUsuario } from "./menu-usuario";
import { Notificacoes } from "./notificacoes";
import { BotaoAjudaTopo } from "./assistente/botao-ajuda-topo";
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
      {/* na home de quem entrou (mais larga no computador grande), o topo acompanha a largura dela */}
      <Container className="flex h-16 items-center gap-2 xl:[body:has([data-pagina-larga])_&]:max-w-7xl">
        <Link href="/" aria-label="Publike, página inicial" className="mr-3 shrink-0 rounded-sm">
          <Logo altura={34} />
        </Link>
        <Suspense fallback={<NavVisitante />}>
          <NavPrincipal />
        </Suspense>
        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {/* quem entrou tem o "Instalar o app" e o tema (Aparência) no menu da conta */}
          <Suspense fallback={<ExtrasDoVisitanteBase />}>
            <ExtrasDoVisitante />
          </Suspense>
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

/** O menu do visitante: o que é o Publike. */
function NavVisitante() {
  return (
    <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
      {/* Vagas e Serviços ficam nas abas da busca, na home (não repetimos aqui) */}
      <LinkNav href="/descobrir">Descobrir</LinkNav>
      <LinkNav href="/noticias">Notícias</LinkNav>
      <LinkNav href="/como-funciona">Como funciona</LinkNav>
    </nav>
  );
}

/**
 * Quem entrou: a busca no topo e as abas da atividade da conta, as mesmas da barra de baixo do celular
 * (as Conexões ficam nas Mensagens; as Notícias, no rodapé).
 */
async function NavPrincipal() {
  const conta = await navegacaoDaConta();
  if (!conta) return <NavVisitante />;
  return (
    <>
      <form action="/" role="search" className="hidden min-w-0 flex-1 lg:flex lg:max-w-sm xl:max-w-md">
        {/* a busca à vista: fundo branco no creme da página e a lupa em terra */}
        <label className="flex h-10 w-full items-center gap-2 rounded-pill border border-line bg-surface-200 px-4 text-ink-muted focus-within:outline-2 focus-within:outline-focus">
          <Search aria-hidden className="size-[18px] shrink-0 text-terra-text" />
          <span className="sr-only">Buscar vagas e serviços</span>
          <Suspense fallback={<EntradaDaBusca />}>
            <EntradaComABusca />
          </Suspense>
        </label>
      </form>
      <NavDaConta modo={conta.modo} numeros={conta.numeros} />
    </>
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

/** O "Instalar app" e o tema (só no computador: no celular, o topo fica com a Ajuda e o Entrar). */
function ExtrasDoVisitanteBase() {
  return (
    <>
      <BotaoInstalarApp variante="cabecalho" />
      <span className="hidden md:contents">
        <BotaoTema />
      </span>
    </>
  );
}

/** O "Instalar app" e o tema do topo são do visitante: quem entrou acha os dois no menu da conta. */
async function ExtrasDoVisitante() {
  const usuario = MODO_DEMO ? null : await obterUsuario();
  return usuario ? null : <ExtrasDoVisitanteBase />;
}

/**
 * O botão da direita do topo. Visitante: "Publicar grátis" e, para quem procura trabalho, o
 * "Currículo" do lado (quem quer contratar não vê o currículo). Quem entrou, pela atividade: quem
 * procura trabalho tem o Currículo; quem contrata, o "Publicar vaga"; quem presta serviço publica na
 * Vitrine, que está no menu do topo.
 */
async function PublicarDoTopo() {
  const usuario = MODO_DEMO ? null : await obterUsuario();
  if (usuario) {
    const modo = await modoDaConta().catch(() => "trabalhar" as const);
    if (modo === "trabalhar") return <CurriculoDaConta />;
    return modo === "contratar" ? <PublicarDaConta /> : null;
  }
  return <PublicarECurriculo curriculo={await curriculoNoTopo()} />;
}

async function curriculoNoTopo(): Promise<CurriculoNoTopo> {
  if (MODO_DEMO) return "cadastrar";
  const intencao = await obterIntencao().catch(() => null);
  if (intencao === "contratar_pessoa" || intencao === "contratar_servico") return null;
  return "cadastrar";
}

async function AreaUsuario() {
  const [usuario, adminLocal] = await Promise.all([MODO_DEMO ? null : obterUsuario(), ehAdminLocal()]);
  if (!usuario) {
    return (
      <>
        {adminLocal && <LinkAdmin />}
        <BotaoAjudaTopo />
        <BotaoEntrarCabecalho />
      </>
    );
  }
  const [perfil, moderador] = await Promise.all([obterMeuPerfil(), ehModerador()]);
  return (
    <>
      {adminLocal && <LinkAdmin />}
      {/* no celular, as Mensagens ficam na barra de baixo (o Chat do canto fica no computador) */}
      <Notificacoes usuarioId={usuario.id} vapid={vapidPublica()} />
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
