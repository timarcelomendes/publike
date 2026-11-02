import { ArrowLeft, Megaphone, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CardAnuncio } from "@/components/card-anuncio";
import { SeletorDeLinks } from "@/components/painel/seletor-de-links";
import { BotaoSeguir } from "@/components/social/botoes";
import { Container, Esqueleto, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { TopoDaEmpresa } from "@/components/vagas-da-empresa/topo";
import { SITE_URL } from "@/lib/config";
import { categoria, REGIMES } from "@/lib/constantes";
import { semAcento } from "@/lib/descobrir";
import { obterPerfilPublico, obterUsuario, requisitosDasVagas, type DetalhesDaVaga } from "@/lib/dados";
import { meusSeguidos } from "@/lib/dados-social";
import { formatarLugar, plural } from "@/lib/formato";
import { extrasDe, matchDasVagas, quemProcura } from "@/lib/servidor/lista-anuncios";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { AnuncioDoPerfil, AnuncioResumo, Regime } from "@/lib/tipos";
import { linkDasVagas, textoDasVagas } from "@/lib/vagas-da-empresa";

// "Todas as vagas" de uma empresa, comércio ou agência: o link que ela põe na bio do Instagram, no status do
// WhatsApp ou no site (claude/plano-pagina-de-vagas.md, parte 1). No alto, a marca: a logo grande, o nome, quantas
// vagas e o Sobre, com o "Mandar no WhatsApp" (a lista pronta). Embaixo, as vagas no ar (até 200), sem repetir a
// empresa em cada cartão (na agência, para qual empresa é), com os benefícios, o Começa já e o % de match de quem
// tem currículo. Os filtros (a palavra, a área, a contratação e o bairro) numa linha; cada um só aparece quando
// separa alguma coisa. A imagem do link (WhatsApp, redes) fica em opengraph-image.tsx.

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
    const texto = semAcento(`${a.titulo} ${categoria(a.categoria).nome} ${a.bairro} ${a.contratante ?? ""}`);
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

/** Para qual empresa é a vaga de agência (o nome, ou "empresa confidencial"). */
function paraQuem(a: AnuncioDoPerfil) {
  return a.contratante ?? (a.contratante_confidencial ? "empresa confidencial" : null);
}

export async function generateMetadata({ params }: PageProps<"/perfil/[id]/vagas">): Promise<Metadata> {
  const { id } = await params;
  const dados = await obterPerfilPublico(id, LIMITE);
  if (!dados) return { title: "Vagas não encontradas", robots: { index: false } };
  const total = dados.anuncios.filter((a) => a.tipo === "vaga").length;
  const lugar = formatarLugar(dados.perfil.bairro, dados.perfil.cidade);
  const titulo = total
    ? `${dados.perfil.nome} está contratando: ${plural(total, "vaga aberta", "vagas abertas")}`
    : `Vagas de ${dados.perfil.nome}`;
  const descricao = `${total ? plural(total, "vaga aberta", "vagas abertas") : "Vagas"} de ${dados.perfil.nome} no Publike: ${lugar}. Candidate-se de graça.`;
  return {
    title: `Vagas de ${dados.perfil.nome}`,
    description: descricao,
    alternates: { canonical: `/perfil/${id}/vagas` },
    openGraph: { title: titulo, description: descricao, url: `/perfil/${id}/vagas` },
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

/** O que cada vaga pede (benefícios, quantas pessoas, Começa já...), de 100 em 100. */
async function detalhesDas(ids: string[]) {
  const partes: string[][] = [];
  for (let i = 0; i < ids.length; i += 100) partes.push(ids.slice(i, i + 100));
  const lidas = await Promise.all(partes.map((p) => requisitosDasVagas(p).catch(() => [] as DetalhesDaVaga[])));
  return new Map(lidas.flat().map((v) => [v.id, v]));
}

/** As curtidas de quem está olhando nestas vagas (o cartão mostra "Deu match" e o coração cheio). */
async function minhasCurtidasEm(ids: string[], usuarioId: string | null) {
  if (!usuarioId || !ids.length) return new Map<string, string>();
  const { data } = await (
    await criarClienteServidor()
  )
    .from("curtidas")
    .select("anuncio_id, status")
    .eq("perfil_id", usuarioId)
    .in("anuncio_id", ids.slice(0, 200));
  return new Map((data ?? []).map((c) => [c.anuncio_id, c.status]));
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
  const meu = usuario?.id === perfil.id;
  const ids = vagas.map((a) => a.id);
  const [detalhes, curtidas, quem] = await Promise.all([
    detalhesDas(ids),
    meu ? Promise.resolve(new Map<string, string>()) : minhasCurtidasEm(ids, usuario?.id ?? null),
    usuario && !meu ? quemProcura() : Promise.resolve(null),
  ]);
  const comCurtida = vagas.map((a) => ({ ...a, minha_curtida: curtidas.get(a.id) ?? a.minha_curtida }));
  const matches =
    quem && usuario
      ? matchDasVagas(comCurtida as unknown as AnuncioResumo[], detalhes, quem, usuario.id, agora)
      : new Map();
  const filtros = lerFiltros(sp);
  const mostradas = filtrar(comCurtida, filtros);
  const filtrando = Boolean(filtros.q || filtros.area || filtros.bairro || filtros.regime);
  const agencia = perfil.tipo === "agencia";
  const empresas = agencia ? new Set(vagas.map((a) => a.contratante).filter(Boolean)).size : 0;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(
    textoDasVagas(perfil.nome, vagas, linkDasVagas(SITE_URL, perfil.id, "whatsapp")),
  )}`;

  return (
    <>
      <Link
        href={`/perfil/${perfil.id}`}
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Perfil de {perfil.nome}
      </Link>
      <div className="mt-2">
        <TopoDaEmpresa
          perfil={perfil}
          vagas={vagas.length}
          empresas={empresas}
          meu={meu}
          whatsapp={whatsapp}
          textoCompartilhar={textoDasVagas(perfil.nome, vagas, "", { curto: true }).replace(/:\s*$/, ":")}
          seguir={
            meu ? null : (
              <BotaoSeguir
                alvo={{ perfil: perfil.id }}
                seguidoId={seguidos.find((s) => s.alvo_perfil === perfil.id)?.id ?? null}
                logado={usuario !== null}
                voltar={`/perfil/${perfil.id}/vagas`}
                rotulo="Seguir"
              />
            )
          }
        />
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
                  extras={extrasDe(detalhes.get(a.id))}
                  match={matches.get(a.id) ?? null}
                  semAutor
                  para={agencia ? paraQuem(a) : null}
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
        Para se candidatar, abra a vaga e toque em Curtir. O Publike é grátis para quem procura trabalho.
      </p>
    </>
  );
}

/** O link com um filtro escolhido ("" tira o filtro). */
function linkPara(base: string, f: Filtros, campo: keyof Filtros, valor: string) {
  const novo = { ...f, [campo]: valor };
  const q = new URLSearchParams(Object.entries(novo).filter(([, v]) => v));
  return q.size ? `${base}?${q}` : base;
}

/**
 * Os filtros numa linha (01/11/2026): a busca por palavra (com 6 vagas ou mais) e uma lista que abre para cada
 * grupo que separa alguma coisa (a área, a contratação e o bairro), com quantas vagas tem cada opção.
 */
function FiltrosDasVagas({ base, vagas, filtros }: { base: string; vagas: AnuncioDoPerfil[]; filtros: Filtros }) {
  const grupos = [
    {
      campo: "area" as const,
      nome: "Área",
      todas: "Todas as áreas",
      opcoes: contar(vagas, (a) => a.categoria).map(([v, n]) => ({ v, nome: categoria(v).nome, n })),
    },
    {
      campo: "regime" as const,
      nome: "Contratação",
      todas: "Toda contratação",
      opcoes: contar(vagas, (a) => a.regime).map(([v, n]) => ({ v, nome: REGIMES[v as Regime]?.selo ?? v, n })),
    },
    {
      campo: "bairro" as const,
      nome: "Bairro",
      todas: "Todos os bairros",
      opcoes: contar(vagas, (a) => a.bairro).map(([v, n]) => ({ v, nome: v, n })),
    },
  ].filter((g) => g.opcoes.length > 1 || g.opcoes.some((o) => o.v === filtros[g.campo]));
  const busca = vagas.length >= 6 || Boolean(filtros.q);
  if (!busca && !grupos.length) return null;
  return (
    <section aria-label="Filtrar as vagas" className="mt-6 flex flex-wrap items-center gap-2">
      {busca && (
        <form action={base} className="flex min-w-0 basis-full gap-2 sm:basis-80" role="search">
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
              className="min-h-10 w-full rounded-pill border border-line-strong bg-surface-200 pr-3 pl-9 text-body-sm"
            />
          </div>
          <button
            type="submit"
            className="min-h-10 rounded-pill border border-line-strong bg-surface-200 px-4 text-label hover:bg-surface-300"
          >
            Procurar
          </button>
        </form>
      )}
      {grupos.map((g) => (
        <SeletorDeLinks
          key={g.campo}
          rotulo={g.nome}
          atual={linkPara(base, filtros, g.campo, filtros[g.campo])}
          opcoes={[
            { nome: g.todas, href: linkPara(base, filtros, g.campo, "") },
            ...g.opcoes.map((o) => ({ nome: `${o.nome} (${o.n})`, href: linkPara(base, filtros, g.campo, o.v) })),
          ]}
        />
      ))}
    </section>
  );
}
