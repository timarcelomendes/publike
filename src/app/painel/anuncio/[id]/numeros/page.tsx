import { BarChart3, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { GraficoDeCandidaturas, type ColunaDoGrafico } from "@/components/painel/grafico-candidaturas";
import { CaminhoDosCandidatos, DeOndeVieram, TemposDoProcesso } from "@/components/painel/numeros-do-processo";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { obterAnuncio } from "@/lib/dados";
import { formatarData, formatarNumero, tempoRelativo } from "@/lib/formato";
import { numerosDoProcesso, numerosOrigem } from "@/lib/servidor/automacoes";
import { candidaturasDaVaga, visitasDaVaga } from "@/lib/servidor/numeros-da-vaga";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Números da vaga" };

// A aba Números da vaga (pedido de 01/11/2026): como a vaga está indo, numa frase (quantos se candidataram,
// quantas visitas, quando chegaram), as candidaturas dia a dia e as partes de /painel/numeros só desta vaga
// (o caminho, os tempos e de onde vieram). Sem migração nova: lê as curtidas, as visitas e as funções da parte 6.

export default function NumerosDaVaga({ params }: PageProps<"/painel/anuncio/[id]/numeros">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {params.then(({ id }) => (
        <Conteudo id={id} />
      ))}
    </Suspense>
  );
}

const DIA = 86_400_000;
/** "2026-10-15", o dia em Brasília */
const diaDe = (quando: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(quando));
const meioDia = (dia: string) => new Date(`${dia}T12:00:00Z`);
const somarDias = (dia: string, n: number) => new Date(meioDia(dia).getTime() + n * DIA).toISOString().slice(0, 10);
const diasEntre = (de: string, ate: string) => Math.round((meioDia(ate).getTime() - meioDia(de).getTime()) / DIA);
const rotuloDoDia = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const rotuloDaData = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
const curto = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;

/** Até 45 dias, uma coluna por dia; mais que isso, por semana (de segunda), as últimas 26. */
function colunasDoGrafico(datas: string[], inicio: string, fim: string) {
  const porDia = new Map<string, number>();
  for (const d of datas) porDia.set(d, (porDia.get(d) ?? 0) + 1);
  const total = diasEntre(inicio, fim) + 1;
  if (total <= 45) {
    const colunas: ColunaDoGrafico[] = Array.from({ length: total }, (_, i) => {
      const dia = somarDias(inicio, i);
      return { rotulo: rotuloDoDia.format(meioDia(dia)), curto: curto(dia), n: porDia.get(dia) ?? 0 };
    });
    return { colunas, unidade: "dia" as const };
  }
  const segunda = (dia: string) => somarDias(dia, -((meioDia(dia).getUTCDay() + 6) % 7));
  const primeira = segunda(inicio);
  const semanas = Math.floor(diasEntre(primeira, segunda(fim)) / 7) + 1;
  const colunas: ColunaDoGrafico[] = Array.from({ length: semanas }, (_, i) => {
    const dia = somarDias(primeira, i * 7);
    return { rotulo: `semana de ${rotuloDaData.format(meioDia(dia))}`, curto: curto(dia), n: 0 };
  });
  for (const [dia, n] of porDia) {
    const i = Math.floor(diasEntre(primeira, segunda(dia)) / 7);
    if (colunas[i]) colunas[i].n += n;
  }
  return { colunas: colunas.slice(-26), unidade: "semana" as const };
}

async function Conteudo({ id }: { id: string }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/numeros`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const [candidaturas, visitas, processo, origens, agora] = await Promise.all([
    candidaturasDaVaga(id),
    visitasDaVaga(id),
    numerosDoProcesso(null),
    numerosOrigem(null, id),
    agoraDaRequisicao(),
  ]);
  const linha = processo?.find((v) => v.anuncio_id === id) ?? null;
  const noAr = anuncio.status === "ativo";
  const datas = (candidaturas ?? []).map((c) => c.criado_em).sort();
  const total = datas.length;
  const dias = datas.map(diaDe);
  const inicio = diaDe(anuncio.criado_em);
  // no ar, até hoje; fora do ar, até a última candidatura
  const fim = [noAr ? diaDe(agora) : (dias.at(-1) ?? inicio), inicio].sort().at(-1) ?? inicio;
  const grafico = colunasDoGrafico(dias, inicio, fim);
  const n = (x: number) => <strong className="font-semibold text-ink">{formatarNumero(x)}</strong>;

  // a frase do alto: quantos, as visitas, a metade e a última
  const partes: ReactNode[] = [];
  if (total === 0) {
    partes.push("Ninguém se candidatou ainda.");
    if (visitas)
      partes.push(
        <>
          A vaga foi aberta {n(visitas)} {visitas === 1 ? "vez" : "vezes"}.
        </>,
      );
  } else {
    const visitasValem = visitas != null && visitas >= total;
    const porCem = visitasValem ? Math.round((total / (visitas as number)) * 100) : 0;
    partes.push(
      <>
        {n(total)} {total === 1 ? "pessoa se candidatou" : "pessoas se candidataram"} desde{" "}
        {formatarData(anuncio.criado_em)}
        {visitasValem ? (
          <>
            , e a vaga foi aberta {n(visitas as number)} {visitas === 1 ? "vez" : "vezes"}: de cada 100 visitas,{" "}
            {porCem < 1 ? <strong className="font-semibold text-ink">menos de 1</strong> : n(porCem)}{" "}
            {porCem > 1 ? "viraram" : "virou"} candidatura.
          </>
        ) : (
          "."
        )}
      </>,
    );
    if (total >= 4) {
      const ate = diasEntre(inicio, dias[Math.ceil(total / 2) - 1]) + 1;
      partes.push(
        <>
          Metade chegou{" "}
          {ate <= 1 ? (
            <strong className="font-semibold text-ink">no primeiro dia</strong>
          ) : (
            <>nos primeiros {n(ate)} dias</>
          )}
          .
        </>,
      );
    }
    if (noAr) partes.push(`A última chegou ${tempoRelativo(datas[total - 1], agora)}.`);
  }
  // muita gente abre e pouca se candidata (a mesma conta da Saúde da vaga)
  const travada = visitas != null && visitas >= 40 && total / visitas < 0.03;

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaVaga anuncio={anuncio} aba="numeros" />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="flex max-w-2xl flex-col gap-2">
          <h2 className="flex flex-wrap items-center gap-2 text-h2">
            <BarChart3 aria-hidden className="size-6 text-ink-muted" />
            Números da vaga
            <Selo variante="novo">Novo</Selo>
          </h2>
          <p className="text-body-lg text-ink-muted">
            {partes.map((p, i) => (
              <span key={i}>
                {i > 0 && " "}
                {p}
              </span>
            ))}
          </p>
          {travada && (
            <p className="text-body-sm">
              Muita gente abre e pouca se candidata: confira se o salário, o horário e o título estão claros.{" "}
              <Link href={`/painel/anuncio/${id}/editar`} className="font-semibold underline underline-offset-2">
                Editar a vaga
              </Link>
            </p>
          )}
        </div>
        <Link
          href="/painel/numeros"
          className="inline-flex min-h-10 items-center text-body-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Números de todas as vagas
        </Link>
      </div>

      {total === 0 ? (
        <Vazio
          icone={Megaphone}
          titulo="Os números aparecem com as candidaturas"
          acao={
            <BotaoLink href="/painel/links" tamanho="sm">
              Ver como divulgar
            </BotaoLink>
          }
        >
          Mande o link da vaga nos grupos de WhatsApp do bairro e no Instagram da empresa: quem vê pelo celular se
          candidata com um toque.
        </Vazio>
      ) : (
        <>
          <GraficoDeCandidaturas
            colunas={grafico.colunas}
            unidade={grafico.unidade}
            ultimaEhHoje={noAr && fim === diaDe(agora)}
          />
          {linha && linha.candidatos > 0 && (
            <>
              <CaminhoDosCandidatos linha={linha} />
              <TemposDoProcesso linha={linha} />
            </>
          )}
          {origens && origens.length > 0 && <DeOndeVieram origens={origens} />}
        </>
      )}
    </div>
  );
}
