import { ChevronLeft, ChevronRight, FileText, Megaphone, Search, UserSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ABA_TALENTOS, ABAS_ANUNCIOS, classesAba, classesGrupoAbas, MioloAba } from "@/components/explorar/abas";
import { CartaoTalento } from "@/components/talentos/cartao-talento";
import { Aviso, Container, Esqueleto, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { classesEntrada, Seletor } from "@/components/ui/campo";
import { MODO_DEMO } from "@/lib/config";
import { CIDADES } from "@/lib/constantes";
import { meuCurriculoNaVitrine, obterMeuPerfil } from "@/lib/dados";
import { formatarNumero, primeiro } from "@/lib/formato";
import { obterLocal } from "@/lib/local";
import { buscarTalentos } from "@/lib/servidor/talentos";
import { MAX_PAGINAS_TALENTOS, TALENTOS_POR_PAGINA } from "@/lib/talentos";

// A aba Talentos: gente de Goiânia e região procurando trabalho, que escolheu aparecer.
// Aberta, mas só com o resumo; o currículo completo e o convite ficam na página de cada
// um, para empresa, comércio e agência que entraram. Fora do Google (robots e noindex).

export const metadata: Metadata = {
  title: "Talentos: gente procurando trabalho perto de você",
  description:
    "Quem procura trabalho em Goiânia e região e escolheu aparecer: o que faz, a experiência e as habilidades. Convide para a sua vaga, de graça.",
  robots: { index: false, follow: false },
};

type Parametros = PageProps<"/talentos">["searchParams"];

/** Os filtros da URL: o texto, a cidade e a página. */
function lerBusca(sp: Awaited<Parametros>) {
  const q = (primeiro(sp.q) ?? "").trim().slice(0, 60);
  const cidade = primeiro(sp.cidade);
  const pagina = Math.min(Math.max(Number(primeiro(sp.pagina)) || 1, 1), MAX_PAGINAS_TALENTOS);
  return { q, cidade: cidade && (CIDADES as readonly string[]).includes(cidade) ? cidade : null, pagina };
}

function hrefBusca(f: { q: string; cidade: string | null; pagina: number }) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.cidade) p.set("cidade", f.cidade);
  if (f.pagina > 1) p.set("pagina", String(f.pagina));
  const s = p.toString();
  return `/talentos${s ? `?${s}` : ""}`;
}

export default function Talentos({ searchParams }: PageProps<"/talentos">) {
  return (
    <>
      <section className="border-b border-line pb-4 sm:pb-5">
        <Container className="pt-4 sm:pt-6 lg:pt-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-h3 sm:text-h1">Talentos perto de você.</h1>
            <Selo variante="novo">Grátis</Selo>
          </div>
          <nav aria-label="O que você procura" className={`mt-3 sm:mt-5 ${classesGrupoAbas}`}>
            {ABAS_ANUNCIOS.map((a) => (
              <Link key={a.nome} href={`/?tipo=${a.valor ?? "tudo"}`} className={classesAba(false)}>
                <MioloAba aba={a} ativo={false} />
              </Link>
            ))}
            <Link href={ABA_TALENTOS.href} aria-current="page" className={classesAba(true)}>
              <MioloAba aba={ABA_TALENTOS} ativo />
            </Link>
          </nav>
          <Suspense fallback={<Esqueleto className="mt-3 h-14 w-full rounded-lg" />}>
            <Busca searchParams={searchParams} />
          </Suspense>
          <p className="mt-3 text-body-sm text-ink-muted">
            Gente de Goiânia e região procurando trabalho, que escolheu aparecer aqui. O currículo completo e o convite
            para uma vaga ficam para empresas, comércios e agências que entraram na conta.
          </p>
        </Container>
      </section>
      <Container className="py-6 sm:py-8">
        <Suspense fallback={<EsqueletoTalentos />}>
          <Lista searchParams={searchParams} />
        </Suspense>
      </Container>
    </>
  );
}

/** O que procurar (cargo, habilidade, curso) e a cidade. Formulário simples: funciona sem JavaScript. */
async function Busca({ searchParams }: { searchParams: Parametros }) {
  const f = lerBusca(await searchParams);
  return (
    <form
      role="search"
      action="/talentos"
      className="mt-3 flex flex-col gap-2 rounded-lg border border-line-strong bg-surface-200 p-1.5 shadow-card sm:mt-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-2">
        <Search aria-hidden className="size-5 shrink-0 text-ink-muted" />
        <label htmlFor="busca-talentos" className="sr-only">
          Cargo, habilidade ou curso
        </label>
        <input
          id="busca-talentos"
          name="q"
          type="search"
          enterKeyHint="search"
          defaultValue={f.q}
          placeholder="Cozinheira, motorista, Excel…"
          className="min-h-11 w-full min-w-0 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted/80"
        />
      </div>
      <div className="flex gap-2">
        <label htmlFor="cidade-talentos" className="sr-only">
          Cidade
        </label>
        <Seletor
          id="cidade-talentos"
          name="cidade"
          defaultValue={f.cidade ?? ""}
          envoltorio="min-w-0 flex-1 sm:w-56 sm:flex-none"
          className={classesEntrada}
        >
          <option value="">Todas as cidades</option>
          {CIDADES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Seletor>
        <button
          type="submit"
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-md bg-ink px-4 text-label text-surface-100 hover:opacity-90"
        >
          Buscar
        </button>
      </div>
    </form>
  );
}

async function Lista({ searchParams }: { searchParams: Parametros }) {
  const f = lerBusca(await searchParams);
  const [local, perfil] = await Promise.all([obterLocal().catch(() => null), obterMeuPerfil().catch(() => null)]);
  const empresa = Boolean(perfil && perfil.tipo !== "pessoa");
  const naAba = perfil?.tipo === "pessoa" ? await meuCurriculoNaVitrine() : false;
  const resultado = MODO_DEMO
    ? { lista: [], total: 0 }
    : await buscarTalentos({ texto: f.q, cidade: f.cidade, bairro: local?.bairro || null, pagina: f.pagina });

  if (!resultado) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar os talentos agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const { lista, total } = resultado;
  const paginas = Math.min(Math.ceil(total / TALENTOS_POR_PAGINA), MAX_PAGINAS_TALENTOS);
  const filtrado = Boolean(f.q || f.cidade);

  return (
    <div className="flex flex-col gap-5">
      {lista.length === 0 ? (
        f.pagina > 1 ? (
          <p className="rounded-md bg-surface-300 px-4 py-3 text-body-sm">
            Esta página está vazia.{" "}
            <Link href={hrefBusca({ ...f, pagina: 1 })} className="font-semibold underline underline-offset-2">
              Ver a primeira
            </Link>
          </p>
        ) : (
          <Vazio
            icone={UserSearch}
            titulo={filtrado ? "Ninguém com essa busca ainda" : "Ninguém na aba Talentos ainda"}
            acao={
              filtrado ? (
                <BotaoLink href="/talentos">Ver todos os talentos</BotaoLink>
              ) : (
                <BotaoLink href="/perfil/curriculo">Preencher meu currículo</BotaoLink>
              )
            }
          >
            {filtrado
              ? "Tente outra palavra, como o nome do cargo ou uma habilidade, ou procure em todas as cidades."
              : "Quem procura trabalho e escolhe aparecer vem para cá. Procura trabalho? Seja o primeiro."}
          </Vazio>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-h3">
              {formatarNumero(total)} {total === 1 ? "talento" : "talentos"}
              {f.cidade ? ` em ${f.cidade}` : ""}
              {f.q ? ` com “${f.q}”` : ""}
            </h2>
            <p className="text-body-sm text-ink-muted">
              {local?.bairro
                ? `Quem mora no ${local.bairro} vem primeiro.`
                : "Quem atualizou o currículo há menos tempo vem primeiro."}
            </p>
          </div>
          <ul aria-label="Talentos" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((t) => (
              <li key={t.perfil_id}>
                <CartaoTalento t={t} />
              </li>
            ))}
          </ul>
          {paginas > 1 && (
            <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
              {f.pagina > 1 ? (
                <BotaoLink href={hrefBusca({ ...f, pagina: f.pagina - 1 })} tamanho="sm" variante="fantasma">
                  <ChevronLeft aria-hidden />
                  Anterior
                </BotaoLink>
              ) : (
                <span className="w-24" />
              )}
              <span className="text-body-sm text-ink-muted">
                Página {f.pagina} de {paginas}
              </span>
              {f.pagina < paginas ? (
                <BotaoLink href={hrefBusca({ ...f, pagina: f.pagina + 1 })} tamanho="sm" variante="fantasma">
                  Próxima
                  <ChevronRight aria-hidden />
                </BotaoLink>
              ) : (
                <span className="w-24" />
              )}
            </nav>
          )}
        </>
      )}

      {empresa ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
          <Megaphone aria-hidden className="size-5 shrink-0 text-ink-muted" />
          <p className="min-w-0 grow basis-64 text-body-sm">
            <span className="text-label">Achou alguém?</span> Abra o currículo e convide para uma vaga sua. A pessoa vê
            a vaga e decide se curte; o contato aparece no match.
          </p>
          <BotaoLink href="/publicar" tamanho="sm">
            Publicar vaga grátis
          </BotaoLink>
        </div>
      ) : naAba ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
          <FileText aria-hidden className="size-5 shrink-0 text-ink-muted" />
          <p className="min-w-0 grow basis-64 text-body-sm">
            <span className="text-label">Você aparece aqui.</span> Quem atualizou o currículo há menos tempo vem
            primeiro: mantenha o seu em dia.
          </p>
          <BotaoLink href="/perfil/curriculo" tamanho="sm">
            Editar meu currículo
          </BotaoLink>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
          <FileText aria-hidden className="size-5 shrink-0 text-ink-muted" />
          <p className="min-w-0 grow basis-64 text-body-sm">
            <span className="text-label">Procura trabalho?</span> Apareça aqui também: preencha seu currículo e ligue
            “Aparecer na aba Talentos”. Telefone e e-mail ficam escondidos até o match.
          </p>
          <BotaoLink href="/perfil/curriculo" tamanho="sm">
            Preencher meu currículo
          </BotaoLink>
        </div>
      )}
    </div>
  );
}

function EsqueletoTalentos() {
  return (
    <div aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <Esqueleto key={i} className="h-48 w-full rounded-lg" />
      ))}
    </div>
  );
}
