import { ChevronRight, Lightbulb } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Selo } from "@/components/ui/basicos";
import { dataCurta } from "@/lib/recursos-pagos";
import type { AcessoAsVisoes } from "@/lib/servidor/visoes";
import { GRUPO, GRUPOS, type ResumoDaVaga } from "@/lib/visoes-das-vagas";
import { AcaoDaVaga, BotaoTestarVisoes, MenuDaVaga } from "./acoes-da-vaga";

// As quatro visões de Vagas (11/11/2026, claude/plano-visoes-das-vagas.md): Lista e "Pelo que pede você" (grátis),
// Mosaico e Linha do tempo (nos planos, com 15 dias grátis e a prévia com as vagas da própria conta).

const DIA = 24 * 3600 * 1000;

/** A vaga na tela: o resumo e o que só a tela usa. */
export type VagaNaTela = ResumoDaVaga & {
  /** "CLT · Setor Bueno · 2 vagas" (na agência, o cliente vem primeiro) */
  meta: string;
  podeRenovar: boolean;
};

const ETAPAS = [
  { chave: "novos", nome: ["novo", "novos"], cor: "bg-ink/20" },
  { chave: "analise", nome: ["em análise", "em análise"], cor: "bg-ink/45" },
  { chave: "entrevista", nome: ["em entrevista", "em entrevista"], cor: "bg-ink/75" },
  { chave: "contratados", nome: ["contratado", "contratados"], cor: "bg-cerrado" },
] as const;

const ddmm = (iso: string | number) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** As etapas em palavras ("8 novos, 4 em análise, 2 em entrevista, 0 de 2 contratados"). */
function etapasEmTexto(v: VagaNaTela) {
  return ETAPAS.map((e) => {
    const n = v.etapas[e.chave];
    if (e.chave === "contratados") return `${n} de ${v.quantas} ${n === 1 && v.quantas === 1 ? e.nome[0] : e.nome[1]}`;
    return `${n} ${n === 1 ? e.nome[0] : e.nome[1]}`;
  }).join(", ");
}

/** A barra das etapas: cada pedaço do tamanho de quantos estão nela. */
export function BarraDasEtapas({ v, alta = false }: { v: VagaNaTela; alta?: boolean }) {
  return (
    <div
      role="img"
      aria-label={etapasEmTexto(v)}
      className={`flex gap-0.5 overflow-hidden rounded-pill bg-surface-300 ${alta ? "h-2.5" : "h-2"}`}
    >
      {ETAPAS.filter((e) => v.etapas[e.chave] > 0).map((e) => (
        <span key={e.chave} className={e.cor} style={{ flex: `${v.etapas[e.chave]} 1 0px` }} />
      ))}
    </div>
  );
}

/** "8 novos · 4 em análise · 2 em entrevista · 0 de 2 contratados", com quem espera em terra. */
function ContagemDasEtapas({ v }: { v: VagaNaTela }) {
  return (
    <p aria-hidden className="flex flex-wrap gap-x-3 gap-y-0.5 text-body-sm text-ink-muted">
      {ETAPAS.map((e) => {
        const n = v.etapas[e.chave];
        const nome = e.chave === "contratados" ? (n === 1 && v.quantas === 1 ? e.nome[0] : e.nome[1]) : n === 1 ? e.nome[0] : e.nome[1];
        return (
          <span key={e.chave}>
            <strong className={`font-bold ${n > 0 ? (e.chave === "novos" && v.esperam ? "text-terra-text" : "text-ink") : ""}`}>
              {e.chave === "contratados" ? `${n} de ${v.quantas}` : n}
            </strong>{" "}
            {nome}
          </span>
        );
      })}
    </p>
  );
}

/** A legenda das cores da barra. */
export function LegendaDasEtapas() {
  return (
    <p aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-ink-muted">
      {[
        ["Novos", "bg-ink/20"],
        ["Em análise", "bg-ink/45"],
        ["Em entrevista", "bg-ink/75"],
        ["Contratados", "bg-cerrado"],
      ].map(([nome, cor]) => (
        <span key={nome} className="inline-flex items-center gap-1.5">
          <span className={`size-3 rounded-[4px] ${cor}`} />
          {nome}
        </span>
      ))}
    </p>
  );
}

/** O ponto da situação: verde no ar, anel na pausada, apagado fora do ar. */
function Ponto({ v }: { v: VagaNaTela }) {
  const classe =
    v.estado === "ar" || v.estado === "preenchida"
      ? "bg-cerrado"
      : v.estado === "pausada"
        ? "border-2 border-line-strong bg-surface-200"
        : "bg-line";
  return <span aria-hidden className={`mt-1.5 size-2.5 shrink-0 rounded-pill ${classe}`} />;
}

function Titulo({ v, grande = false }: { v: VagaNaTela; grande?: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Link
        href={`/painel/anuncio/${v.id}/quadro`}
        className={`font-display font-bold underline-offset-2 hover:underline ${grande ? "text-h3" : "text-[17px] leading-[22px]"} ${
          v.estado === "fora" ? "text-ink-muted" : "text-ink"
        }`}
      >
        {v.titulo}
      </Link>
      {v.selo && <Selo variante={v.estado === "preenchida" ? "match" : "contorno"}>{v.selo}</Selo>}
    </span>
  );
}

function Acoes({ v, largo = false, inicio = false }: { v: VagaNaTela; largo?: boolean; inicio?: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${largo ? "w-full" : inicio ? "" : "ml-auto shrink-0"}`}>
      <div className={largo ? "min-w-0 flex-1" : ""}>
        <AcaoDaVaga id={v.id} acao={v.acao} largo={largo} />
      </div>
      <MenuDaVaga
        id={v.id}
        titulo={v.titulo}
        status={v.status}
        podeRenovar={v.podeRenovar}
        prazoDias={v.prazoDias}
        preenchida={Boolean(v.preenchidaEm)}
      />
    </div>
  );
}

// ------------------------------------------------------------------ A · Lista (grátis)

/** Uma vaga por linha: a vaga, a barra das etapas, o que ela pede agora e um botão só. */
export function ListaDeVagas({ vagas }: { vagas: VagaNaTela[] }) {
  return (
    <div className="flex flex-col gap-3">
      <LegendaDasEtapas />
      <section aria-label="Vagas" className="rounded-lg border border-line bg-surface-200 shadow-card">
        <div
          aria-hidden
          className="hidden gap-6 px-6 pt-3 pb-2 text-caption text-ink-muted md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(13rem,1fr)]"
        >
          <span className="pl-5">Vaga</span>
          <span>Candidatos por etapa</span>
          <span>Agora</span>
        </div>
        <ul className="divide-y divide-line md:border-t md:border-line">
          {vagas.map((v) => (
            <li
              key={v.id}
              className="flex flex-col gap-3 px-4 py-4 sm:px-6 md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(13rem,1fr)] md:items-start md:gap-6"
            >
              <div className="flex min-w-0 items-start gap-2.5">
                <Ponto v={v} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <Titulo v={v} />
                  <span className="text-body-sm text-ink-muted">{v.meta}</span>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-1.5 md:pt-1.5">
                <BarraDasEtapas v={v} alta />
                <ContagemDasEtapas v={v} />
              </div>
              <div className="flex min-w-0 flex-col gap-2.5">
                <div className="flex flex-col">
                  <span
                    className={`text-label ${v.alerta ? "text-terra-text" : v.estado === "fora" ? "text-ink-muted" : "text-ink"}`}
                  >
                    {v.agora}
                  </span>
                  <span className="text-body-sm text-ink-muted">{v.detalhe}</span>
                </div>
                <Acoes v={v} inicio />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ B · Pelo que pede você (grátis)

/** As vagas pelo que pedem: gente esperando, saindo do ar, paradas, preenchidas, andando sozinhas e fora do ar. */
export function VagasPorPrioridade({ vagas }: { vagas: VagaNaTela[] }) {
  const pedem = vagas.filter((v) => v.grupo !== "andam" && v.grupo !== "fora").length;
  const resto = vagas.length - pedem;
  const fora = vagas.filter((v) => v.grupo === "fora");
  return (
    <div className="flex flex-col gap-6">
      <p className="text-body">
        {pedem ? (
          <strong className="font-bold">
            {pedem === 1 ? "1 vaga pede você" : `${pedem} vagas pedem você`}
          </strong>
        ) : (
          <strong className="font-bold">Nenhuma vaga pede você agora</strong>
        )}
        {resto > 0 && <span className="text-ink-muted"> · {resto === 1 ? "1 anda sozinha" : `${resto} andam sozinhas`}</span>}
      </p>
      {GRUPOS.filter((g) => g !== "fora").map((g) => {
        const lista = vagas.filter((v) => v.grupo === g);
        if (!lista.length) return null;
        const urgente = g === "pedem";
        return (
          <section key={g} aria-labelledby={`grupo-${g}`} className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 id={`grupo-${g}`} className={`flex items-center gap-2.5 text-h3 ${g === "andam" ? "text-ink-muted" : ""}`}>
                <span
                  aria-hidden
                  className={`size-2.5 rounded-pill ${
                    urgente
                      ? "bg-terra"
                      : g === "vencem"
                        ? "bg-ipe"
                        : g === "preenchidas"
                          ? "bg-cerrado"
                          : g === "paradas"
                            ? "border-2 border-line-strong"
                            : "bg-line"
                  }`}
                />
                {GRUPO[g].nome}
                <span
                  className={`inline-flex min-w-6 items-center justify-center rounded-pill px-1.5 text-caption leading-6 ${
                    urgente ? "bg-terra-soft text-terra-text" : "bg-surface-300 text-ink"
                  }`}
                >
                  {lista.length}
                </span>
              </h3>
              <span className="text-body-sm text-ink-muted">{GRUPO[g].ajuda}</span>
            </div>
            <ul className="divide-y divide-line rounded-lg border border-line bg-surface-200 shadow-card">
              {lista.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
                  <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-0.5">
                    <Titulo v={v} />
                    <span className="text-body-sm text-ink-muted">{v.meta}</span>
                  </div>
                  <div className="flex min-w-0 flex-[2_1_14rem] flex-col gap-0.5">
                    <span className={`text-body font-bold ${v.alerta ? "text-terra-text" : "text-ink"}`}>{v.agora}</span>
                    <span className="text-body-sm text-ink-muted">{v.detalhe}</span>
                    {v.dica && (
                      <Link
                        href={v.dica.href}
                        className="mt-1 inline-flex items-center gap-1.5 self-start text-body-sm font-semibold text-terra-text underline-offset-2 hover:underline"
                      >
                        <Lightbulb aria-hidden className="size-4 shrink-0" />
                        {v.dica.texto}
                      </Link>
                    )}
                  </div>
                  <div className="flex w-full justify-end sm:w-auto">
                    <Acoes v={v} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {fora.length > 0 && (
        <details className="group rounded-lg border border-dashed border-line-strong">
          <summary className="flex min-h-13 cursor-pointer list-none items-center gap-2 px-4 py-3 text-label sm:px-6 [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden className="size-[18px] transition-transform group-open:rotate-90" />
            Fora do ar
            <span className="font-normal text-ink-muted">
              {fora.length === 1 ? `1 vaga · ${fora[0].titulo}` : `${fora.length} vagas`}
            </span>
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {fora.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
                <div className="flex min-w-0 flex-[1_1_14rem] flex-col gap-0.5">
                  <Titulo v={v} />
                  <span className="text-body-sm text-ink-muted">{v.meta}</span>
                </div>
                <div className="flex min-w-0 flex-[2_1_14rem] flex-col gap-0.5">
                  <span className="text-label text-ink-muted">{v.agora}</span>
                  <span className="text-body-sm text-ink-muted">{v.detalhe}</span>
                </div>
                <div className="flex w-full justify-end sm:w-auto">
                  <Acoes v={v} />
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ C · Mosaico (nos planos)

/** A linha de quantos chegaram por dia nos últimos 14 dias. */
function LinhaDosDias({ v }: { v: VagaNaTela }) {
  const max = Math.max(1, ...v.porDia);
  const pontos = v.porDia
    .map((d, i) => `${Math.round((i / (v.porDia.length - 1)) * 140)},${(34 - (d / max) * 30).toFixed(1)}`)
    .join(" ");
  return (
    <svg
      role="img"
      aria-label={`Candidatos por dia nos últimos 14 dias: ${v.porDia.join(", ")}`}
      viewBox="0 0 140 36"
      preserveAspectRatio="none"
      className={`h-10 w-full overflow-visible ${v.estado === "fora" || v.estado === "pausada" ? "text-line-strong" : "text-ink-muted"}`}
    >
      <polyline
        points={pontos}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function CartaoDoMosaico({ v }: { v: VagaNaTela }) {
  const apagada = v.estado === "fora" || v.estado === "pausada";
  const total = v.etapas.novos + v.etapas.analise + v.etapas.entrevista + v.etapas.contratados;
  return (
    <li
      className={`flex flex-col gap-3.5 rounded-lg border border-line p-5 ${apagada ? "bg-surface-100" : "bg-surface-200 shadow-card"}`}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Titulo v={v} grande />
          <span className="text-body-sm text-ink-muted">{v.meta}</span>
        </div>
        <MenuDaVaga
          id={v.id}
          titulo={v.titulo}
          status={v.status}
          podeRenovar={v.podeRenovar}
          prazoDias={v.prazoDias}
          preenchida={Boolean(v.preenchidaEm)}
        />
      </div>
      <div className="flex items-end gap-4">
        <div className="flex flex-col">
          <span className="font-display text-[40px] leading-10 font-extrabold tracking-tight tabular-nums">{total}</span>
          <span className="text-body-sm text-ink-muted">{total === 1 ? "candidato" : "candidatos"}</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <LinhaDosDias v={v} />
          <span
            className={`text-body-sm font-semibold ${
              v.novosNaSemana ? "text-cerrado-text" : v.grupo === "paradas" ? "text-terra-text" : "text-ink-muted"
            }`}
          >
            {v.novosNaSemana
              ? `+${v.novosNaSemana} nesta semana`
              : apagada
                ? v.agora
                : `Ninguém novo há ${v.diasSemNovo === 1 ? "1 dia" : `${v.diasSemNovo} dias`}`}
          </span>
        </div>
      </div>
      <ul aria-label="Etapas" className="grid grid-cols-4 gap-1.5">
        {ETAPAS.map((e) => {
          const n = v.etapas[e.chave];
          const espera = e.chave === "novos" && v.esperam > 0;
          return (
            <li key={e.chave} className={`flex flex-col rounded-md px-2.5 py-2 ${espera ? "bg-terra-soft" : "bg-surface-100"}`}>
              <span className={`text-[17px] leading-[22px] font-bold tabular-nums ${espera ? "text-terra-text" : n ? "text-ink" : "text-ink-muted"}`}>
                {e.chave === "contratados" ? `${n}/${v.quantas}` : n}
              </span>
              <span className="text-[12px] leading-4 text-ink-muted">
                {e.chave === "novos" ? "Novos" : e.chave === "analise" ? "Análise" : e.chave === "entrevista" ? "Entrevista" : "Contratados"}
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <span className={`min-w-0 flex-1 text-body-sm ${v.alerta ? "font-semibold text-terra-text" : "text-ink-muted"}`}>
          {v.acao.tipo === "responder" ? v.agora : v.detalhe || v.agora}
        </span>
        <AcaoDaVaga id={v.id} acao={v.acao} />
      </div>
    </li>
  );
}

/** Um cartão por vaga, com o total, a linha dos últimos 14 dias e as etapas. */
export function MosaicoDeVagas({ vagas }: { vagas: VagaNaTela[] }) {
  const noAr = vagas.filter((v) => v.estado === "ar" || v.estado === "preenchida");
  const resto = vagas.filter((v) => v.estado !== "ar" && v.estado !== "preenchida");
  return (
    <div className="flex flex-col gap-6">
      {[
        { nome: "No ar", lista: noAr },
        { nome: "Pausadas e fora do ar", lista: resto },
      ]
        .filter((g) => g.lista.length)
        .map((g) => (
          <section key={g.nome} aria-label={g.nome} className="flex flex-col gap-3">
            <h3 className={`text-h3 ${g.nome === "No ar" ? "" : "text-ink-muted"}`}>{g.nome}</h3>
            <ul className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {g.lista.map((v) => (
                <CartaoDoMosaico key={v.id} v={v} />
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

// ------------------------------------------------------------------ D · Linha do tempo (nos planos)

/** Cada vaga numa barra: de quando entrou até quando sai do ar, com hoje marcado, as entrevistas e as contratações. */
export function LinhaDoTempo({ vagas, agora }: { vagas: VagaNaTela[]; agora: number }) {
  // de até 10 semanas atrás (a vaga mais antiga) a 5 semanas na frente, começando numa segunda
  const maisAntiga = Math.min(agora - 21 * DIA, ...vagas.map((v) => new Date(v.criadoEm).getTime()));
  const inicioBruto = Math.max(maisAntiga, agora - 70 * DIA);
  const dataInicio = new Date(inicioBruto);
  const semana = (dataInicio.getUTCDay() + 6) % 7;
  const ini = Date.UTC(dataInicio.getUTCFullYear(), dataInicio.getUTCMonth(), dataInicio.getUTCDate() - semana, 3);
  const fim = Math.max(agora + 35 * DIA, ini + 56 * DIA);
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - ini) / (fim - ini)) * 100));
  const semanas: number[] = [];
  for (let t = ini; t <= fim; t += 7 * DIA) semanas.push(t);
  const hoje = pct(agora);
  const t = (iso: string) => new Date(iso).getTime();

  return (
    <div className="flex flex-col gap-3">
      <p aria-hidden className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-pill bg-ink/45" />
          No ar até hoje
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-pill bg-line" />
          Falta até sair do ar
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-5 rounded-pill border-2 border-dashed border-line-strong" />
          Pausada
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-pill border-2 border-ink bg-surface-200" />
          Entrevista
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-pill bg-cerrado" />
          Contratou ou preencheu
        </span>
      </p>
      <section aria-label="Vagas na linha do tempo" className="overflow-x-auto rounded-lg border border-line bg-surface-200 shadow-card">
        <div className="min-w-[46rem]">
          <div className="flex border-b border-line">
            <div className="w-56 shrink-0 px-5 pt-3.5 pb-2.5 text-caption text-ink-muted">Vaga</div>
            <div aria-hidden className="relative mr-6 h-11 flex-1">
              {semanas.filter((s) => Math.abs(pct(s) - hoje) > 5).map((s) => (
                <span key={s} className="absolute top-3.5 -translate-x-1/2 text-[12px] leading-4 whitespace-nowrap text-ink-muted" style={{ left: `${pct(s)}%` }}>
                  {ddmm(s)}
                </span>
              ))}
              <span
                className="absolute top-1 -translate-x-1/2 rounded-pill bg-ink px-2 py-0.5 text-[12px] leading-4 font-bold whitespace-nowrap text-surface-100"
                style={{ left: `${hoje}%` }}
              >
                Hoje, {ddmm(agora)}
              </span>
            </div>
          </div>
          <ul className="divide-y divide-surface-300">
            {vagas.map((v) => {
              const criado = t(v.criadoEm);
              const barras: { de: number; ate: number; jeito: "passado" | "futuro" | "pausa" | "fora" }[] = [];
              let fimRotulo = "";
              let fimEm = agora;
              let fimAlerta = false;
              if (v.estado === "ar" || v.estado === "preenchida") {
                const ate = v.semPrazo ? fim : t(v.expiraEm);
                barras.push({ de: criado, ate: agora, jeito: "passado" }, { de: agora, ate, jeito: "futuro" });
                fimRotulo = v.semPrazo ? "sem prazo" : `vence ${ddmm(v.expiraEm)}`;
                fimEm = v.semPrazo ? fim - 3 * DIA : ate;
                fimAlerta = v.venceEm !== null && v.venceEm <= 5;
              } else if (v.estado === "pausada") {
                const pausou = Math.max(criado, t(v.mudouEm));
                barras.push({ de: criado, ate: pausou, jeito: "passado" }, { de: pausou, ate: agora, jeito: "pausa" });
                fimRotulo = "pausada";
                fimEm = agora;
              } else {
                const saiu = v.status === "expirado" ? t(v.expiraEm) : t(v.mudouEm);
                barras.push({ de: criado, ate: Math.max(criado + DIA / 2, saiu), jeito: "fora" });
                fimRotulo = `${v.status === "expirado" ? "saiu" : "encerrada"} ${ddmm(saiu)}`;
                fimEm = saiu;
              }
              const marcas = [
                ...v.entrevistas.map((e) => ({ em: t(e.quando), rotulo: `Entrevista em ${ddmm(e.quando)}`, certo: false })),
                ...v.contratacoes.map((c) => ({ em: t(c), rotulo: `Contratou em ${ddmm(c)}`, certo: true })),
                ...(v.preenchidaEm ? [{ em: t(v.preenchidaEm), rotulo: `Marcada como preenchida em ${ddmm(v.preenchidaEm)}`, certo: true }] : []),
              ].filter((m) => m.em >= ini && m.em <= fim);
              return (
                <li key={v.id} className="flex">
                  <div className="flex w-56 shrink-0 flex-col justify-center gap-0.5 px-5 py-3">
                    <Link
                      href={`/painel/anuncio/${v.id}/quadro`}
                      className={`font-display text-body font-bold underline-offset-2 hover:underline ${v.estado === "fora" ? "text-ink-muted" : "text-ink"}`}
                    >
                      {v.titulo}
                    </Link>
                    <span className={`text-body-sm ${v.alerta ? "font-semibold text-terra-text" : "text-ink-muted"}`}>{v.agora}</span>
                  </div>
                  <div className="relative mr-6 h-16 flex-1">
                    <span className="sr-only">
                      Entrou em {ddmm(v.criadoEm)}. {fimRotulo}.{" "}
                      {marcas.length ? marcas.map((m) => m.rotulo).join(". ") : "Sem entrevistas marcadas"}.
                    </span>
                    {semanas.map((s) => (
                      <span key={s} aria-hidden className="absolute inset-y-0 w-px bg-surface-300" style={{ left: `${pct(s)}%` }} />
                    ))}
                    <span aria-hidden className="absolute inset-y-0 -ml-px w-0.5 bg-ink" style={{ left: `${hoje}%` }} />
                    {barras.map((b, i) => (
                      <span
                        key={i}
                        aria-hidden
                        className={`absolute top-[26px] box-border h-3 rounded-pill ${
                          b.jeito === "passado" ? "bg-ink/45" : b.jeito === "futuro" ? "bg-line" : b.jeito === "pausa" ? "border-2 border-dashed border-line-strong" : "bg-line"
                        }`}
                        style={{ left: `${pct(b.de)}%`, width: `${Math.max(0.6, pct(b.ate) - pct(b.de))}%` }}
                      />
                    ))}
                    {marcas.map((m, i) => (
                      <span
                        key={i}
                        aria-hidden
                        title={m.rotulo}
                        className={`absolute top-6 -ml-2 box-border size-4 rounded-pill border-2 ${m.certo ? "border-surface-200 bg-cerrado" : "border-ink bg-surface-200"}`}
                        style={{ left: `${pct(m.em)}%` }}
                      />
                    ))}
                    <span
                      aria-hidden
                      className={`absolute top-1 -translate-x-1/2 text-[12px] leading-4 font-bold whitespace-nowrap ${fimAlerta ? "text-terra-text" : "text-ink-muted"}`}
                      style={{ left: `${pct(fimEm)}%` }}
                    >
                      {fimRotulo}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ a prévia das visões pagas

/**
 * O Mosaico e a Linha do tempo sem plano: a visão com as vagas da própria conta, esmaecida, e o quadro dos 15 dias
 * grátis (uma vez por conta) e dos planos. Liberada: a visão inteira; nos dias grátis, até quando valem.
 */
export function PreviaPaga({
  nome,
  artigo = "o",
  texto,
  acesso,
  children,
}: {
  nome: string;
  /** "o Mosaico", "a Linha do tempo" */
  artigo?: "o" | "a";
  texto: string;
  acesso: AcessoAsVisoes;
  children: ReactNode;
}) {
  if (acesso.liberado) {
    return (
      <div className="flex flex-col gap-3">
        {acesso.ate && !acesso.plano && (
          <p className="text-body-sm text-ink-muted">
            Grátis até {dataCurta(acesso.ate)}. Depois, o Mosaico e a Linha do tempo vêm nos{" "}
            <Link href="/painel/planos" className="font-semibold text-ink underline underline-offset-2">
              planos
            </Link>
            .
          </p>
        )}
        {children}
      </div>
    );
  }
  return (
    <div className="relative min-h-[26rem]">
      <div
        aria-hidden
        inert
        className="pointer-events-none max-h-[30rem] overflow-hidden select-none [mask-image:linear-gradient(to_bottom,black_35%,transparent_95%)]"
      >
        {children}
      </div>
      <div className="absolute inset-x-0 bottom-0 flex justify-center px-2 pb-4 sm:pb-8">
        <div className="flex w-full max-w-lg flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-5 shadow-raised sm:p-6">
          <Selo variante="aviso" className="self-start">
            Nos planos
          </Selo>
          <h3 className="text-h3">{nome}, com as suas vagas</h3>
          <p className="text-body-sm text-ink-muted">{texto}</p>
          {acesso.testou ? (
            <p className="text-body-sm">Os seus 15 dias grátis já acabaram. {artigo === "a" ? "A" : "O"} {nome} continua em todos os planos.</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            {!acesso.testou && <BotaoTestarVisoes />}
            <Link href="/painel/planos" className="text-label text-ink underline underline-offset-2">
              Ver os planos
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
