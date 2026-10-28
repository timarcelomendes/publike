import { Check, ChevronDown, CircleHelp, ExternalLink, MessageCircleQuestion, X } from "lucide-react";
import Link from "next/link";
import type { CriterioCopiloto, LeituraCopiloto, ResultadoCriterio } from "@/lib/copiloto";
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

/** Uma pessoa lida pelo copiloto: cada critério com o trecho do currículo que prova, e o que perguntar. */
export function CartaoDoCopiloto({
  anuncioId,
  pessoa,
  criterios,
  leitura,
  antiga,
  numeros,
  agora,
  vagaNoAr,
}: {
  anuncioId: string;
  pessoa: PessoaDoCopiloto;
  criterios: CriterioCopiloto[];
  leitura: LeituraCopiloto;
  /** os critérios ou o currículo mudaram depois da leitura */
  antiga: boolean;
  numeros: { atende: number; obrigatorios: number; obrigatoriosOk: boolean };
  agora: number;
  vagaNoAr: boolean;
}) {
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
    <li className="rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5">
      <div className="flex gap-3">
        <Avatar nome={pessoa.nome} foto={pessoa.foto} tamanho={48} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-label">{pessoa.nome}</span>
            {cv?.titulo && <span className="text-body-sm text-ink-muted">· {cv.titulo}</span>}
            {numeros.obrigatoriosOk ? (
              <Selo variante="match">
                Atende {numeros.obrigatorios === 1 ? "o obrigatório" : `os ${numeros.obrigatorios} obrigatórios`}
              </Selo>
            ) : (
              <Selo variante="contorno">
                Atende {numeros.atende} de {criterios.length}
              </Selo>
            )}
          </p>
          <p className="text-body-sm text-ink-muted">
            {formatarLugar(pessoa.bairro, pessoa.cidade)}
            {cv && ` · currículo atualizado ${tempoRelativo(cv.atualizado_em, agora)}`}
          </p>
          {leitura.resumo && <p className="mt-1 text-body-sm">{leitura.resumo}</p>}
        </div>
        {acao && <div className="hidden shrink-0 sm:block">{acao}</div>}
      </div>

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

      {acao && <div className="mt-3 sm:hidden">{acao}</div>}

      {cv && (
        <details className="group mt-3 border-t border-line pt-2">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-label text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
            Ver currículo
            <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
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
    </li>
  );
}
