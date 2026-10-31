import { Check, ChevronDown, CircleHelp, ExternalLink, MessageCircleQuestion, X } from "lucide-react";
import Link from "next/link";
import {
  textoCurto,
  type CriterioCopiloto,
  type LeituraCopiloto,
  type NumerosDaLeitura,
  type ResultadoCriterio,
} from "@/lib/copiloto";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import type { PessoaDoCopiloto } from "@/lib/servidor/copiloto";
import { CurriculoResumo } from "../curriculo-resumo";
import { BotaoConvidar } from "../painel/botao-convidar";
import { Avatar, Selo } from "../ui/basicos";

const RESULTADOS: Record<ResultadoCriterio, { nome: string; icone: typeof Check; cor: string; marca: string }> = {
  atende: { nome: "Atende", icone: Check, cor: "text-cerrado-text", marca: "bg-cerrado text-on-cerrado" },
  sem_info: { nome: "Conferir", icone: CircleHelp, cor: "text-terra-text", marca: "bg-terra-soft text-terra-text" },
  nao_atende: {
    nome: "Não atende",
    icone: X,
    cor: "text-ink-muted",
    marca: "border border-line-strong text-ink-muted",
  },
};

type Props = {
  anuncioId: string;
  pessoa: PessoaDoCopiloto;
  criterios: CriterioCopiloto[];
  leitura: LeituraCopiloto;
  /** os critérios ou o currículo mudaram depois da leitura */
  antiga: boolean;
  numeros: NumerosDaLeitura;
  agora: number;
  vagaNoAr: boolean;
  /** a posição no ranking (1, 2, 3…) */
  posicao: number;
  /** começa aberto (os que valem olhar primeiro, pela prioridade e pela nota) */
  aberto?: boolean;
};

/** Os critérios na ordem da tira: os obrigatórios primeiro. */
function naOrdem(criterios: CriterioCopiloto[]) {
  return [...criterios.filter((c) => c.obrigatorio), ...criterios.filter((c) => !c.obrigatorio)];
}

/** Se candidatou (curtiu a vaga) ou está em Talentos (dá para convidar). */
function SeloDaOrigem({ origem }: { origem: PessoaDoCopiloto["origem"] }) {
  return origem === "candidato" ? (
    <Selo variante="like">Se candidatou</Selo>
  ) : (
    <Selo variante="contorno">Em Talentos</Selo>
  );
}

/**
 * A tira dos critérios: uma marca por critério (atende, conferir, não atende), os obrigatórios primeiro e
 * separados dos outros. Dá para comparar as pessoas de olho, sem abrir ninguém.
 */
export function TiraDosCriterios({ criterios, leitura }: { criterios: CriterioCopiloto[]; leitura: LeituraCopiloto }) {
  const de = new Map(leitura.criterios.map((c) => [c.id, c.resultado]));
  const lista = naOrdem(criterios);
  const obrigatorios = lista.filter((c) => c.obrigatorio).length;
  return (
    <span aria-hidden className="inline-flex items-center gap-1">
      {lista.map((c, i) => {
        const r = RESULTADOS[de.get(c.id) ?? "sem_info"];
        const Icone = r.icone;
        return (
          <span key={c.id} className="inline-flex items-center gap-1">
            {i === obrigatorios && i > 0 && <span className="mx-0.5 h-4 w-px bg-line-strong" />}
            <span
              title={`${r.nome}: ${c.texto}${c.obrigatorio ? " (obrigatório)" : ""}`}
              className={`inline-flex size-5 items-center justify-center rounded-pill ${r.marca}`}
            >
              <Icone className="size-3" strokeWidth={3} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** O porquê da posição, numa linha curta: o resumo de quem atende, o obrigatório que falta ou que é para conferir. */
function porqueCurto(n: NumerosDaLeitura, resumo: string) {
  const mais = (l: string[]) => (l.length > 1 ? ` e mais ${l.length - 1}` : "");
  if (n.faltam.length) return `Falta: ${textoCurto(n.faltam[0])}${mais(n.faltam)}`;
  if (n.aConferir.length) return `Conferir: ${textoCurto(n.aConferir[0])}${mais(n.aConferir)}`;
  return resumo;
}

function Nota({ valor }: { valor: number }) {
  return (
    <span className="flex shrink-0 flex-col items-end leading-none" title="A nota da triagem (0 a 100)">
      <span className="font-display text-h3 tabular-nums">{valor}</span>
      <span className="mt-1 text-caption font-normal text-ink-muted">nota</span>
    </span>
  );
}

/** Um bloco de critérios com o mesmo resultado ("Atende", "Conferir na entrevista", "Não atende"). */
function BlocoDeCriterios({
  titulo,
  resultado,
  itens,
}: {
  titulo: string;
  resultado: ResultadoCriterio;
  itens: { c: CriterioCopiloto; trecho: string; explicacao: string }[];
}) {
  if (!itens.length) return null;
  const r = RESULTADOS[resultado];
  const Icone = r.icone;
  return (
    <div>
      <p className={`flex items-center gap-1.5 text-label ${r.cor}`}>
        <Icone aria-hidden className="size-[18px]" />
        {titulo} ({itens.length})
      </p>
      <ul className="mt-1.5 flex flex-col gap-2 pl-6">
        {itens.map(({ c, trecho, explicacao }) => (
          <li key={c.id} className="text-body-sm">
            <p>
              {c.texto}
              {c.obrigatorio && <span className="text-ink-muted"> (obrigatório)</span>}
            </p>
            {trecho && (
              <blockquote
                className={`mt-1 rounded-sm border-l-[3px] bg-surface-300 px-2.5 py-1.5 ${
                  resultado === "atende" ? "border-cerrado" : "border-line-strong"
                }`}
              >
                “{trecho}”
              </blockquote>
            )}
            {explicacao && <p className="mt-0.5 text-ink-muted">{explicacao}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Aberto: o resumo, os critérios por resultado (com o trecho que prova), o que perguntar, a ação e o currículo. */
function Detalhes({ anuncioId, pessoa, criterios, leitura, antiga, agora, vagaNoAr }: Props) {
  const de = new Map(leitura.criterios.map((c) => [c.id, c]));
  const cv = pessoa.curriculo;
  const com = (r: ResultadoCriterio) =>
    naOrdem(criterios)
      .filter((c) => (de.get(c.id)?.resultado ?? "sem_info") === r)
      .map((c) => ({ c, trecho: de.get(c.id)?.trecho ?? "", explicacao: de.get(c.id)?.explicacao ?? "" }));
  const acao =
    pessoa.origem === "talento" ? (
      vagaNoAr ? (
        <BotaoConvidar anuncioId={anuncioId} perfilId={pessoa.perfil_id} convidado={pessoa.convidado} copiloto />
      ) : null
    ) : (
      <Link
        href={`/painel/anuncio/${anuncioId}/quadro?candidato=${pessoa.perfil_id}`}
        className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-200 px-3.5 text-label hover:bg-surface-300"
      >
        <ExternalLink aria-hidden className="size-[18px]" />
        Abrir no quadro
      </Link>
    );
  return (
    <div className="flex flex-col gap-3 pb-4 sm:pl-23">
      <p className="flex flex-wrap items-center gap-1.5">
        {/* "Se candidatou" já está na linha de cima */}
        {pessoa.origem === "talento" && <SeloDaOrigem origem="talento" />}
        <span className="text-body-sm text-ink-muted">
          {formatarLugar(pessoa.bairro, pessoa.cidade)}
          {cv && ` · currículo atualizado ${tempoRelativo(cv.atualizado_em, agora)}`}
        </span>
      </p>
      {antiga && <p className="text-body-sm text-terra-text">Os critérios ou o currículo mudaram: leia de novo.</p>}
      {leitura.resumo && <p className="text-body-sm">{leitura.resumo}</p>}

      <div
        className="flex flex-col gap-3 border-t border-line pt-3"
        role="group"
        aria-label={`Critérios para ${pessoa.nome}`}
      >
        <BlocoDeCriterios titulo="Atende" resultado="atende" itens={com("atende")} />
        <BlocoDeCriterios titulo="Conferir na entrevista" resultado="sem_info" itens={com("sem_info")} />
        <BlocoDeCriterios titulo="Não atende" resultado="nao_atende" itens={com("nao_atende")} />
      </div>

      {leitura.perguntas.length > 0 && (
        <div className="rounded-md bg-surface-300 p-3">
          <p className="flex items-center gap-2 text-label">
            <MessageCircleQuestion aria-hidden className="size-[18px] text-ink-muted" />O que perguntar
          </p>
          <ul className="mt-1 list-disc pl-6 text-body-sm">
            {leitura.perguntas.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}

      {acao && <div>{acao}</div>}

      {cv && (
        <details className="group/cv border-t border-line pt-2">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-label text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            Ver currículo
            <ChevronDown aria-hidden className="size-4 transition-transform group-open/cv:rotate-180" />
          </summary>
          <div className="mt-2">
            <CurriculoResumo
              curriculo={{ ...cv, arquivo: null }}
              linkPdf={null}
              hoje={new Date(agora).toISOString().slice(0, 7)}
            />
          </div>
        </details>
      )}
    </div>
  );
}

/**
 * Uma pessoa no ranking: fechada, uma linha com a posição, o nome, a tira dos critérios, o porquê curto e a
 * nota; tocar abre o resto. Os que valem olhar primeiro já começam abertos (`aberto`).
 */
export function CandidatoDoRanking(props: Props) {
  const { pessoa, criterios, leitura, numeros, posicao, aberto = false, antiga } = props;
  const cv = pessoa.curriculo;
  const porque = porqueCurto(numeros, leitura.resumo);
  return (
    <li className="border-t border-line first:border-t-0">
      <details className="group" open={aberto}>
        <summary className="flex min-h-16 cursor-pointer list-none items-start gap-3 py-3 [&::-webkit-details-marker]:hidden">
          <span
            aria-label={`${posicao}º lugar`}
            className="w-8 shrink-0 pt-1.5 font-display text-label tabular-nums text-ink-muted"
          >
            {posicao}º
          </span>
          <Avatar nome={pessoa.nome} foto={pessoa.foto} tamanho={36} />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-label">{pessoa.nome}</span>
              {cv?.titulo && <span className="max-w-full truncate text-body-sm text-ink-muted">{cv.titulo}</span>}
              {pessoa.origem === "candidato" && <SeloDaOrigem origem="candidato" />}
              {antiga && <span className="text-body-sm text-terra-text">leitura antiga</span>}
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <TiraDosCriterios criterios={criterios} leitura={leitura} />
              <span className="text-body-sm text-ink-muted">
                Atende {numeros.atende} de {criterios.length}
              </span>
            </span>
            {porque && <span className="line-clamp-1 text-body-sm text-ink-muted group-open:hidden">{porque}</span>}
          </span>
          <Nota valor={numeros.nota} />
          <ChevronDown
            aria-hidden
            className="mt-1.5 size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
          />
        </summary>
        <Detalhes {...props} />
      </details>
    </li>
  );
}

/** A legenda da tira, uma vez no alto do ranking. */
export function LegendaDaTira() {
  const item = (r: ResultadoCriterio) => {
    const x = RESULTADOS[r];
    const Icone = x.icone;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className={`inline-flex size-5 items-center justify-center rounded-pill ${x.marca}`}>
          <Icone className="size-3" strokeWidth={3} />
        </span>
        {x.nome.toLowerCase()}
      </span>
    );
  };
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-muted">
      {item("atende")}
      {item("sem_info")}
      {item("nao_atende")}
      <span>Na tira de cada pessoa, os obrigatórios vêm primeiro.</span>
    </p>
  );
}
