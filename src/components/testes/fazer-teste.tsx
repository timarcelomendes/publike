"use client";

import { AlarmClock, ArrowLeft, ArrowRight, Check, ClipboardCheck, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { aceitarTeste, enviarTeste } from "@/lib/acoes/testes";
import { competenciasDoResultado, faixaDoResultado, faixaDoTeste, NAO_E_PSICOLOGICO, NOME_FAIXA } from "@/lib/testes";
import { Aviso, Selo } from "../ui/basicos";
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
  /** quantas questões o teste tem (as questões só vêm depois do "Começar", migração 20261225120000) */
  total: number;
  /** o "Começar": daí conta o tempo */
  inicio: string | null;
  /** o tempo deste teste, em minutos (null: sem limite) */
  limite_minutos: number | null;
  /** antes do "Começar": o tempo que a pessoa vai ter (null: sem limite) */
  limite_previsto: number | null;
  /** a hora do banco, para o relógio da tela não depender do relógio do celular */
  agora: string;
  questoes: { id: string; enunciado: string; opcoes: { id: string; texto: string }[] }[];
};

type Resultado = { pontos: number; maximo: number; por_competencia: unknown };
type Guardado = { atual: number; respostas: Record<string, string>; saidas: number };

// o que a pessoa já respondeu fica no aparelho até enviar (recarregar a página não perde nada)
const chave = (id: string) => `publike_teste_${id}`;
function lerGuardado(id: string): Guardado | null {
  try {
    const v = JSON.parse(window.sessionStorage.getItem(chave(id)) ?? "null") as Guardado | null;
    return v && typeof v === "object" && v.respostas && typeof v.respostas === "object" ? v : null;
  } catch {
    return null;
  }
}
function guardar(id: string, g: Guardado | null) {
  try {
    if (g) window.sessionStorage.setItem(chave(id), JSON.stringify(g));
    else window.sessionStorage.removeItem(chave(id));
  } catch {}
}

/** "07:42" */
function relogio(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

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
  const faixa = faixaDoTeste(tipo, pontos, maximo);
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
        {faixa && (
          <p className="mt-2 flex flex-wrap items-center justify-center gap-2 text-body-sm text-ink-muted">
            <Selo variante={faixa === "acima" ? "match" : "contorno"}>{NOME_FAIXA[faixa]}</Selo>
            para a função
          </p>
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

/**
 * O teste no celular: as condições e o "Começar" (com o tempo e o "Preciso de mais tempo"), uma questão por tela
 * com o relógio no alto, e o resultado no fim. Acabou o tempo, vai o que foi respondido. Sair da tela durante o
 * teste é contado e a empresa vê o número; ninguém é recusado por isso.
 */
export function FazerTeste({ teste }: { teste: TesteParaFazer }) {
  const [atual, setAtual] = useState(0);
  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [saidas, setSaidas] = useState(0);
  const [saiu, setSaiu] = useState(false);
  const [maisTempo, setMaisTempo] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(
    teste.status === "feita" && teste.pontos != null && teste.maximo != null
      ? { pontos: teste.pontos, maximo: teste.maximo, por_competencia: teste.por_competencia }
      : null,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  // o relógio: quanto falta, em milissegundos (null: sem limite, ou antes de montar)
  const [falta, setFalta] = useState<number | null>(null);
  const enviando = useRef(false);
  // o envio no fim do tempo lê daqui o que já foi respondido
  const atuais = useRef({ respostas, saidas });
  useEffect(() => {
    atuais.current = { respostas, saidas };
  }, [respostas, saidas]);

  const comecou = Boolean(teste.inicio) && teste.status === "pedida" && !teste.vencida;
  const total = teste.questoes.length || teste.total;
  const acabou = falta !== null && falta <= 0;

  // de volta à página no meio do teste: o que já tinha respondido
  useEffect(() => {
    if (!comecou) return;
    const g = lerGuardado(teste.id);
    if (!g) return;
    /* eslint-disable react-hooks/set-state-in-effect -- lido do aparelho depois de montar */
    setRespostas(g.respostas);
    setAtual(Math.min(Math.max(0, g.atual | 0), Math.max(0, teste.questoes.length - 1)));
    setSaidas(g.saidas | 0);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [comecou, teste.id, teste.questoes.length]);

  // guarda a cada resposta; o começo em branco nunca apaga o que estava guardado (ele chega pelo efeito acima)
  useEffect(() => {
    if (!comecou || resultado) return;
    if (atual > 0 || saidas > 0 || Object.keys(respostas).length > 0) guardar(teste.id, { atual, respostas, saidas });
  }, [comecou, resultado, teste.id, atual, respostas, saidas]);

  // o relógio conta pela hora do banco (o "Começar" e o agora da página), não pela do celular
  useEffect(() => {
    if (!comecou || !teste.inicio || !teste.limite_minutos || resultado) return;
    const desvio = Date.now() - new Date(teste.agora).getTime();
    const fim = new Date(teste.inicio).getTime() + teste.limite_minutos * 60_000;
    const contar = () => setFalta(fim - (Date.now() - desvio));
    const primeira = setTimeout(contar, 0);
    const cada = setInterval(contar, 1000);
    return () => {
      clearTimeout(primeira);
      clearInterval(cada);
    };
  }, [comecou, teste.inicio, teste.limite_minutos, teste.agora, resultado]);

  // sair da tela (outro app, outra aba) durante o teste: conta, e avisa na volta
  useEffect(() => {
    if (!comecou || resultado) return;
    const aoMudar = () => {
      if (document.visibilityState === "hidden") {
        setSaidas((n) => n + 1);
        setSaiu(true);
      }
    };
    document.addEventListener("visibilitychange", aoMudar);
    return () => document.removeEventListener("visibilitychange", aoMudar);
  }, [comecou, resultado]);

  const enviar = useCallback(() => {
    if (enviando.current) return;
    enviando.current = true;
    iniciar(async () => {
      setErro(null);
      const { respostas: r, saidas: s } = atuais.current;
      const res = await chamarAcao(() => enviarTeste(teste.id, r, s));
      enviando.current = false;
      if (res.ok) {
        guardar(teste.id, null);
        setResultado(res);
      } else setErro(res.erro);
    });
  }, [teste.id]);

  // acabou o tempo: vai o que foi respondido (uma vez; se falhar, o botão manda de novo)
  const mandouNoFim = useRef(false);
  useEffect(() => {
    if (acabou && comecou && !resultado && !mandouNoFim.current) {
      mandouNoFim.current = true;
      enviar();
    }
  }, [acabou, comecou, resultado, enviar]);

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

  if (!comecou) {
    const prazo = new Date(teste.prazo).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
    const minutos = teste.limite_previsto;
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-line bg-surface-200 p-5">
          <p className="flex items-center gap-2 text-label">
            <ClipboardCheck aria-hidden className="size-5 text-ink-muted" />
            {teste.total} questões · {minutos ? `${minutos} minutos` : "sem limite de tempo"}
          </p>
          {teste.descricao && <p className="mt-2 text-body-sm text-ink-muted">{teste.descricao}</p>}
          <ul className="mt-4 flex flex-col gap-2 text-body-sm">
            <li>
              • Para que serve: ajudar {teste.empresa} a conhecer você para a vaga “{teste.vaga}”.
            </li>
            <li>• Quem vê: só quem publicou a vaga, e você, no fim.</li>
            <li>• Por quanto tempo: o resultado é apagado 12 meses depois que a vaga sai do ar.</li>
            {minutos ? (
              <li>
                • O tempo começa quando você tocar em “Começar” e aparece no alto da tela. Se acabar, o que você
                respondeu vai assim mesmo.
              </li>
            ) : (
              <li>• Faça no seu ritmo: este teste não tem limite de tempo.</li>
            )}
            <li>• Uma tentativa só. Dá para pular, voltar e trocar a resposta antes de enviar. Prazo: até {prazo}.</li>
            <li>• Fique na tela do teste até enviar. Se sair, a empresa vê quantas vezes isso aconteceu.</li>
          </ul>
          <p className="mt-4 flex gap-2 rounded-md bg-surface-300 p-3 text-body-sm">
            <ShieldCheck aria-hidden className="mt-0.5 size-[18px] shrink-0 text-cerrado-text" />
            {NAO_E_PSICOLOGICO}
          </p>
        </div>
        {minutos ? (
          <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-line bg-surface-200 px-4 py-3">
            <input
              type="checkbox"
              checked={maisTempo}
              onChange={(e) => setMaisTempo(e.target.checked)}
              className="mt-0.5 size-5 shrink-0 accent-[var(--pk-ink)]"
            />
            <span className="text-body-sm">
              <span className="block text-label">Preciso de mais tempo</span>
              <span className="text-ink-muted">Você terá {minutos * 2} minutos. A empresa não vê esse pedido.</span>
            </span>
          </label>
        ) : null}
        {erro && <p className="text-body-sm text-danger">{erro}</p>}
        <Botao
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setErro(null);
              const r = await chamarAcao(() => aceitarTeste(teste.id, maisTempo));
              if (!r.ok) setErro(r.erro);
            })
          }
        >
          {pendente ? "Começando…" : "Aceito e quero começar"}
        </Botao>
      </div>
    );
  }

  const q = teste.questoes[atual];
  if (!q) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para abrir as questões">
        Recarregue a página. O tempo continua contando.
      </Aviso>
    );
  }
  const ultima = atual === total - 1;
  const respondidas = teste.questoes.filter((x) => respostas[x.id]).length;
  const emBranco = teste.questoes.findIndex((x) => !respostas[x.id]);
  const poucoTempo = falta !== null && falta > 0 && falta <= 60_000;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between gap-3 text-body-sm text-ink-muted">
          <span>
            Questão {atual + 1} de {total} · {respondidas} respondidas
          </span>
          {falta !== null && (
            <span
              role="timer"
              aria-label="Tempo que falta"
              className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-1 font-semibold tabular-nums ${
                poucoTempo || acabou ? "bg-terra-soft text-terra-text" : "bg-surface-300 text-ink"
              }`}
            >
              <AlarmClock aria-hidden className="size-4" />
              {relogio(falta)}
            </span>
          )}
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-300" aria-hidden>
          <div
            className="h-full rounded-pill bg-cerrado transition-[width]"
            style={{ width: `${(100 * (atual + 1)) / total}%` }}
          />
        </div>
        {poucoTempo && (
          <p className="mt-2 text-body-sm text-terra-text" aria-live="polite">
            Falta menos de 1 minuto. Quando acabar, o que você respondeu vai assim mesmo.
          </p>
        )}
      </div>
      {saiu && !acabou && (
        <Aviso tipo="alerta" titulo="Você saiu da tela do teste">
          <span className="flex flex-col items-start gap-2">
            <span>
              O tempo continua contando, e a empresa vê quantas vezes isso aconteceu (
              {saidas === 1 ? "1 vez" : `${saidas} vezes`}).
            </span>
            <Botao tamanho="sm" onClick={() => setSaiu(false)}>
              Continuar o teste
            </Botao>
          </span>
        </Aviso>
      )}
      {acabou ? (
        <Aviso tipo="info" titulo="O tempo acabou">
          {pendente ? "Enviando o que você respondeu…" : "O que você respondeu vai para a empresa."}
        </Aviso>
      ) : (
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
      )}
      {erro && <p className="text-body-sm text-danger">{erro}</p>}
      <div className="flex items-center justify-between gap-2">
        <Botao variante="fantasma" disabled={atual === 0 || pendente || acabou} onClick={() => setAtual((n) => n - 1)}>
          <ArrowLeft aria-hidden />
          Voltar
        </Botao>
        {ultima || acabou ? (
          <Botao variante="primario" disabled={pendente || (respondidas < total && !acabou)} onClick={enviar}>
            {pendente ? "Enviando…" : acabou ? "Enviar o que respondi" : "Enviar respostas"}
          </Botao>
        ) : (
          <Botao variante={respostas[q.id] ? "primario" : "secundario"} onClick={() => setAtual((n) => n + 1)}>
            {respostas[q.id] ? "Próxima" : "Pular"}
            <ArrowRight aria-hidden />
          </Botao>
        )}
      </div>
      {ultima && !acabou && respondidas < total && emBranco >= 0 && (
        <p className="flex flex-wrap items-center gap-2 text-body-sm text-ink-muted">
          Falta responder {total - respondidas}.
          <button type="button" onClick={() => setAtual(emBranco)} className="text-label text-ink underline">
            Ir para a primeira em branco
          </button>
        </p>
      )}
    </div>
  );
}
