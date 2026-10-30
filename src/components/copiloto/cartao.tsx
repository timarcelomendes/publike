import { Check, ChevronDown, CircleHelp, ExternalLink, MessageCircleQuestion, X } from "lucide-react";
import Link from "next/link";
import type { CriterioCopiloto, LeituraCopiloto, NumerosDaLeitura, ResultadoCriterio } from "@/lib/copiloto";
import { formatarLugar, tempoRelativo } from "@/lib/formato";
import type { PessoaDoCopiloto } from "@/lib/servidor/copiloto";
import { CurriculoResumo } from "../curriculo-resumo";
import { BotaoConvidar } from "../painel/botao-convidar";
import { Avatar, Selo } from "../ui/basicos";

const RESULTADOS: Record<ResultadoCriterio, { nome: string; icone: typeof Check; cor: string }> = {
  atende: { nome: "Atende", icone: Check, cor: "text-cerrado-text" },
  nao_atende: { nome: "Não atende", icone: X, cor: "text-ink-muted" },
  sem_info: { nome: "Conferir", icone: CircleHelp, cor: "text-terra-text" },
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
};

/** Se candidatou (curtiu a vaga) ou está em Talentos (dá para convidar). */
function SeloDaOrigem({ origem }: { origem: PessoaDoCopiloto["origem"] }) {
  return origem === "candidato" ? (
    <Selo variante="like">Se candidatou</Selo>
  ) : (
    <Selo variante="contorno">Em Talentos</Selo>
  );
}

/** O que o ranking diz dos obrigatórios. */
function SeloDosObrigatorios({ n, total }: { n: NumerosDaLeitura; total: number }) {
  if (n.obrigatoriosOk) {
    return (
      <Selo variante="match">
        Atende {n.obrigatorios === 1 ? "o obrigatório" : `os ${n.obrigatorios} obrigatórios`}
      </Selo>
    );
  }
  if (n.grupo === 2) return <Selo variante="contorno">Falta obrigatório</Selo>;
  if (n.grupo === 1) return <Selo variante="aviso">Conferir obrigatório</Selo>;
  return (
    <Selo variante="contorno">
      Atende {n.atende} de {total}
    </Selo>
  );
}

/** "Atende 4 de 6 · falta: Scrum ou Kanban": o porquê da posição, numa linha. */
function porqueDaPosicao(n: NumerosDaLeitura, total: number) {
  const partes = [`Atende ${n.atende} de ${total}`];
  if (n.faltam.length) partes.push(`não atende: ${n.faltam.join("; ")}`);
  else if (n.aConferir.length) partes.push(`conferir: ${n.aConferir.join("; ")}`);
  return partes.join(" · ");
}

function Nota({ valor, grande = false }: { valor: number; grande?: boolean }) {
  return (
    <span className="flex shrink-0 flex-col items-end leading-none" title="A nota da triagem (0 a 100)">
      <span className={`font-display tabular-nums ${grande ? "text-h2" : "text-h3"}`}>{valor}</span>
      <span className="mt-1 text-caption font-normal text-ink-muted">nota</span>
    </span>
  );
}

/** Os critérios com o trecho que prova, o que perguntar, a ação e o currículo. */
function Detalhes({
  anuncioId,
  pessoa,
  criterios,
  leitura,
  antiga,
  agora,
  vagaNoAr,
}: Omit<Props, "numeros" | "posicao">) {
  const de = new Map(leitura.criterios.map((c) => [c.id, c]));
  const cv = pessoa.curriculo;
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
    <>
      {antiga && (
        <p className="mt-3 text-body-sm text-terra-text">Os critérios ou o currículo mudaram: leia de novo.</p>
      )}

      <ul className="mt-3 flex flex-col gap-2.5 border-t border-line pt-3" aria-label={`Critérios para ${pessoa.nome}`}>
        {criterios.map((c) => {
          const l = de.get(c.id);
          const r = RESULTADOS[l?.resultado ?? "sem_info"];
          const Icone = r.icone;
          return (
            <li key={c.id} className="flex gap-2.5">
              <Icone aria-hidden className={`mt-0.5 size-[18px] shrink-0 ${r.cor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-body-sm">
                  <span className={`font-semibold ${r.cor}`}>{r.nome}:</span> {c.texto}
                  {c.obrigatorio && <span className="text-ink-muted"> (obrigatório)</span>}
                </p>
                {l?.trecho ? (
                  <blockquote className="mt-1 rounded-sm border-l-[3px] border-cerrado bg-surface-300 px-2.5 py-1.5 text-body-sm">
                    “{l.trecho}”
                  </blockquote>
                ) : null}
                {l?.explicacao && <p className="mt-0.5 text-body-sm text-ink-muted">{l.explicacao}</p>}
              </div>
            </li>
          );
        })}
      </ul>

      {leitura.perguntas.length > 0 && (
        <div className="mt-3 rounded-md bg-surface-300 p-3">
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

      {acao && <div className="mt-3">{acao}</div>}

      {cv && (
        <details className="group/cv mt-3 border-t border-line pt-2">
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
    </>
  );
}

/** Os primeiros do ranking: o cartão inteiro, com a posição, a nota e cada critério com o trecho que prova. */
export function CartaoDoCopiloto(props: Props) {
  const { pessoa, criterios, leitura, numeros, agora, posicao } = props;
  const cv = pessoa.curriculo;
  return (
    <li className="rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5">
      <div className="flex gap-3">
        <span aria-label={`${posicao}º lugar`} className="w-8 shrink-0 pt-2 font-display text-h3 tabular-nums">
          {posicao}º
        </span>
        <Avatar nome={pessoa.nome} foto={pessoa.foto} tamanho={48} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-label">{pessoa.nome}</span>
            {cv?.titulo && <span className="text-body-sm text-ink-muted">{cv.titulo}</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5">
            <SeloDaOrigem origem={pessoa.origem} />
            <SeloDosObrigatorios n={numeros} total={criterios.length} />
          </p>
          <p className="mt-1 text-body-sm text-ink-muted">
            {formatarLugar(pessoa.bairro, pessoa.cidade)}
            {cv && ` · currículo atualizado ${tempoRelativo(cv.atualizado_em, agora)}`}
          </p>
          {leitura.resumo && <p className="mt-1 text-body-sm">{leitura.resumo}</p>}
          {!numeros.obrigatoriosOk && (numeros.faltam.length > 0 || numeros.aConferir.length > 0) && (
            <p className="mt-1 text-body-sm text-ink-muted">{porqueDaPosicao(numeros, criterios.length)}</p>
          )}
        </div>
        <Nota valor={numeros.nota} grande />
      </div>
      <Detalhes {...props} />
    </li>
  );
}

/** Do 4º em diante: uma linha com a posição, a nota e o porquê; tocar abre o mesmo que o cartão. */
export function LinhaDoRanking(props: Props) {
  const { pessoa, criterios, numeros, posicao } = props;
  const cv = pessoa.curriculo;
  return (
    <li className="border-t border-line first:border-t-0">
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 py-2.5 [&::-webkit-details-marker]:hidden">
          <span aria-label={`${posicao}º lugar`} className="w-8 shrink-0 text-label tabular-nums text-ink-muted">
            {posicao}º
          </span>
          <Avatar nome={pessoa.nome} foto={pessoa.foto} tamanho={32} />
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-label">{pessoa.nome}</span>
              {cv?.titulo && <span className="truncate text-body-sm text-ink-muted">{cv.titulo}</span>}
              {pessoa.origem === "candidato" && <SeloDaOrigem origem="candidato" />}
            </span>
            <span className="line-clamp-2 text-body-sm text-ink-muted">
              {porqueDaPosicao(numeros, criterios.length)}
            </span>
          </span>
          <Nota valor={numeros.nota} />
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="pb-4 pl-11">
          <p className="flex flex-wrap items-center gap-1.5">
            <SeloDaOrigem origem={pessoa.origem} />
            <SeloDosObrigatorios n={numeros} total={criterios.length} />
          </p>
          {props.leitura.resumo && <p className="mt-2 text-body-sm">{props.leitura.resumo}</p>}
          <Detalhes {...props} />
        </div>
      </details>
    </li>
  );
}
