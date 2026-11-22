"use client";

import { LoaderCircle, MessagesSquare, Mic, RotateCcw, Send, Square } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { montarDaConversa, perguntaParaMontar, type FalaDaConversa } from "@/lib/acoes/montar-conversando";
import { chamarAcao } from "@/lib/acao-segura";
import { comecarGravacao, ErroDaFala, MAX_SEGUNDOS_FALA, podeGravarFala, relogio, transcreverGravacao, type Gravacao } from "@/lib/gravar-fala";
import type { CurriculoLido } from "@/lib/ia/curriculo-do-arquivo";
import { classesChip } from "../painel/fluxo";
import { Aviso, Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// "Montar conversando" em Meu currículo (22/11/2026; claude/plano-curriculo-otimizado.md, fase 2): o mesmo jeito do
// currículo pelo WhatsApp. A pessoa conta o que procura e onde trabalhou, responde 3 perguntas de recrutador (uma de
// cada vez, com opções para tocar quando cabem) e diz estudo, cursos, CNH e horário, escrevendo ou falando (a fala vira
// texto, que ela vê e pode corrigir antes de mandar). No fim, a IA monta o currículo só com o que ela disse e o
// formulário vem preenchido. Nada é salvo até ela salvar.

const PRIMEIRA =
  "Que trabalho você procura e onde você já trabalhou? Conte tudo: emprego com carteira, bico, diária, freelance, trabalho por conta própria ou ajudando a família. Tudo isso conta.";
const EXEMPLO = "Ex.: quero trabalhar de auxiliar de cozinha. Trabalhei 2 anos numa lanchonete em Campinas e faço salgado para vender.";
const ULTIMA =
  "Por último: até que ano você estudou, se fez algum curso, se tem carteira de motorista (e qual) e quando pode trabalhar (manhã, tarde, noite, fim de semana). O que não tiver, é só pular.";

type Mensagem = FalaDaConversa & { opcoes?: string[] };
type Situacao =
  | { tipo: "fechado" }
  | { tipo: "conversando" }
  | { tipo: "pensando"; montando?: boolean }
  | { tipo: "gravando"; desde: number }
  | { tipo: "ouvindo" }
  | { tipo: "pronto" };

const nadaMuda = () => () => {};

export function MontarConversando({
  aoLer,
  rotuloSalvar,
  falar,
}: {
  aoLer: (lido: CurriculoLido) => void;
  rotuloSalvar: string;
  /** a transcrição está ligada (sem ela, só escrevendo) */
  falar: boolean;
}) {
  const [situacao, setSituacao] = useState<Situacao>({ tipo: "fechado" });
  const [conversa, setConversa] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(0);
  const gravacao = useRef<Gravacao | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const gravaAqui = useSyncExternalStore(nadaMuda, podeGravarFala, () => false);
  const podeFalar = falar && gravaAqui;
  const respondidas = conversa.filter((m) => m.de === "pessoa").length;
  const gravandoDesde = situacao.tipo === "gravando" ? situacao.desde : null;

  // o relógio da gravação (e para sozinha no limite)
  useEffect(() => {
    if (gravandoDesde === null) return;
    const t = setInterval(() => {
      const n = Date.now();
      setAgora(n);
      if ((n - gravandoDesde) / 1000 >= MAX_SEGUNDOS_FALA) void pararDeFalar();
    }, 500);
    return () => clearInterval(t);
  }, [gravandoDesde]);

  // a última mensagem à vista
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [conversa.length, situacao.tipo]);

  function comecar() {
    setConversa([{ de: "publike", texto: PRIMEIRA }]);
    setTexto("");
    setErro(null);
    setSituacao({ tipo: "conversando" });
  }

  async function responder(resposta: string) {
    const r = resposta.replace(/\s+/g, " ").trim();
    if (r.length < 2) return setErro("Escreva ou fale a sua resposta.");
    setErro(null);
    setTexto("");
    const nova: Mensagem[] = [...conversa.map(({ de, texto: t }) => ({ de, texto: t })), { de: "pessoa", texto: r }];
    setConversa(nova);
    const n = respondidas + 1;
    // 1 a 3: as perguntas do recrutador; 4: estudo, cursos, CNH e horário; 5: montar
    if (n <= 3) {
      setSituacao({ tipo: "pensando" });
      const p = await chamarAcao(() => perguntaParaMontar(nova, n as 1 | 2 | 3)).catch(() => null);
      if (!p?.ok) {
        setErro(p?.erro ?? "Não deu para continuar agora. Tente de novo.");
        setConversa(conversa);
        setTexto(r);
        return setSituacao({ tipo: "conversando" });
      }
      setConversa([...nova, { de: "publike", texto: p.pergunta.texto.replace(/_/g, ""), opcoes: p.pergunta.opcoes }]);
      return setSituacao({ tipo: "conversando" });
    }
    if (n === 4) {
      setConversa([...nova, { de: "publike", texto: ULTIMA }]);
      return setSituacao({ tipo: "conversando" });
    }
    setSituacao({ tipo: "pensando", montando: true });
    const lido = await chamarAcao(() => montarDaConversa(nova)).catch(() => null);
    if (!lido?.ok) {
      setErro(lido?.erro ?? "Não deu para montar agora. Tente de novo.");
      setConversa(conversa);
      setTexto(r);
      return setSituacao({ tipo: "conversando" });
    }
    aoLer(lido.curriculo);
    setSituacao({ tipo: "pronto" });
  }

  async function falarAgora() {
    setErro(null);
    try {
      gravacao.current = await comecarGravacao();
    } catch (e) {
      return setErro(e instanceof ErroDaFala ? e.message : "Não deu para ligar o microfone. Tente de novo.");
    }
    const inicio = Date.now();
    setAgora(inicio);
    setSituacao({ tipo: "gravando", desde: inicio });
  }

  async function pararDeFalar() {
    const g = gravacao.current;
    if (!g) return;
    gravacao.current = null;
    setSituacao({ tipo: "ouvindo" });
    try {
      const fala = await transcreverGravacao(await g.terminar());
      setTexto((t) => (t ? `${t} ${fala}` : fala));
    } catch (e) {
      setErro(e instanceof ErroDaFala ? e.message : "Não deu para ouvir agora. Tente de novo ou escreva.");
    }
    setSituacao({ tipo: "conversando" });
  }

  function cancelarFala() {
    gravacao.current?.cancelar();
    gravacao.current = null;
    setSituacao({ tipo: "conversando" });
  }

  if (situacao.tipo === "fechado" || situacao.tipo === "pronto")
    return (
      <section
        aria-labelledby="montar-conversando"
        className="flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-5 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-terra-soft text-terra-text">
            <MessagesSquare aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id="montar-conversando" className="text-h3">
              Montar conversando
              <Selo variante="novo" className="ml-2 align-middle">
                Novo
              </Selo>
            </h2>
            <p className="mt-1 text-body-sm text-ink-muted">
              Responda umas perguntas{podeFalar ? ", escrevendo ou falando," : ""} como numa entrevista. O Publike escreve
              o currículo só com o que você contar. Leva uns 5 minutos.
            </p>
          </div>
        </div>
        {situacao.tipo === "pronto" && (
          <Aviso tipo="sucesso" titulo="Pronto! Confira os campos aqui embaixo.">
            Escrevemos só o que você contou. Ainda não está salvo: confira, corrija o que precisar e toque em “{rotuloSalvar}”,
            embaixo da tela.
          </Aviso>
        )}
        <Botao variante={situacao.tipo === "pronto" ? "fantasma" : "primario"} className="self-start" onClick={comecar}>
          {situacao.tipo === "pronto" ? <RotateCcw aria-hidden /> : <MessagesSquare aria-hidden />}
          {situacao.tipo === "pronto" ? "Conversar de novo" : "Começar"}
        </Botao>
      </section>
    );

  const ultima = conversa.at(-1);
  const opcoes = ultima?.de === "publike" ? (ultima.opcoes ?? []) : [];
  const ocupado = situacao.tipo === "pensando" || situacao.tipo === "ouvindo";
  const etapa = Math.min(respondidas + 1, 5);
  return (
    <section
      aria-labelledby="montar-conversando"
      className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface-200 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="montar-conversando" className="text-h3">
          Montar conversando
        </h2>
        <span className="text-body-sm text-ink-muted tabular-nums">Pergunta {etapa} de 5</span>
      </div>

      <ol className="flex flex-col gap-3" aria-live="polite">
        {conversa.map((m, i) => (
          <li
            key={i}
            className={`max-w-[90%] rounded-lg px-4 py-3 text-body-sm ${
              m.de === "publike" ? "self-start bg-surface-100" : "self-end bg-terra-soft text-terra-text"
            }`}
          >
            <span className="sr-only">{m.de === "publike" ? "Publike: " : "Você: "}</span>
            {m.texto}
            {i === 0 && <span className="mt-1 block text-ink-muted">{EXEMPLO}</span>}
          </li>
        ))}
        {situacao.tipo === "pensando" && (
          <li role="status" className="flex items-center gap-2 self-start text-body-sm text-ink-muted">
            <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
            {situacao.montando ? "Escrevendo o seu currículo… pode levar até um minuto." : "Pensando na próxima pergunta…"}
          </li>
        )}
      </ol>
      <div ref={fim} />

      {opcoes.length > 0 && !ocupado && situacao.tipo !== "gravando" && (
        <div className="flex flex-wrap gap-2">
          {opcoes.map((o) => (
            <button key={o} type="button" className={classesChip(false)} onClick={() => void responder(o)}>
              {o}
            </button>
          ))}
        </div>
      )}

      {situacao.tipo === "gravando" ? (
        <div className="flex flex-col gap-3 rounded-md border border-line-strong bg-surface-100 p-4">
          <p className="flex flex-wrap items-center gap-x-2 text-label">
            <span aria-hidden className="size-3 shrink-0 rounded-pill bg-danger motion-safe:animate-pulse" />
            <span role="status">Gravando</span>
            <span aria-hidden className="text-ink-muted tabular-nums">
              {relogio(Math.max(0, (agora - situacao.desde) / 1000))} de {relogio(MAX_SEGUNDOS_FALA)}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao variante="primario" onClick={() => void pararDeFalar()}>
              <Square aria-hidden />
              Parar e ver o texto
            </Botao>
            <Botao variante="fantasma" onClick={cancelarFala}>
              Cancelar
            </Botao>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor="resposta-conversando" className="sr-only">
            Sua resposta
          </label>
          <textarea
            id="resposta-conversando"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={3}
            maxLength={3000}
            disabled={ocupado}
            placeholder={opcoes.length ? "Toque numa opção ou escreva do seu jeito" : "Escreva do seu jeito"}
            className={`${classesEntrada} resize-y`}
          />
          {situacao.tipo === "ouvindo" && (
            <p role="status" className="flex items-center gap-2 text-body-sm text-ink-muted">
              <LoaderCircle aria-hidden className="size-4 motion-safe:animate-spin" />
              Ouvindo o que você falou…
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Botao variante="primario" disabled={ocupado || texto.trim().length < 2} onClick={() => void responder(texto)}>
              <Send aria-hidden />
              Responder
            </Botao>
            {podeFalar && (
              <Botao disabled={ocupado} onClick={() => void falarAgora()}>
                <Mic aria-hidden />
                Falar
              </Botao>
            )}
            <Botao variante="fantasma" disabled={ocupado} onClick={() => setSituacao({ tipo: "fechado" })}>
              Fechar
            </Botao>
          </div>
        </div>
      )}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
    </section>
  );
}
