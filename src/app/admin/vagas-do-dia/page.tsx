import { CalendarClock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { TituloDoPost } from "@/components/admin/titulo-do-post";
import { Filtros, linkCom, Secao } from "@/components/admin/ui";
import { CarrosselDoInstagram } from "@/components/instagram/carrossel";
import { Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { CATEGORIAS } from "@/lib/constantes";
import { primeiro } from "@/lib/formato";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { notFound } from "next/navigation";
import { acessoVagasDoDia, vagasEscolhidas, vagasNovasNoAr } from "@/lib/servidor/vagas-do-dia";
import { agoraDaRequisicao } from "@/lib/tempo";
import {
  CIDADES_DO_DIA,
  CONTRATACOES_DO_DIA,
  diaPorExtenso,
  filtrarVagasDoDia,
  hashtagsDoDia,
  lerFiltrosDoDia,
  lerIdsDoDia,
  linkDaBio,
  linkDoFimDosStories,
  linkDoStory,
  ordenarVagasDoDia,
  PERIODOS_DO_DIA,
  textoDaCapa,
  tituloDaArea,
  tituloDaLegenda,
  VAGAS_MARCADAS,
} from "@/lib/vagas-do-dia";

export const metadata: Metadata = { title: "Vagas do dia" };

const BASE = "/admin/vagas-do-dia";

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
  const periodo = PERIODOS_DO_DIA.find((p) => p.valor === primeiro(sp.periodo)) ?? PERIODOS_DO_DIA[0];
  const agora = await agoraDaRequisicao();
  const agoraIso = new Date(agora).toISOString();
  const desde = new Date(agora - periodo.horas * 3600 * 1000).toISOString();
  // os filtros (a área, a praça, só com salário e o jeito de contratar) e o título, todos no endereço
  // (claude/plano-vagas-do-dia-por-area.md)
  const filtros = lerFiltrosDoDia({
    area: primeiro(sp.area),
    cidade: primeiro(sp.cidade),
    salario: primeiro(sp.salario),
    contratacao: primeiro(sp.contratacao),
  });
  const titulo = primeiro(sp.titulo) ?? null;
  const capa = textoDaCapa({ titulo, cidade: filtros.cidade, periodo: periodo.valor }, agora);
  const todasNovas = ordenarVagasDoDia(await vagasNovasNoAr(c, desde, agoraIso));
  const novas = filtrarVagasDoDia(todasNovas, filtros);
  // quantas vagas cada área tem, com os outros filtros (para não marcar uma área vazia)
  const porArea = new Map<string, number>();
  for (const v of filtrarVagasDoDia(todasNovas, filtros, true))
    if (v.categoria) porArea.set(v.categoria, (porArea.get(v.categoria) ?? 0) + 1);
  // o endereço com uma mudança (as vagas escolhidas recomeçam: a lista muda com os filtros)
  const atuais = {
    periodo: periodo.valor === "24h" ? null : periodo.valor,
    area: filtros.areas.join(",") || null,
    cidade: filtros.cidade === "todas" ? null : filtros.cidade,
    salario: filtros.comSalario ? "1" : null,
    contratacao: filtros.contratacao === "todas" ? null : filtros.contratacao,
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
  if (filtros.areas.length) consulta.set("area", filtros.areas.join(","));
  const extra = consulta.size ? `&${consulta.toString()}` : "";
  // as escolhidas no endereço (?v=) que são de antes do período continuam na lista
  const pedidas = lerIdsDoDia(primeiro(sp.v));
  const deAntes = pedidas.filter((id) => !novas.some((v) => v.id === id));
  const candidatas = [...novas, ...(deAntes.length ? await vagasEscolhidas(c, deAntes, agoraIso) : [])];
  const iniciais = pedidas.length
    ? pedidas.filter((id) => candidatas.some((v) => v.id === id))
    : novas.slice(0, VAGAS_MARCADAS).map((v) => v.id);
  const outrosPeriodos = PERIODOS_DO_DIA.filter((p) => p.horas > periodo.horas);
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
            opcoes={PERIODOS_DO_DIA.map((p) => ({ valor: p.valor, nome: p.nome }))}
            atual={periodo.valor}
            link={(v) => link({ periodo: v === "24h" ? null : v, titulo: null })}
          />
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
          titulo={`Nenhuma vaga nova ${periodo.valor === "24h" ? "nas últimas 24 horas" : `em ${periodo.nome.toLowerCase()}`}${todasNovas.length ? " com esses filtros" : ""}`}
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
