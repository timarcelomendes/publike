import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { TituloDoPost } from "@/components/admin/titulo-do-post";
import { Filtros, linkCom, Secao } from "@/components/admin/ui";
import { CarrosselDoInstagram } from "@/components/instagram/carrossel";
import { Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { CATEGORIAS } from "@/lib/constantes";
import { primeiro } from "@/lib/formato";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { notFound } from "next/navigation";
import { acessoVagasDoDia, vagasEscolhidas, vagasNovasNoAr } from "@/lib/servidor/vagas-do-dia";
import { agoraDaRequisicao } from "@/lib/tempo";
import {
  CIDADES_DO_DIA,
  CONTRATACOES_DO_DIA,
  diaEmNumeros,
  diaPorExtenso,
  filtrarVagasDoDia,
  hashtagsDoDia,
  lerFiltrosDoDia,
  lerIdsDoDia,
  linkDaBio,
  linkDoFimDosStories,
  linkDoStory,
  MAX_BUSCA_DO_DIA,
  ordenarVagasDoDia,
  PERIODO_DAS_DATAS,
  PERIODOS_DO_DIA,
  periodoDoDia,
  textoDaCapa,
  tituloDaArea,
  tituloDaLegenda,
  VAGAS_MARCADAS,
} from "@/lib/vagas-do-dia";

export const metadata: Metadata = { title: "Vagas do dia" };

const BASE = "/admin/vagas-do-dia";
/** O botão dos formulários desta página (o mesmo do "Usar este título"). */
const BOTAO =
  "inline-flex min-h-11 shrink-0 items-center rounded-md border border-line-strong px-4 text-label hover:bg-surface-300";

export default function PaginaVagasDoDia({ searchParams }: PageProps<"/admin/vagas-do-dia">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/vagas-do-dia">["searchParams"] }) {
  // o admin no computador ou um moderador logado (também pelo celular)
  const c = await acessoVagasDoDia();
  if (!c) notFound();
  const sp = await searchParams;
  const agora = await agoraDaRequisicao();
  const agoraIso = new Date(agora).toISOString();
  const hoje = diaEmNumeros(agora);
  // o período: um dos prontos (Hoje, 3 dias, Semana, 15 dias) ou qualquer um (?periodo=datas&de=&ate=; 14/11/2026)
  const periodo = periodoDoDia({ periodo: primeiro(sp.periodo), de: primeiro(sp.de), ate: primeiro(sp.ate) }, agora);
  // os filtros (a área, a praça, só com salário, o jeito de contratar e a busca pelo título da vaga) e o título do post,
  // todos no endereço (claude/plano-vagas-do-dia-por-area.md)
  const filtros = lerFiltrosDoDia({
    area: primeiro(sp.area),
    cidade: primeiro(sp.cidade),
    salario: primeiro(sp.salario),
    contratacao: primeiro(sp.contratacao),
    busca: primeiro(sp.busca),
  });
  const titulo = primeiro(sp.titulo) ?? null;
  const capa = textoDaCapa(
    { titulo, cidade: filtros.cidade, periodo: periodo.valor, de: periodo.datas?.de, ate: periodo.datas?.ate },
    agora,
  );
  const todasNovas = ordenarVagasDoDia(await vagasNovasNoAr(c, periodo.desde, agoraIso, periodo.antes));
  const novas = filtrarVagasDoDia(todasNovas, filtros);
  // quantas vagas cada área tem, com os outros filtros (para não marcar uma área vazia)
  const porArea = new Map<string, number>();
  for (const v of filtrarVagasDoDia(todasNovas, filtros, true))
    if (v.categoria) porArea.set(v.categoria, (porArea.get(v.categoria) ?? 0) + 1);
  // o endereço com uma mudança (as vagas escolhidas recomeçam: a lista muda com os filtros)
  const atuais = {
    periodo: periodo.valor === "24h" ? null : periodo.valor,
    de: periodo.datas?.de ?? null,
    ate: periodo.datas?.ate ?? null,
    area: filtros.areas.join(",") || null,
    cidade: filtros.cidade === "todas" ? null : filtros.cidade,
    salario: filtros.comSalario ? "1" : null,
    contratacao: filtros.contratacao === "todas" ? null : filtros.contratacao,
    busca: filtros.busca || null,
    titulo,
  };
  const link = (mudanca: Record<string, string | null>) => linkCom(BASE, atuais, mudanca).replace(/%2C/gi, ",");
  const trocarArea = (slug: string) => {
    const areas = filtros.areas.includes(slug) ? filtros.areas.filter((a) => a !== slug) : [...filtros.areas, slug];
    return link({ area: areas.join(",") || null });
  };
  const sugestoes = [
    ...new Set([periodo.titulo, "Vagas do dia", "Vagas da semana", ...filtros.areas.flatMap((a) => tituloDaArea(a) ?? [])]),
  ];
  // o que vai junto no endereço das capas e do .zip
  const consulta = new URLSearchParams();
  if (titulo) consulta.set("titulo", titulo);
  if (filtros.cidade !== "todas") consulta.set("cidade", filtros.cidade);
  if (periodo.valor !== "24h") consulta.set("periodo", periodo.valor);
  if (periodo.datas) {
    consulta.set("de", periodo.datas.de);
    consulta.set("ate", periodo.datas.ate);
  }
  if (filtros.areas.length) consulta.set("area", filtros.areas.join(","));
  const extra = consulta.size ? `&${consulta.toString()}` : "";
  // as escolhidas no endereço (?v=) que são de antes do período continuam na lista
  const pedidas = lerIdsDoDia(primeiro(sp.v));
  const deAntes = pedidas.filter((id) => !novas.some((v) => v.id === id));
  const candidatas = [...novas, ...(deAntes.length ? await vagasEscolhidas(c, deAntes, agoraIso) : [])];
  const iniciais = pedidas.length
    ? pedidas.filter((id) => candidatas.some((v) => v.id === id))
    : novas.slice(0, VAGAS_MARCADAS).map((v) => v.id);
  const horas = periodo.horas;
  const outrosPeriodos = horas === null ? [] : PERIODOS_DO_DIA.filter((p) => p.horas > horas);
  const quandoNoVazio = periodo.datas
    ? `${periodo.datas.de === periodo.datas.ate ? "em" : "de"} ${periodo.quando}`
    : periodo.valor === "24h"
      ? "nas últimas 24 horas"
      : `em ${periodo.nome.toLowerCase()}`;
  const site = urlDosEmails() ?? "https://publike.org";
  const [antes, depois] = linkDoStory(site, "@").split("@");

  return (
    <Secao
      titulo="Vagas do dia"
      descricao={
        <>
          O post do Instagram de cada dia, feito pelo site com as vagas novas no ar: o carrossel do feed, um story por
          vaga e a legenda. Escolha e ponha na ordem; as imagens mudam junto. Vaga de pessoa física sai sem o nome de
          quem publicou.
        </>
      }
    >
      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface-100 p-4">
        <Linha nome="Publicadas">
          <Filtros
            rotulo="Publicadas"
            opcoes={[
              ...PERIODOS_DO_DIA.map((p) => ({ valor: p.valor, nome: p.nome })),
              { valor: PERIODO_DAS_DATAS, nome: "Escolher datas" },
            ]}
            atual={periodo.valor}
            link={(v) =>
              v === PERIODO_DAS_DATAS
                ? link({ periodo: v, titulo: null })
                : link({ periodo: v === "24h" ? null : v, de: null, ate: null, titulo: null })
            }
          />
          {periodo.datas && (
            // qualquer período (14/11/2026, Marcelo: "Incluir opções para buscar qualquer período"): de uma data a outra
            <Form action={BASE} scroll={false} className="mt-3 flex flex-wrap items-end gap-2">
              <Ocultos valores={{ ...atuais, de: null, ate: null, titulo: null }} />
              <Data nome="de" rotulo="De" valor={periodo.datas.de} hoje={hoje} />
              <Data nome="ate" rotulo="Até" valor={periodo.datas.ate} hoje={hoje} />
              <button type="submit" className={BOTAO}>
                Ver as vagas
              </button>
            </Form>
          )}
        </Linha>
        <Linha nome="Buscar">
          {/* pelo título da vaga (14/11/2026, Marcelo: "e por título da vaga"): todas as palavras, sem olhar acento */}
          <Form action={BASE} scroll={false} role="search" className="flex flex-wrap items-center gap-2">
            <Ocultos valores={{ ...atuais, busca: null }} />
            <input
              key={filtros.busca}
              type="search"
              name="busca"
              defaultValue={filtros.busca}
              maxLength={MAX_BUSCA_DO_DIA}
              placeholder="Título da vaga, como auxiliar de cozinha"
              aria-label="Buscar pelo título da vaga"
              className={`${classesEntrada} min-w-0 flex-1 basis-56`}
            />
            <button type="submit" className={BOTAO}>
              Buscar
            </button>
            {filtros.busca && (
              <Link
                href={link({ busca: null })}
                scroll={false}
                className="inline-flex min-h-11 items-center px-2 text-label underline"
              >
                Limpar a busca
              </Link>
            )}
          </Form>
        </Linha>
        <Linha nome="Área">
          <nav aria-label="Área" className="flex flex-wrap gap-2">
            {CATEGORIAS.filter((a) => porArea.has(a.slug) || filtros.areas.includes(a.slug)).map((a) => {
              const marcada = filtros.areas.includes(a.slug);
              return (
                <Link
                  key={a.slug}
                  href={trocarArea(a.slug)}
                  scroll={false}
                  aria-pressed={marcada}
                  className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
                    marcada ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-200 text-ink hover:bg-surface-300"
                  }`}
                >
                  {a.nome}
                  <span className={marcada ? "text-surface-300" : "text-ink-muted"}>{porArea.get(a.slug) ?? 0}</span>
                </Link>
              );
            })}
            {filtros.areas.length > 0 && (
              <Link href={link({ area: null })} scroll={false} className="inline-flex min-h-10 items-center px-2 text-label underline">
                Todas as áreas
              </Link>
            )}
          </nav>
        </Linha>
        <Linha nome="Cidade">
          <Filtros
            rotulo="Cidade"
            opcoes={CIDADES_DO_DIA.map((x) => ({ valor: x.valor, nome: x.nome }))}
            atual={filtros.cidade}
            link={(v) => link({ cidade: v === "todas" ? null : v })}
          />
        </Linha>
        <Linha nome="Contratação">
          <Filtros
            rotulo="Contratação"
            opcoes={[
              ...CONTRATACOES_DO_DIA.map((x) => ({ valor: x.valor, nome: x.nome })),
              { valor: "salario", nome: filtros.comSalario ? "Só com salário ✓" : "Só com salário" },
            ]}
            atual={filtros.contratacao}
            link={(v) =>
              v === "salario"
                ? link({ salario: filtros.comSalario ? null : "1" })
                : link({ contratacao: v === "todas" ? null : v })
            }
          />
        </Linha>
        <TituloDoPost atual={capa.titulo} padrao={periodo.titulo} sugestoes={sugestoes} />
      </div>
      {candidatas.length === 0 ? (
        <Vazio
          icone={CalendarClock}
          titulo={`Nenhuma vaga nova ${quandoNoVazio}${todasNovas.length ? " com esses filtros" : ""}`}
          acao={
            outrosPeriodos.length > 0 ? (
              <BotaoLink href={link({ periodo: outrosPeriodos[0].valor, titulo: null })} scroll={false}>
                Ver as de {outrosPeriodos[0].nome}
              </BotaoLink>
            ) : undefined
          }
        >
          Só entram vagas no ar: ativas, sem “vaga preenchida” e dentro do prazo.
        </Vazio>
      ) : (
        <CarrosselDoInstagram
          candidatas={candidatas}
          iniciais={iniciais}
          dia={diaPorExtenso(agora)}
          agora={agora}
          rotas={{ imagens: `${BASE}/imagem`, baixar: `${BASE}/baixar` }}
          doPost={{ consulta: extra, titulo: tituloDaLegenda(capa), hashtags: hashtagsDoDia(filtros) }}
          links={{ bio: linkDaBio(site), story: [antes!, depois!], fimDosStories: linkDoFimDosStories(site) }}
          ajudaDaBio="Basta pôr uma vez. Quem criar a conta por ele aparece em Admin › Campanhas como instagram:bio; pelos stories, como instagram:stories."
        />
      )}
    </Secao>
  );
}

/** Uma linha de filtros com o nome à esquerda (em cima, no celular). */
function Linha({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
      <p className="text-label text-ink-muted sm:w-28 sm:shrink-0 sm:pt-2.5">{nome}</p>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Os outros filtros do endereço, escondidos no formulário (o Form manda só o que está nele). */
function Ocultos({ valores }: { valores: Record<string, string | null> }) {
  return (
    <>
      {Object.entries(valores).map(([nome, valor]) =>
        valor ? <input key={nome} type="hidden" name={nome} value={valor} /> : null,
      )}
    </>
  );
}

/** Uma data do período escolhido (o calendário do celular abre no toque), até hoje. */
function Data({ nome, rotulo, valor, hoje }: { nome: string; rotulo: string; valor: string; hoje: string }) {
  return (
    <label className="flex w-44 flex-col gap-1 text-body-sm text-ink-muted">
      {rotulo}
      {/* a chave troca o campo quando o endereço muda (o defaultValue sozinho não muda o que está escrito) */}
      <input key={valor} type="date" name={nome} defaultValue={valor} max={hoje} required className={classesEntrada} />
    </label>
  );
}
