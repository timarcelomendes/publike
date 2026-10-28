import { ArrowLeft, Megaphone, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { BotaoCompartilhar } from "@/components/anuncio/compartilhar";
import { CardAnuncio } from "@/components/card-anuncio";
import { SeloVerificado } from "@/components/selo-verificado";
import { BotaoSeguir } from "@/components/social/botoes";
import { Avatar, Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { categoria, REGIMES, TIPOS_CONTA } from "@/lib/constantes";
import { semAcento } from "@/lib/descobrir";
import { obterPerfilPublico, obterUsuario } from "@/lib/dados";
import { meusSeguidos } from "@/lib/dados-social";
import { formatarLugar, plural } from "@/lib/formato";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { AnuncioDoPerfil, Regime, TipoConta } from "@/lib/tipos";

// "Todas as vagas" de uma empresa, comércio ou agência: o link que ela põe na
// bio do Instagram, no status do WhatsApp ou no site. Só as vagas no ar (até 200), com os filtros:
// a palavra (no título, na área e no bairro), a área, o bairro e o tipo de contratação. Cada grupo de
// filtro só aparece quando separa alguma coisa (duas áreas ou mais, por exemplo); tocar de novo tira.

const LIMITE = 200;
type Filtros = { q: string; area: string; bairro: string; regime: string };

function lerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const um = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().slice(0, 80) : "");
  return { q: um(sp.q), area: um(sp.area), bairro: um(sp.bairro), regime: um(sp.regime) };
}

function filtrar(vagas: AnuncioDoPerfil[], f: Filtros) {
  const palavras = semAcento(f.q).split(/\s+/).filter(Boolean);
  return vagas.filter((a) => {
    if (f.area && a.categoria !== f.area) return false;
    if (f.bairro && a.bairro !== f.bairro) return false;
    if (f.regime && a.regime !== f.regime) return false;
    if (!palavras.length) return true;
    const texto = semAcento(`${a.titulo} ${categoria(a.categoria).nome} ${a.bairro}`);
    return palavras.every((p) => texto.includes(p));
  });
}

/** Os valores de um campo com quantas vagas têm cada um, do mais comum para o menos. */
function contar(vagas: AnuncioDoPerfil[], campo: (a: AnuncioDoPerfil) => string | null | undefined) {
  const n = new Map<string, number>();
  for (const a of vagas) {
    const v = campo(a);
    if (v) n.set(v, (n.get(v) ?? 0) + 1);
  }
  return [...n].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], "pt-BR"));
}

export async function generateMetadata({ params }: PageProps<"/perfil/[id]/vagas">): Promise<Metadata> {
  const { id } = await params;
  const dados = await obterPerfilPublico(id, LIMITE);
  if (!dados) return { title: "Vagas não encontradas", robots: { index: false } };
  const total = dados.anuncios.filter((a) => a.tipo === "vaga").length;
  return {
    title: `Vagas de ${dados.perfil.nome}`,
    description: `${total ? plural(total, "vaga aberta", "vagas abertas") : "Vagas"} de ${dados.perfil.nome} no Publike: ${formatarLugar(dados.perfil.bairro, dados.perfil.cidade)}. Candidate-se de graça.`,
    alternates: { canonical: `/perfil/${id}/vagas` },
  };
}

export default function VagasDaEmpresa({ params, searchParams }: PageProps<"/perfil/[id]/vagas">) {
  return (
    <Container className="py-8">
      <Suspense fallback={<Esqueleto className="h-80 w-full rounded-lg" />}>
        <Conteudo params={params} searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/perfil/[id]/vagas">["params"];
  searchParams: PageProps<"/perfil/[id]/vagas">["searchParams"];
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [dados, usuario, seguidos] = await Promise.all([
    obterPerfilPublico(id, LIMITE),
    obterUsuario(),
    meusSeguidos(),
  ]);
  if (!dados) notFound();
  const { perfil } = dados;
  const agora = await agoraDaRequisicao();
  const vagas = dados.anuncios.filter((a) => a.tipo === "vaga");
  const filtros = lerFiltros(sp);
  const mostradas = filtrar(vagas, filtros);
  const filtrando = Boolean(filtros.q || filtros.area || filtros.bairro || filtros.regime);
  const meu = usuario?.id === perfil.id;
  const tipo = TIPOS_CONTA[(perfil.tipo as TipoConta) in TIPOS_CONTA ? (perfil.tipo as TipoConta) : "pessoa"];

  return (
    <>
      <Link
        href={`/perfil/${perfil.id}`}
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Perfil de {perfil.nome}
      </Link>
      <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar nome={perfil.nome} foto={perfil.foto} tamanho={64} />
        <div className="min-w-0 flex-1">
          <h1 className="text-h2 sm:text-h1">
            Vagas de <span className="break-words">{perfil.nome}</span>
            {perfil.verificado && (
              <SeloVerificado agencia={perfil.tipo === "agencia"} className="ml-2 inline size-6 align-[-0.15em]" />
            )}
          </h1>
          <p className="mt-1 text-body text-ink-muted">
            {tipo.nome} · {formatarLugar(perfil.bairro, perfil.cidade)} ·{" "}
            {vagas.length ? plural(vagas.length, "vaga aberta", "vagas abertas") : "nenhuma vaga aberta"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 self-start sm:self-center">
          <BotaoCompartilhar
            titulo={`Vagas de ${perfil.nome}`}
            texto={`Vagas abertas de ${perfil.nome} no Publike. Candidate-se de graça:`}
          />
          {!meu && (
            <BotaoSeguir
              alvo={{ perfil: perfil.id }}
              seguidoId={seguidos.find((s) => s.alvo_perfil === perfil.id)?.id ?? null}
              logado={usuario !== null}
              voltar={`/perfil/${perfil.id}/vagas`}
              rotulo="Seguir"
            />
          )}
        </div>
      </div>

      {vagas.length > 1 && <FiltrosDasVagas base={`/perfil/${perfil.id}/vagas`} vagas={vagas} filtros={filtros} />}

      <div className="mt-6">
        {filtrando && (
          <p role="status" className="mb-3 text-body-sm text-ink-muted">
            {mostradas.length
              ? `${plural(mostradas.length, "vaga", "vagas")} de ${vagas.length}`
              : "Nenhuma vaga com esses filtros."}{" "}
            <Link href={`/perfil/${perfil.id}/vagas`} scroll={false} className="font-semibold text-ink underline">
              Limpar filtros
            </Link>
          </p>
        )}
        {mostradas.length ? (
          <ul aria-label="Vagas abertas" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mostradas.map((a) => (
              <li key={a.id} className="contents">
                <CardAnuncio
                  anuncio={{ ...a, autor_foto: perfil.foto }}
                  agora={agora}
                  usuarioId={usuario?.id ?? null}
                />
              </li>
            ))}
          </ul>
        ) : filtrando ? null : (
          <Vazio
            icone={Megaphone}
            titulo="Nenhuma vaga aberta agora"
            acao={meu ? <BotaoLink href="/publicar">Publicar vaga</BotaoLink> : undefined}
          >
            {meu
              ? "Quando você publicar, as vagas aparecem aqui sozinhas. O link continua o mesmo."
              : `Siga ${perfil.nome} para saber quando abrir vaga nova.`}
          </Vazio>
        )}
      </div>

      <p className="mt-8 text-body-sm text-ink-muted">
        Para se candidatar, abra a vaga e toque no coração. O Publike é grátis para quem procura trabalho.
      </p>
    </>
  );
}

/** O link com um filtro trocado (o mesmo de novo tira). */
function linkCom(base: string, f: Filtros, campo: keyof Filtros, valor: string) {
  const novo = { ...f, [campo]: f[campo] === valor ? "" : valor };
  const q = new URLSearchParams(Object.entries(novo).filter(([, v]) => v));
  return q.size ? `${base}?${q}` : base;
}

function Chip({ href, ativo, children }: { href: string; ativo: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={ativo ? "true" : undefined}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label whitespace-nowrap transition-colors ${
        ativo ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
      }`}
    >
      {children}
    </Link>
  );
}

/** A busca por palavra (com 6 vagas ou mais) e os grupos de filtro que separam alguma coisa. */
function FiltrosDasVagas({ base, vagas, filtros }: { base: string; vagas: AnuncioDoPerfil[]; filtros: Filtros }) {
  const grupos = [
    {
      campo: "area" as const,
      nome: "Área",
      opcoes: contar(vagas, (a) => a.categoria).map(([v, n]) => ({ v, nome: categoria(v).nome, n })),
    },
    {
      campo: "regime" as const,
      nome: "Contratação",
      opcoes: contar(vagas, (a) => a.regime).map(([v, n]) => ({ v, nome: REGIMES[v as Regime]?.selo ?? v, n })),
    },
    {
      campo: "bairro" as const,
      nome: "Bairro",
      opcoes: contar(vagas, (a) => a.bairro).map(([v, n]) => ({ v, nome: v, n })),
    },
  ].filter((g) => g.opcoes.length > 1 || g.opcoes.some((o) => o.v === filtros[g.campo]));
  const busca = vagas.length >= 6 || Boolean(filtros.q);
  if (!busca && !grupos.length) return null;
  return (
    <section aria-label="Filtrar as vagas" className="mt-8 flex flex-col gap-3">
      {busca && (
        <form action={base} className="flex max-w-xl gap-2" role="search">
          {(["area", "bairro", "regime"] as const).map((c) =>
            filtros[c] ? <input key={c} type="hidden" name={c} value={filtros[c]} /> : null,
          )}
          <label htmlFor="busca-vagas" className="sr-only">
            Procurar nas vagas
          </label>
          <div className="relative min-w-0 flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
            />
            <input
              id="busca-vagas"
              name="q"
              type="search"
              defaultValue={filtros.q}
              maxLength={80}
              placeholder="Cargo, área ou bairro"
              className="min-h-11 w-full rounded-md border border-line-strong bg-surface-200 pr-3 pl-9 text-body"
            />
          </div>
          <button
            type="submit"
            className="min-h-11 rounded-md border border-line-strong bg-surface-200 px-4 text-label hover:bg-surface-300"
          >
            Procurar
          </button>
        </form>
      )}
      {grupos.map((g) => (
        <div key={g.campo} className="flex flex-col gap-1.5">
          <p className="text-body-sm text-ink-muted">{g.nome}</p>
          <nav
            aria-label={g.nome}
            className="sem-barra relative -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
          >
            {g.opcoes.map((o) => (
              <Chip key={o.v} href={linkCom(base, filtros, g.campo, o.v)} ativo={filtros[g.campo] === o.v}>
                {o.nome}
                <span className={filtros[g.campo] === o.v ? "text-surface-100/80" : "text-ink-muted"}>{o.n}</span>
              </Chip>
            ))}
          </nav>
        </div>
      ))}
    </section>
  );
}
