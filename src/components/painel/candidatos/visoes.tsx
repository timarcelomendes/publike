import { CalendarDays, ChevronLeft, ChevronRight, Columns3, Inbox, ListTodo, Lock, MapPin, Lightbulb } from "lucide-react";
import Link from "next/link";
import { abaDaEtapa } from "@/lib/constantes";
import type { ItemCaixa } from "@/lib/servidor/caixa";
import { abaDe } from "@/lib/servidor/caixa";
import {
  agruparPeloPedido,
  aneisDoMapa,
  candidatosNoMapa,
  horaCurta,
  inicioDaSemana,
  inicioDoDia,
  kmEmPalavras,
  NOME_DA_VISAO_CANDIDATOS,
  siglasDasVagas,
  VISOES_CANDIDATOS,
  VISOES_PAGAS_CANDIDATOS,
  COOKIE_VISAO_CANDIDATOS,
  type GrupoDoPedido,
  type VisaoDosCandidatos,
} from "@/lib/visoes-dos-candidatos";
import { Avatar } from "../../ui/basicos";
import { classesBotao } from "../../ui/botao";
import { AcoesInteressado } from "../acoes";
import { estadoEmPalavras } from "../item-caixa";
import { LembrarVisaoDasVagas } from "../lembrar-visao-vagas";
import { NotaAderencia } from "../nota-aderencia";
import type { CartaoDeTodas, ColunaDoQuadro } from "./quadro-de-todas";

// As visões de Candidatos (11/11/2026, claude/plano-visoes-dos-candidatos.md). A Mesa continua na
// mesa-candidatos.tsx; aqui ficam "Pelo que pede você" (grátis), o Mapa e a Agenda (nos planos). O Quadro de todas
// as vagas arrasta, então é cliente (quadro-de-todas.tsx); daqui sai só o que cada cartão mostra.

const ICONE: Record<VisaoDosCandidatos, typeof Inbox> = {
  mesa: Inbox,
  prioridade: ListTodo,
  quadro: Columns3,
  mapa: MapPin,
  agenda: CalendarDays,
};

const DIA = 86_400_000;

/** A troca de visão, logo abaixo do título. `pagas`: "trancadas" mostra o cadeado; null esconde (sem a migração). */
export function TrocaDeVisaoDosCandidatos({
  visao,
  href,
  pagas,
}: {
  visao: VisaoDosCandidatos;
  href: (v: VisaoDosCandidatos) => string;
  pagas: "livres" | "trancadas" | null;
}) {
  return (
    <nav
      aria-label="Ver os candidatos em"
      className="sem-barra -mx-4 flex gap-0.5 overflow-x-auto px-4 sm:mx-0 sm:self-start sm:rounded-pill sm:bg-surface-300 sm:p-0.5"
    >
      {VISOES_CANDIDATOS.filter((v) => pagas || !VISOES_PAGAS_CANDIDATOS.includes(v)).map((v) => {
        const Icone = ICONE[v];
        const trancada = pagas === "trancadas" && VISOES_PAGAS_CANDIDATOS.includes(v);
        return (
          <LembrarVisaoDasVagas key={v} visao={v} cookie={COOKIE_VISAO_CANDIDATOS} href={href(v)} ativa={visao === v}>
            <Icone aria-hidden />
            {NOME_DA_VISAO_CANDIDATOS[v]}
            {trancada && (
              <>
                <Lock aria-hidden className="text-ink-muted" />
                <span className="sr-only"> (nos planos)</span>
              </>
            )}
          </LembrarVisaoDasVagas>
        );
      })}
    </nav>
  );
}

const ficha = (c: ItemCaixa) => `/painel/caixa?c=${encodeURIComponent(c.chave)}`;

/** "Setor Bueno, Goiânia" ou só a cidade. */
const ondeMora = (c: ItemCaixa) => [c.bairro, c.cidade].filter(Boolean).join(", ");

// ———————————————————————————————— Pelo que pede você (grátis)

const COR_DO_GRUPO: Record<GrupoDoPedido, string> = {
  responder: "bg-terra",
  logo: "bg-ink",
  decidir: "bg-ipe",
  parado: "bg-surface-100 ring-2 ring-inset ring-line-strong",
  sozinho: "bg-cerrado",
};

const MAIS_NA_MESA: Record<GrupoDoPedido, string> = {
  responder: "novos",
  logo: "entrevista",
  decidir: "entrevista",
  parado: "analise",
  sozinho: "analise",
};

/** Quantos cartões cada grupo mostra antes do "Ver mais na Mesa". */
const POR_GRUPO = 6;

export function CandidatosPeloPedido({
  itens,
  agora,
  comIA,
  vaga,
}: {
  itens: ItemCaixa[];
  agora: number;
  comIA: boolean;
  /** o filtro de vaga, para o "Ver mais na Mesa" */
  vaga: string | null;
}) {
  const grupos = agruparPeloPedido(itens, agora);
  const pedem = grupos.filter((g) => g.valor !== "sozinho");
  const sozinhos = grupos.find((g) => g.valor === "sozinho")?.pessoas ?? [];
  const responder = grupos[0].pessoas.length;
  const nada = pedem.every((g) => g.pessoas.length === 0);

  return (
    <div className="flex flex-col gap-6">
      {responder >= 3 && (
        <p className="flex max-w-3xl items-start gap-2 rounded-md bg-surface-300 px-4 py-3 text-body-sm">
          <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-terra-text" />
          <span>
            {responder} esperam a sua resposta. Em{" "}
            <Link href={`/painel/caixa/triagem${vaga ? `?vaga=${vaga}` : ""}`} className="font-semibold underline underline-offset-2">
              Decidir um por um
            </Link>{" "}
            você responde todos em sequência{comIA ? ", com o resumo da IA de cada currículo" : ""}.
          </span>
        </p>
      )}
      {nada && (
        <p className="max-w-2xl text-body text-ink-muted">
          Nada pede você agora: ninguém esperando resposta, nenhuma entrevista para hoje ou amanhã e ninguém parado.
        </p>
      )}
      {pedem
        .filter((g) => g.pessoas.length > 0)
        .map((g) => (
          <section key={g.valor} aria-label={g.nome} className="flex flex-col gap-3">
            <h3 className="flex items-center gap-2 text-h3">
              <span aria-hidden className={`size-2.5 shrink-0 rounded-pill ${COR_DO_GRUPO[g.valor]}`} />
              {g.nome}
              <span
                className={`inline-flex min-w-6 items-center justify-center rounded-pill px-1.5 font-sans text-caption font-bold ${
                  g.valor === "responder" ? "bg-terra-soft text-terra-text" : "bg-surface-300 text-ink"
                }`}
              >
                {g.pessoas.length}
              </span>
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {g.pessoas.slice(0, POR_GRUPO).map(({ c, p }) => (
                <li
                  key={c.chave}
                  className="flex min-w-0 flex-col gap-2.5 rounded-lg border border-line bg-surface-200 p-3.5 shadow-card"
                >
                  <div className="flex items-center gap-2.5">
                    <Avatar nome={c.nome} foto={c.foto} tamanho={40} />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={ficha(c)}
                        className="block truncate text-label text-ink underline-offset-2 hover:underline"
                      >
                        {c.nome}
                      </Link>
                      <span className="block truncate text-body-sm text-ink-muted">
                        {c.anuncio_titulo}
                        {c.bairro ? ` · ${c.bairro}` : ""}
                      </span>
                    </div>
                    {c.aderencia && <NotaAderencia a={c.aderencia} />}
                  </div>
                  <span className={`text-label ${p.alerta ? "text-terra-text" : "text-ink"}`}>{p.motivo}</span>
                  {g.valor === "responder" ? (
                    <AcoesInteressado
                      anuncioId={c.anuncio_id}
                      perfilId={c.perfil_id}
                      status={c.status}
                      semCurriculo={c.semCurriculo}
                      aceita={c.aceita}
                      compacto
                    />
                  ) : (
                    p.acao && (
                      <Link href={ficha(c)} className={classesBotao("secundario", "sm", "w-full justify-center")}>
                        {p.acao}
                      </Link>
                    )
                  )}
                </li>
              ))}
            </ul>
            {g.pessoas.length > POR_GRUPO && (
              <Link
                href={`/painel/caixa?visao=mesa&aba=${MAIS_NA_MESA[g.valor]}${vaga ? `&vaga=${vaga}` : ""}`}
                className="self-start text-label text-ink underline underline-offset-2"
              >
                Ver mais {g.pessoas.length - POR_GRUPO} na Mesa
              </Link>
            )}
          </section>
        ))}
      {sozinhos.length > 0 && (
        <details className="group rounded-lg border border-line bg-surface-200">
          <summary className="flex min-h-12 cursor-pointer items-center gap-2 px-4 text-label">
            <span aria-hidden className="size-2.5 shrink-0 rounded-pill bg-cerrado" />
            <span>
              Andam sozinhos ({sozinhos.length})
              <span className="font-normal text-ink-muted max-sm:hidden">: entrevista marcada adiante, esperando currículo ou em análise</span>
            </span>
            <ChevronRight aria-hidden className="ml-auto size-4 shrink-0 transition-transform group-open:rotate-90" />
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {sozinhos.map(({ c, p }) => (
              <li key={c.chave}>
                <Link href={ficha(c)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-300">
                  <Avatar nome={c.nome} foto={c.foto} tamanho={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label">{c.nome}</span>
                    <span className="block truncate text-body-sm text-ink-muted">
                      {c.anuncio_titulo} · {p.motivo}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ———————————————————————————————— Quadro de todas as vagas (nos planos): o que cada cartão mostra

export function cartoesDeTodas(itens: ItemCaixa[], agora: number): CartaoDeTodas[] {
  const vagas = new Map<string, { id: string; titulo: string }>();
  for (const c of itens) vagas.set(c.anuncio_id, { id: c.anuncio_id, titulo: c.anuncio_titulo });
  const siglas = siglasDasVagas([...vagas.values()]);
  const cartoes: CartaoDeTodas[] = [];
  for (const c of itens) {
    const coluna = abaDe(c);
    if (coluna === "nao_seguiu") continue;
    const estado = estadoEmPalavras(c, agora);
    cartoes.push({
      chave: c.chave,
      anuncioId: c.anuncio_id,
      perfilId: c.perfil_id,
      nome: c.nome,
      foto: c.foto,
      sigla: siglas.get(c.anuncio_id) ?? "",
      vaga: c.anuncio_titulo,
      onde: c.bairro ?? c.cidade,
      aderencia: c.aderencia,
      coluna: coluna as ColunaDoQuadro,
      estado: estado.texto,
      alerta: estado.destaque,
    });
  }
  // quem pede você primeiro, depois quem chegou antes
  return cartoes.sort(
    (a, b) =>
      Number(b.alerta) - Number(a.alerta) ||
      (itens.find((x) => x.chave === a.chave)?.curtido_em ?? "").localeCompare(
        itens.find((x) => x.chave === b.chave)?.curtido_em ?? "",
      ),
  );
}

/** As siglas do Quadro, com o nome de cada vaga (a legenda embaixo do filtro). */
export function LegendaDasSiglas({ itens }: { itens: ItemCaixa[] }) {
  const vagas = new Map<string, { id: string; titulo: string }>();
  for (const c of itens) vagas.set(c.anuncio_id, { id: c.anuncio_id, titulo: c.anuncio_titulo });
  if (vagas.size < 2) return null;
  const siglas = siglasDasVagas([...vagas.values()]);
  return (
    <ul aria-label="As vagas no quadro" className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-muted">
      {[...vagas.values()].map((v) => (
        <li key={v.id} className="inline-flex items-center gap-1.5">
          <span className="rounded-sm bg-surface-300 px-1 text-[11px] leading-[18px] font-bold text-ink">
            {siglas.get(v.id)}
          </span>
          {v.titulo}
        </li>
      ))}
    </ul>
  );
}

// ———————————————————————————————— Mapa de onde moram (nos planos)

export function MapaDosCandidatos({
  itens,
  vaga,
  agora,
}: {
  /** os candidatos da vaga escolhida (fora quem não seguiu) */
  itens: ItemCaixa[];
  vaga: { titulo: string; cidade: string; bairro: string | null };
  agora: number;
}) {
  const { regioes, fora, daVaga } = candidatosNoMapa(itens, vaga);
  const maisLonge = Math.max(0, ...regioes.map((r) => r.km));
  const aneis = aneisDoMapa(maisLonge);
  const raio = aneis[aneis.length - 1];
  const perto = regioes.filter((r) => r.km <= 6).reduce((n, r) => n + r.pessoas.length, 0);
  const noMapa = regioes.reduce((n, r) => n + r.pessoas.length, 0);
  const pessoas = regioes.flatMap((r) => r.pessoas.map((c) => ({ c, km: r.km }))).sort((a, b) => a.km - b.km);
  // em %, do centro para a borda (46% deixa a bolinha da borda inteira); pela raiz, para as regiões perto não se
  // amontoarem no meio quando alguém mora noutra cidade
  const pos = (km: number) => Math.sqrt(Math.min(km, raio) / raio) * 46;
  const descricao = `Mapa com a vaga (${daVaga.nome}) no centro e os candidatos por região: ${regioes
    .map((r) => `${r.nome}, ${r.pessoas.length} (${kmEmPalavras(r.km)})`)
    .join("; ")}.`;

  return (
    <div className="flex flex-col-reverse gap-4 lg:flex-row lg:items-start">
      <section
        aria-label="Mais perto primeiro"
        className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card lg:w-80 lg:shrink-0"
      >
        <div className="flex flex-col px-4 pt-3.5 pb-2.5">
          <h3 className="text-h3">
            {itens.length} {itens.length === 1 ? "candidato" : "candidatos"}
          </h3>
          <span className="text-body-sm text-ink-muted">Mais perto da vaga primeiro, em linha reta</span>
        </div>
        <ul className="divide-y divide-line border-t border-line">
          {pessoas.map(({ c, km }) => {
            const estado = estadoEmPalavras(c, agora);
            return (
              <li key={c.chave}>
                <Link href={ficha(c)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-300">
                  <Avatar nome={c.nome} foto={c.foto} tamanho={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label">{c.nome}</span>
                    <span
                      className={`block truncate text-body-sm ${estado.destaque ? "font-semibold text-terra-text" : "text-ink-muted"}`}
                    >
                      {c.bairro ?? c.cidade} · {estado.texto}
                    </span>
                  </span>
                  <span className="shrink-0 text-label tabular-nums">{kmEmPalavras(km).replace("na mesma região", "perto")}</span>
                </Link>
              </li>
            );
          })}
          {fora.map((c) => (
            <li key={c.chave}>
              <Link href={ficha(c)} className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-300">
                <Avatar nome={c.nome} foto={c.foto} tamanho={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-label">{c.nome}</span>
                  <span className="block truncate text-body-sm text-ink-muted">{ondeMora(c) || "Não disse onde mora"}</span>
                </span>
                <span className="shrink-0 text-body-sm text-ink-muted">fora do mapa</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Mapa por região" className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div
          role="img"
          aria-label={descricao}
          className="relative mx-auto aspect-square w-full max-w-[36rem] overflow-hidden rounded-lg border border-line bg-surface-300"
        >
          {aneis.map((km) => (
            <span key={km} aria-hidden>
              <span
                className="absolute rounded-pill border-2 border-dashed border-line-strong/60"
                style={{
                  left: `${50 - pos(km)}%`,
                  top: `${50 - pos(km)}%`,
                  width: `${2 * pos(km)}%`,
                  height: `${2 * pos(km)}%`,
                }}
              />
              <span
                className="absolute -translate-x-1/2 -translate-y-1/2 rounded-pill bg-surface-100 px-2 text-caption leading-4 font-bold text-ink-muted"
                style={{ left: `${50 + pos(km) * 0.7071}%`, top: `${50 + pos(km) * 0.7071}%` }}
              >
                {km} km
              </span>
            </span>
          ))}
          {regioes.map((r) => {
            const n = r.pessoas.length;
            const d = 28 + Math.min(n, 8) * 5;
            // a região da vaga fica logo abaixo do alfinete
            const f = r.km < 0.5 ? 0 : pos(r.km) / r.km;
            const x = r.km < 0.5 ? 0 : r.leste * f;
            const y = r.km < 0.5 ? 9 : -r.norte * f;
            return (
              <span
                key={r.chave}
                aria-hidden
                className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
                style={{ left: `${50 + x}%`, top: `${50 + y}%` }}
              >
                <span
                  className="inline-flex items-center justify-center rounded-pill bg-ink/75 text-label text-surface-100 ring-[3px] ring-surface-300"
                  style={{ width: d, height: d }}
                >
                  {n}
                </span>
                <span className="rounded-pill bg-surface-100/90 px-1.5 text-caption leading-4 font-semibold whitespace-nowrap">
                  {r.nome}
                </span>
              </span>
            );
          })}
          <span
            aria-hidden
            className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
          >
            <span className="size-5 rounded-pill bg-terra ring-4 ring-surface-100" />
          </span>
          <span
            aria-hidden
            className="absolute top-3 left-3 rounded-pill bg-ink px-2.5 py-0.5 text-caption font-bold text-surface-100"
          >
            <span className="mr-1.5 inline-block size-2 rounded-pill bg-terra align-middle" />A vaga: {daVaga.nome}
          </span>
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-muted">
          <span>Cada bolinha é uma região, com quantos moram lá. Nunca a casa da pessoa.</span>
          {noMapa > 0 && (
            <span>
              <strong className="text-ink">
                {perto} de {noMapa}
              </strong>{" "}
              a até 6 km da vaga
            </span>
          )}
          <span>As distâncias são em linha reta, entre os centros das regiões.</span>
        </p>
      </section>
    </div>
  );
}

// ———————————————————————————————— Agenda das entrevistas (nos planos)

const NOME_DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const FUSO = -3 * 3_600_000;
const diaDoMes = (t: number) => new Date(t - FUSO).getUTCDate();
const diaDaSemana = (t: number) => new Date(t - FUSO).getUTCDay();
const mes = (t: number) =>
  new Date(t - FUSO).toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

/** "9 a 14 de novembro", "30 de novembro a 5 de dezembro". */
function nomeDaSemana(inicio: number, fim: number) {
  return mes(inicio) === mes(fim)
    ? `${diaDoMes(inicio)} a ${diaDoMes(fim)} de ${mes(fim)}`
    : `${diaDoMes(inicio)} de ${mes(inicio)} a ${diaDoMes(fim)} de ${mes(fim)}`;
}

/** A semana pedida (?semana=AAAA-MM-DD, a segunda) ou a de agora. */
export function lerSemana(pedida: string | null | undefined, agora: number) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(pedida ?? "");
  if (!m) return inicioDaSemana(agora);
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - FUSO;
  return Number.isNaN(t) ? inicioDaSemana(agora) : inicioDaSemana(t + 12 * 3_600_000);
}

export const chaveDaSemana = (inicio: number) => new Date(inicio - FUSO).toISOString().slice(0, 10);

type Evento = { c: ItemCaixa; inicio: number; fim: number; faixa: number; faixas: number };

const ESTILO_DO_EVENTO = {
  foi: { classe: "bg-surface-300 text-ink-muted", texto: "Já foi: decida" },
  confirmada: { classe: "bg-surface-100 text-ink ring-2 ring-inset ring-cerrado", texto: "Confirmou" },
  marcada: { classe: "bg-terra-soft text-terra-text", texto: "Sem confirmar" },
  remarcar: { classe: "bg-surface-100 text-danger ring-2 ring-inset ring-danger", texto: "Pediu para remarcar" },
};

function estiloDe(e: Evento, agora: number) {
  if (e.fim < agora) return ESTILO_DO_EVENTO.foi;
  const s = e.c.entrevista?.situacao;
  return s === "confirmada" ? ESTILO_DO_EVENTO.confirmada : s === "remarcar" ? ESTILO_DO_EVENTO.remarcar : ESTILO_DO_EVENTO.marcada;
}

/** As entrevistas de um dia lado a lado quando se cruzam. */
function emFaixas(eventos: Omit<Evento, "faixa" | "faixas">[]): Evento[] {
  const ordem = [...eventos].sort((a, b) => a.inicio - b.inicio);
  const fins: number[] = [];
  const com = ordem.map((e) => {
    let faixa = fins.findIndex((f) => f <= e.inicio);
    if (faixa < 0) faixa = fins.push(e.fim) - 1;
    else fins[faixa] = e.fim;
    return { ...e, faixa, faixas: 1 };
  });
  return com.map((e) => ({ ...e, faixas: fins.length }));
}

const POR_HORA = 64;

export function AgendaDasEntrevistas({
  itens,
  agora,
  semana,
  href,
}: {
  itens: ItemCaixa[];
  agora: number;
  /** a segunda-feira da semana, em ms */
  semana: number;
  /** o endereço de outra semana */
  href: (semana: number) => string;
}) {
  const fimDaSemana = semana + 7 * DIA;
  const marcadas = itens.filter(
    (c) => c.entrevista && c.entrevista.situacao !== "escolher" && abaDaEtapa(c) !== "nao_seguiu",
  );
  const daSemana = marcadas
    .map((c) => {
      const inicio = new Date(c.entrevista!.quando).getTime();
      return { c, inicio, fim: inicio + Math.max(15, c.entrevista!.duracao_min || 30) * 60_000 };
    })
    .filter((e) => e.inicio >= semana && e.inicio < fimDaSemana);
  const escolhendo = itens.filter((c) => c.entrevista?.situacao === "escolher");
  const temDomingo = daSemana.some((e) => diaDaSemana(e.inicio) === 0);
  const dias = Array.from({ length: temDomingo ? 7 : 6 }, (_, i) => semana + i * DIA);
  const porDia = new Map(dias.map((d) => [d, emFaixas(daSemana.filter((e) => inicioDoDia(e.inicio) === d))]));
  const hora = (t: number) => (t - inicioDoDia(t)) / 3_600_000;
  const primeira = Math.min(8, ...daSemana.map((e) => Math.floor(hora(e.inicio))));
  const ultima = Math.max(18, ...daSemana.map((e) => Math.ceil(hora(e.fim) + 0.25)));
  const horas = Array.from({ length: ultima - primeira + 1 }, (_, i) => primeira + i);
  const altura = (ultima - primeira) * POR_HORA;
  const hoje = inicioDoDia(agora);
  const estaSemana = inicioDaSemana(agora);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href={href(semana - 7 * DIA)}
          aria-label="Semana anterior"
          scroll={false}
          className={classesBotao("secundario", "sm", "min-w-10 px-2.5")}
        >
          <ChevronLeft aria-hidden />
        </Link>
        <h3 className="min-w-44 text-center text-label">{nomeDaSemana(semana, dias[dias.length - 1])}</h3>
        <Link
          href={href(semana + 7 * DIA)}
          aria-label="Próxima semana"
          scroll={false}
          className={classesBotao("secundario", "sm", "min-w-10 px-2.5")}
        >
          <ChevronRight aria-hidden />
        </Link>
        {semana !== estaSemana && (
          <Link href={href(estaSemana)} scroll={false} className="text-label text-ink underline underline-offset-2">
            Esta semana
          </Link>
        )}
        <span className="text-body-sm text-ink-muted sm:ml-auto">
          {daSemana.length === 0
            ? "Nenhuma entrevista nesta semana"
            : `${daSemana.length} ${daSemana.length === 1 ? "entrevista" : "entrevistas"} nesta semana`}
        </span>
      </div>

      <ul aria-hidden className="flex flex-wrap gap-x-4 gap-y-1.5 text-body-sm text-ink-muted">
        {Object.values(ESTILO_DO_EVENTO).map((e) => (
          <li key={e.texto} className="inline-flex items-center gap-1.5">
            <span className={`size-3.5 rounded-[4px] ${e.classe}`} />
            {e.texto.replace(": decida", "")}
          </li>
        ))}
      </ul>

      {/* no computador, a semana em colunas; no celular, um dia embaixo do outro */}
      <section
        aria-label={`Semana de ${nomeDaSemana(semana, dias[dias.length - 1])}`}
        className="hidden overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card md:block"
      >
        <div className="grid" style={{ gridTemplateColumns: `3.25rem repeat(${dias.length}, minmax(0, 1fr))` }}>
          <div className="border-b border-line" />
          {dias.map((d) => (
            <div
              key={d}
              className={`flex items-baseline gap-1.5 border-b border-l border-line px-2.5 py-2.5 ${d === hoje ? "bg-surface-100" : ""}`}
            >
              <span className="text-body-sm font-semibold text-ink-muted">{NOME_DIA[diaDaSemana(d)]}</span>
              <span className="font-display text-body-lg font-bold">{diaDoMes(d)}</span>
              {d === hoje && (
                <span className="ml-auto rounded-pill bg-ink px-2 text-caption leading-[18px] font-bold text-surface-100">
                  Hoje
                </span>
              )}
            </div>
          ))}
          <div className="relative" style={{ height: altura }}>
            {horas.slice(0, -1).map((h) => (
              <span
                key={h}
                className="absolute right-2 text-caption text-ink-muted"
                style={{ top: (h - primeira) * POR_HORA - 2 }}
              >
                {h}h
              </span>
            ))}
          </div>
          {dias.map((d) => (
            <div key={d} className={`relative border-l border-line ${d === hoje ? "bg-surface-100/60" : ""}`} style={{ height: altura }}>
              {horas.slice(1, -1).map((h) => (
                <span
                  key={h}
                  aria-hidden
                  className="absolute inset-x-0 h-px bg-line/60"
                  style={{ top: (h - primeira) * POR_HORA }}
                />
              ))}
              {d === hoje && hora(agora) > primeira && hora(agora) < ultima && (
                <span
                  aria-hidden
                  className="absolute inset-x-0 h-0.5 bg-terra"
                  style={{ top: (hora(agora) - primeira) * POR_HORA }}
                />
              )}
              {(porDia.get(d) ?? []).map((e) => {
                const estilo = estiloDe(e, agora);
                return (
                  <Link
                    key={e.c.chave}
                    href={ficha(e.c)}
                    className={`absolute flex flex-col overflow-hidden rounded-md px-2 py-1.5 text-caption leading-4 ${estilo.classe}`}
                    style={{
                      top: (hora(e.inicio) - primeira) * POR_HORA + 2,
                      height: Math.max(56, ((e.fim - e.inicio) / 3_600_000) * POR_HORA - 4),
                      left: `calc(${(e.faixa / e.faixas) * 100}% + 4px)`,
                      width: `calc(${100 / e.faixas}% - 8px)`,
                    }}
                  >
                    <span className="truncate font-bold">
                      {horaCurta(e.inicio)} · {e.c.nome.split(" ")[0]}
                    </span>
                    <span className="truncate opacity-85">{e.c.anuncio_titulo}</span>
                    <span className="truncate font-semibold">{estilo.texto}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Entrevistas da semana, por dia" className="flex flex-col gap-3 md:hidden">
        {dias
          .filter((d) => (porDia.get(d) ?? []).length > 0 || d === hoje)
          .map((d) => (
            <div key={d} className="flex flex-col gap-2">
              <h4 className="flex items-center gap-2 text-label">
                {NOME_DIA[diaDaSemana(d)]}, {diaDoMes(d)}
                {d === hoje && (
                  <span className="rounded-pill bg-ink px-2 text-caption leading-[18px] font-bold text-surface-100">Hoje</span>
                )}
              </h4>
              {(porDia.get(d) ?? []).length === 0 && <p className="text-body-sm text-ink-muted">Nenhuma entrevista.</p>}
              {(porDia.get(d) ?? []).map((e) => {
                const estilo = estiloDe(e, agora);
                return (
                  <Link
                    key={e.c.chave}
                    href={ficha(e.c)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${estilo.classe}`}
                  >
                    <span className="w-12 shrink-0 text-label tabular-nums">{horaCurta(e.inicio)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-label">{e.c.nome}</span>
                      <span className="block truncate text-body-sm opacity-85">{e.c.anuncio_titulo}</span>
                    </span>
                    <span className="shrink-0 text-body-sm font-semibold">{estilo.texto}</span>
                  </Link>
                );
              })}
            </div>
          ))}
      </section>

      {escolhendo.length > 0 && (
        <p className="text-body-sm text-ink-muted">
          Escolhendo o horário:{" "}
          {escolhendo.map((c, i) => (
            <span key={c.chave}>
              {i > 0 && ", "}
              <Link href={ficha(c)} className="font-semibold text-ink underline underline-offset-2">
                {c.nome.split(" ")[0]}
              </Link>
            </span>
          ))}
          . Quando escolherem, a entrevista aparece aqui.
        </p>
      )}
      <p className="text-body-sm text-ink-muted">
        Toque numa entrevista para abrir a ficha da pessoa: lá você remarca, manda o lembrete ou decide.
      </p>
    </div>
  );
}
