"use client";

import {
  BriefcaseBusiness,
  ChevronDown,
  Mail,
  Megaphone,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/ui/basicos";
import { usePathname } from "next/navigation";

export type ModoAdmin = "admin" | "moderador" | null;

type Secao = { href: string; nome: string };

/**
 * As seções do admin, em grupos (claude/plano-avisos-de-liberacao-e-menu-admin.md, parte 2): o menu da coluna da
 * esquerda no computador e o "Seções" no celular. Os endereços são os de sempre.
 */
export const GRUPOS_ADMIN: { nome: string | null; icone?: LucideIcon; secoes: Secao[] }[] = [
  { nome: null, secoes: [{ href: "/admin", nome: "Painel" }] },
  {
    nome: "Contas",
    icone: Users,
    secoes: [
      { href: "/admin/usuarios", nome: "Usuários" },
      { href: "/admin/empresas", nome: "Empresas" },
      { href: "/admin/convites", nome: "Convites" },
      { href: "/admin/moderadores", nome: "Moderadores" },
      { href: "/admin/testadores", nome: "Testadores do app" },
    ],
  },
  {
    nome: "Vagas e candidatos",
    icone: BriefcaseBusiness,
    secoes: [
      { href: "/admin/anuncios", nome: "Anúncios" },
      { href: "/admin/curtidas", nome: "Curtidas" },
      { href: "/admin/matches", nome: "Matches" },
      { href: "/admin/esperando", nome: "Esperando" },
      { href: "/admin/vagas-paradas", nome: "Vagas paradas" },
      { href: "/admin/retorno", nome: "Retorno" },
      { href: "/admin/salarios", nome: "Salários" },
    ],
  },
  {
    nome: "Moderação",
    icone: ShieldCheck,
    secoes: [
      { href: "/admin/denuncias", nome: "Denúncias" },
      { href: "/admin/testes", nome: "Testes" },
      { href: "/admin/falhas", nome: "Falhas" },
      { href: "/admin/sugestoes", nome: "Sugestões" },
    ],
  },
  {
    nome: "Comunicação",
    icone: Mail,
    secoes: [
      { href: "/admin/emails", nome: "E-mails" },
      { href: "/admin/comunicados", nome: "Comunicados" },
      { href: "/admin/novidades", nome: "Novidades" },
      { href: "/admin/noticias", nome: "Notícias" },
    ],
  },
  {
    nome: "Divulgação",
    icone: Megaphone,
    secoes: [
      { href: "/admin/vagas-do-dia", nome: "Vagas do dia" },
      { href: "/admin/campanhas", nome: "Campanhas" },
      { href: "/admin/banners", nome: "Banners" },
    ],
  },
  { nome: "Dinheiro", icone: Wallet, secoes: [{ href: "/admin/pagamentos", nome: "Pagamentos" }] },
  {
    nome: "Sistema",
    icone: Settings,
    secoes: [
      { href: "/admin/ia", nome: "IA" },
      { href: "/admin/chaves", nome: "Chaves" },
    ],
  },
];

const ABAS_ADMIN = GRUPOS_ADMIN.flatMap((g) => g.secoes);

// A equipe no site no ar, num lugar só: os números (Painel no site) e a moderação
const ABAS_MODERACAO = [
  { href: "/admin/numeros", nome: "Números" },
  { href: "/admin/denuncias", nome: "Denúncias" },
  { href: "/admin/anuncios", nome: "Anúncios" },
  // os stories e o carrossel do dia, também pelo celular (só vagas no ar, que já são públicas)
  { href: "/admin/vagas-do-dia", nome: "Vagas do dia" },
  // as curtidas também no site no ar (a função moderacao_curtidas, só para moderador)
  { href: "/admin/curtidas", nome: "Curtidas" },
];

function abaAtiva(caminho: string | null, abas: { href: string }[]) {
  if (!caminho) return null;
  // a aba com o caminho mais longo que combina (o Painel só combina exato)
  return (
    abas
      .filter((a) =>
        a.href === "/admin" ? caminho === "/admin" : caminho === a.href || caminho.startsWith(`${a.href}/`),
      )
      .sort((x, y) => y.href.length - x.href.length)[0]?.href ?? null
  );
}

export function AbasAdminBase({ modo, ativa }: { modo: ModoAdmin; ativa: string | null }) {
  const abas = modo === "admin" ? ABAS_ADMIN : modo === "moderador" ? ABAS_MODERACAO : [];
  if (!abas.length) return null;
  return (
    <nav
      aria-label="Seções do admin"
      className="sem-barra -mx-4 mt-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
    >
      {abas.map((a) => {
        const atual = ativa === a.href;
        return (
          <Link
            key={a.href}
            href={a.href}
            scroll={false}
            aria-current={atual ? "page" : undefined}
            className={`-mb-px inline-flex min-h-12 shrink-0 items-center border-b-2 px-3 text-label transition-colors ${
              atual ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {a.nome}
          </Link>
        );
      })}
    </nav>
  );
}

export function AbasAdmin({ modo }: { modo: ModoAdmin }) {
  const caminho = usePathname();
  // o admin tem o menu da lateral (MenuAdmin); a moderação, as poucas abas no alto
  if (modo !== "moderador") return null;
  return <AbasAdminBase modo={modo} ativa={abaAtiva(caminho, ABAS_MODERACAO)} />;
}

/** Os números ao lado do nome (o que espera a equipe): denúncias abertas, anúncios esperando a IA. */
export type NumerosDoMenu = Partial<Record<string, number>>;

/**
 * O menu do admin: no computador, a coluna da esquerda com os grupos; no celular, o botão "Seções" (com a seção de
 * agora) que abre a lista.
 */
export function MenuAdmin({ numeros }: { numeros: NumerosDoMenu }) {
  const caminho = usePathname();
  const ativa = abaAtiva(caminho, ABAS_ADMIN);
  const nomeAtivo = ABAS_ADMIN.find((a) => a.href === ativa)?.nome ?? "Painel";
  const lista = (
    <ul className="flex flex-col">
      {GRUPOS_ADMIN.map((g) => (
        // cada grupo separado por um traço, com o ícone e o nome em destaque; as seções embaixo, recuadas
        <li key={g.nome ?? "inicio"} className={g.nome ? "mt-3 border-t border-line pt-3" : ""}>
          {g.nome && (
            <p className="flex items-center gap-2 px-3 pb-1.5 text-label font-bold text-ink">
              {g.icone && <g.icone aria-hidden className="size-[18px] shrink-0 text-terra-text" />}
              {g.nome}
            </p>
          )}
          <ul className={`flex flex-col gap-0.5 ${g.nome ? "pl-[26px]" : ""}`}>
            {g.secoes.map((s) => {
              const atual = s.href === ativa;
              const n = numeros[s.href] ?? 0;
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    aria-current={atual ? "page" : undefined}
                    className={`flex min-h-9 items-center gap-2 rounded-md px-3 text-body transition-colors ${
                      atual ? "bg-surface-300 font-semibold text-ink" : "text-ink hover:bg-surface-300"
                    }`}
                  >
                    <span className="flex-1">{s.nome}</span>
                    {n > 0 && (
                      <span className="min-w-6 rounded-pill bg-ink px-1.5 text-center text-caption leading-6 text-surface-100 tabular-nums">
                        {n}
                        <span className="sr-only"> esperando</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <nav
        aria-label="Seções do admin"
        className="sem-barra hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
      >
        <Link href="/admin" className="mb-4 flex items-center gap-2 px-3" aria-label="Publike Admin: Painel">
          <Logo altura={26} />
          <SeloAdmin />
        </Link>
        {lista}
      </nav>
      {/* no celular: um botão que abre a lista (fecha ao trocar de seção, pela key) */}
      <details key={ativa} className="group rounded-lg border border-line bg-surface-200 lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-label [&::-webkit-details-marker]:hidden">
          <span>
            <span className="text-ink-muted">Seções · </span>
            {nomeAtivo}
          </span>
          <ChevronDown aria-hidden className="size-5 text-ink-muted transition-transform group-open:rotate-180" />
        </summary>
        <nav aria-label="Seções do admin" className="border-t border-line p-2">
          {lista}
        </nav>
      </details>
    </>
  );
}

/** O selo "Admin" ao lado da logo (no menu lateral e, no celular, no alto da página). */
export function SeloAdmin() {
  return (
    <span className="rounded-pill bg-surface-300 px-2 py-0.5 text-caption font-semibold text-ink-muted">Admin</span>
  );
}
