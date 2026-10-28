"use client";

import { ArrowLeft, ArrowRight, Check, ClipboardCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { aceitarTeste, enviarTeste } from "@/lib/acoes/testes";
import { competenciasDoResultado, faixaDoResultado, NAO_E_PSICOLOGICO } from "@/lib/testes";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";

export type TesteParaFazer = {
  id: string;
  status: string;
  vencida: boolean;
  prazo: string;
  aceite_em: string | null;
  anuncio_id: string;
  vaga: string;
  empresa: string;
  tipo: string;
  titulo: string;
  descricao: string | null;
  pontos: number | null;
  maximo: number | null;
  por_competencia: unknown;
  questoes: { id: string; enunciado: string; opcoes: { id: string; texto: string }[] }[];
};

function ResultadoDoTeste({
  tipo,
  pontos,
  maximo,
  porCompetencia,
  anuncioId,
}: {
  tipo: string;
  pontos: number;
  maximo: number;
  porCompetencia: unknown;
  anuncioId: string;
}) {
  const competencias = competenciasDoResultado(porCompetencia);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface-200 p-5 text-center">
        <Check aria-hidden className="mx-auto size-8 text-cerrado-text" />
        <p className="mt-2 text-h3">Teste enviado</p>
        {tipo === "pratico" ? (
          <p className="mt-1 text-body">
            Você acertou <strong>{pontos}</strong> de {maximo}.
          </p>
        ) : (
          <p className="mt-1 text-body">Veja como foi em cada parte:</p>
        )}
      </div>
      {competencias.length > 0 && (
        <ul className="flex flex-col gap-2">
          {competencias.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 rounded-md bg-surface-300 px-4 py-2.5">
              <span className="text-label">{c.nome}</span>
              <span className="text-body-sm text-ink-muted">{faixaDoResultado(c.pontos, c.maximo)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-body-sm text-ink-muted">
        O resultado vai para quem publicou a vaga, junto com a sua candidatura. Ninguém é recusado só pelo teste.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/anuncio/${anuncioId}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-line-strong bg-surface-200 px-5 text-label hover:bg-surface-300"
        >
          Voltar para a vaga
        </Link>
        <Link href="/testes" className="inline-flex min-h-11 items-center px-3 text-label text-ink-muted underline">
          Meus testes
        </Link>
      </div>
    </div>
  );
}

/** O teste no celular: as condições, uma questão por tela e o resultado no fim. */
export function FazerTeste({ teste }: { teste: TesteParaFazer }) {
  const [aceito, setAceito] = useState(Boolean(teste.aceite_em));
  const [atual, setAtual] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<{ pontos: number; maximo: number; por_competencia: unknown } | null>(
    teste.status === "feita" && teste.pontos != null && teste.maximo != null
      ? { pontos: teste.pontos, maximo: teste.maximo, por_competencia: teste.por_competencia }
      : null,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  if (resultado) {
    return (
      <ResultadoDoTeste
        tipo={teste.tipo}
        pontos={resultado.pontos}
        maximo={resultado.maximo}
        porCompetencia={resultado.por_competencia}
        anuncioId={teste.anuncio_id}
      />
    );
  }
  if (teste.vencida) {
    return (
      <Aviso tipo="alerta" titulo="O prazo deste teste acabou">
        Se ainda tiver interesse na vaga, fale com quem publicou pelas mensagens.
      </Aviso>
    );
  }

  if (!aceito) {
    const prazo = new Date(teste.prazo).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-line bg-surface-200 p-5">
          <p className="flex items-center gap-2 text-label">
            <ClipboardCheck aria-hidden className="size-5 text-ink-muted" />
            {teste.questoes.length} questões · cerca de {Math.max(3, Math.round(teste.questoes.length * 0.7))} minutos
          </p>
          {teste.descricao && <p className="mt-2 text-body-sm text-ink-muted">{teste.descricao}</p>}
          <ul className="mt-4 flex flex-col gap-2 text-body-sm">
            <li>
              • Para que serve: ajudar {teste.empresa} a conhecer você para a vaga “{teste.vaga}”.
            </li>
            <li>• Quem vê: só quem publicou a vaga, e você, no fim.</li>
            <li>• Por quanto tempo: o resultado é apagado 12 meses depois que a vaga sai do ar.</li>
            <li>• Uma tentativa só. Dá para voltar e trocar a resposta antes de enviar. Prazo: até {prazo}.</li>
          </ul>
          <p className="mt-4 flex gap-2 rounded-md bg-surface-300 p-3 text-body-sm">
            <ShieldCheck aria-hidden className="mt-0.5 size-[18px] shrink-0 text-cerrado-text" />
            {NAO_E_PSICOLOGICO}
          </p>
        </div>
        {erro && <p className="text-body-sm text-danger">{erro}</p>}
        <Botao
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const r = await chamarAcao(() => aceitarTeste(teste.id));
              if (r.ok) setAceito(true);
              else setErro(r.erro);
            })
          }
        >
          Aceito e quero começar
        </Botao>
      </div>
    );
  }

  const q = teste.questoes[atual];
  const ultima = atual === teste.questoes.length - 1;
  const respondidas = Object.keys(respostas).length;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between text-body-sm text-ink-muted">
          <span>
            Questão {atual + 1} de {teste.questoes.length}
          </span>
          <span>{respondidas} respondidas</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-300" aria-hidden>
          <div
            className="h-full rounded-pill bg-cerrado transition-[width]"
            style={{ width: `${(100 * (atual + 1)) / teste.questoes.length}%` }}
          />
        </div>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-3 text-h3">{q.enunciado}</legend>
        {q.opcoes.map((o) => {
          const marcada = respostas[q.id] === o.id;
          return (
            <label
              key={o.id}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-md border px-4 py-3 text-body ${
                marcada ? "border-ink bg-surface-300" : "border-line-strong bg-surface-200 hover:bg-surface-300"
              }`}
            >
              <input
                type="radio"
                name={`questao-${q.id}`}
                value={o.id}
                checked={marcada}
                onChange={() => setRespostas((r) => ({ ...r, [q.id]: o.id }))}
                className="size-5 shrink-0 accent-[var(--pk-ink)]"
              />
              {o.texto}
            </label>
          );
        })}
      </fieldset>
      {erro && <p className="text-body-sm text-danger">{erro}</p>}
      <div className="flex items-center justify-between gap-2">
        <Botao variante="fantasma" disabled={atual === 0 || pendente} onClick={() => setAtual((n) => n - 1)}>
          <ArrowLeft aria-hidden />
          Voltar
        </Botao>
        {ultima ? (
          <Botao
            variante="primario"
            disabled={pendente || respondidas < teste.questoes.length}
            onClick={() =>
              iniciar(async () => {
                setErro(null);
                const r = await chamarAcao(() => enviarTeste(teste.id, respostas));
                if (r.ok) setResultado(r);
                else setErro(r.erro);
              })
            }
          >
            {pendente ? "Enviando…" : "Enviar respostas"}
          </Botao>
        ) : (
          <Botao variante="primario" disabled={!respostas[q.id]} onClick={() => setAtual((n) => n + 1)}>
            Próxima
            <ArrowRight aria-hidden />
          </Botao>
        )}
      </div>
      {ultima && respondidas < teste.questoes.length && (
        <p className="text-body-sm text-ink-muted">
          Falta responder {teste.questoes.length - respondidas}. Volte nelas antes de enviar.
        </p>
      )}
    </div>
  );
}
