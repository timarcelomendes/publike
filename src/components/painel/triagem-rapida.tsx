"use client";

import { Check, CircleHelp, Heart, Plus, SkipForward, TriangleAlert, Undo2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type PointerEvent as EventoPonteiro } from "react";
import { responderCurtida } from "@/lib/acoes/curtidas";
import { Avatar } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";

// Triagem rápida: quem espera resposta em cartões, um de cada vez. Arrastar para a
// direita aceita, para a esquerda dispensa; os botões e as setas do teclado fazem o
// mesmo. Dispensar e o aceite que espera o currículo dá para desfazer; o match não
// (para desistir de um match, só com "Desfazer match", que pede o motivo).

export type CartaTriagem = {
  anuncioId: string;
  perfilId: string;
  nome: string;
  foto: string | null;
  vaga: string;
  lugar: string;
  quando: string;
  nota: number | null;
  eliminado: boolean;
  atendidos: number;
  conferidos: number;
  criterios: { nome: string; ok: boolean | null; extra?: boolean; eliminatorio?: boolean }[];
  recado: string | null;
  estudo: string | null;
  /** o que a pessoa faz ("Auxiliar de cozinha"), do currículo */
  titulo: string | null;
  experiencias: string[];
  temCurriculo: boolean;
  /** a vaga pede currículo e a pessoa não mandou: o primeiro nome */
  semCurriculo: string | null;
  respostas: { pergunta: string; resposta: string }[];
};

type Feita = { carta: CartaTriagem; decisao: "match" | "dispensada" | "pular"; desfaz: boolean };

const LIMITE = 110;

export function TriagemRapida({ cartas: iniciais }: { cartas: CartaTriagem[] }) {
  const [fila, setFila] = useState(iniciais);
  const [feitas, setFeitas] = useState<Feita[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();
  const [dx, setDx] = useState(0);
  const [saindo, setSaindo] = useState<"direita" | "esquerda" | "cima" | null>(null);
  const inicio = useRef<{ x: number; id: number } | null>(null);
  const [arrastando, setArrastando] = useState(false);
  const total = iniciais.length;
  const atual = fila[0] ?? null;

  function decidir(decisao: Feita["decisao"]) {
    if (!atual || saindo) return;
    setErro(null);
    setSaindo(decisao === "match" ? "direita" : decisao === "dispensada" ? "esquerda" : "cima");
    const carta = atual;
    window.setTimeout(() => {
      setFila((f) => f.slice(1));
      setDx(0);
      setSaindo(null);
      if (decisao === "pular") {
        setFeitas((l) => [...l, { carta, decisao, desfaz: true }]);
        return;
      }
      setFeitas((l) => [...l, { carta, decisao, desfaz: decisao === "dispensada" || carta.semCurriculo !== null }]);
      iniciar(async () => {
        const r = await responderCurtida(carta.anuncioId, carta.perfilId, decisao);
        if (!r.ok) {
          // não deu: a carta volta para o topo
          setErro(r.erro);
          setFeitas((l) => l.filter((f) => f.carta !== carta));
          setFila((f) => [carta, ...f]);
        }
      });
    }, 180);
  }

  function desfazer() {
    const ultima = feitas[feitas.length - 1];
    if (!ultima?.desfaz || pendente) return;
    setErro(null);
    setFeitas((l) => l.slice(0, -1));
    setFila((f) => [ultima.carta, ...f]);
    if (ultima.decisao === "pular") return;
    iniciar(async () => {
      const r = await responderCurtida(ultima.carta.anuncioId, ultima.carta.perfilId, "pendente");
      if (!r.ok) setErro(r.erro);
    });
  }

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "a") decidir("match");
      else if (e.key === "ArrowLeft" || e.key.toLowerCase() === "d") decidir("dispensada");
      else if (e.key === "ArrowUp" || e.key.toLowerCase() === "p") decidir("pular");
      else if (e.key.toLowerCase() === "z") desfazer();
      else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  function aoApertar(e: EventoPonteiro<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("a, button")) return;
    inicio.current = { x: e.clientX, id: e.pointerId };
    setArrastando(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function aoMover(e: EventoPonteiro<HTMLDivElement>) {
    if (inicio.current?.id === e.pointerId) setDx(e.clientX - inicio.current.x);
  }
  function aoSoltar(e: EventoPonteiro<HTMLDivElement>) {
    if (inicio.current?.id !== e.pointerId) return;
    inicio.current = null;
    setArrastando(false);
    if (dx > LIMITE) decidir("match");
    else if (dx < -LIMITE) decidir("dispensada");
    else setDx(0);
  }

  const aceitos = feitas.filter((f) => f.decisao === "match").length;
  const dispensados = feitas.filter((f) => f.decisao === "dispensada").length;
  const pulados = feitas.filter((f) => f.decisao === "pular").length;
  const ultima = feitas[feitas.length - 1];
  const feitasAteAgora = total - fila.length;

  if (!atual) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-surface-200 px-5 py-10 text-center">
        <p className="font-display text-h2">{total ? "Triagem feita!" : "Ninguém esperando"}</p>
        <p className="max-w-md text-body text-ink-muted">
          {total
            ? `${aceitos} ${aceitos === 1 ? "aceito" : "aceitos"} e ${dispensados} ${dispensados === 1 ? "dispensado" : "dispensados"}.${pulados ? ` ${pulados} ${pulados === 1 ? "ficou" : "ficaram"} para depois, em “Para responder”.` : ""} Quem você aceitou está em “Em andamento”, pronto para a entrevista.`
            : "Quando alguém curtir uma vaga sua, aparece aqui para você decidir."}
        </p>
        {ultima?.desfaz && (
          <button
            type="button"
            onClick={desfazer}
            disabled={pendente}
            className="inline-flex min-h-11 items-center gap-2 text-label underline underline-offset-2"
          >
            <Undo2 aria-hidden className="size-[18px]" />
            Desfazer a última
          </button>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {aceitos > 0 && (
            <BotaoLink href="/painel/caixa?aba=andamento" variante="primario">
              Ver quem você aceitou
            </BotaoLink>
          )}
          <BotaoLink href="/painel/caixa">Voltar à caixa de entrada</BotaoLink>
        </div>
      </div>
    );
  }

  const giro = saindo === "direita" ? 600 : saindo === "esquerda" ? -600 : dx;
  const rotulo = dx > 40 || saindo === "direita" ? "aceitar" : dx < -40 || saindo === "esquerda" ? "dispensar" : null;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3 text-body-sm text-ink-muted">
        <span aria-live="polite">
          {feitasAteAgora + 1} de {total}
        </span>
        <span aria-hidden className="flex h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-300">
          <span
            className="bg-ink transition-all"
            style={{ width: `${(100 * feitasAteAgora) / Math.max(total, 1)}%` }}
          />
        </span>
        <Link href="/painel/caixa" className="text-label underline underline-offset-2 hover:text-ink">
          Sair
        </Link>
      </div>

      <div className="relative">
        {fila[1] && (
          <div aria-hidden className="absolute inset-x-3 top-3 bottom-0 rounded-lg border border-line bg-surface-300" />
        )}
        <div
          role="group"
          aria-roledescription="cartão"
          aria-label={`${atual.nome}, ${atual.vaga}`}
          onPointerDown={aoApertar}
          onPointerMove={aoMover}
          onPointerUp={aoSoltar}
          onPointerCancel={() => {
            inicio.current = null;
            setArrastando(false);
            setDx(0);
          }}
          className="relative flex touch-pan-y flex-col gap-4 rounded-lg border border-line-strong bg-surface-200 p-5 shadow-raised select-none sm:p-6"
          style={{
            transform: `translate(${giro}px, ${saindo === "cima" ? -40 : 0}px) rotate(${giro / 22}deg)`,
            opacity: saindo ? 0 : 1,
            transition: arrastando ? "none" : "transform 180ms ease-out, opacity 180ms ease-out",
          }}
        >
          {rotulo && (
            <span
              aria-hidden
              className={`absolute top-5 rounded-md border-2 px-3 py-1 font-display text-h3 uppercase ${
                rotulo === "aceitar" ? "left-5 -rotate-6 border-like text-like" : "right-5 rotate-6 border-ink text-ink"
              }`}
            >
              {rotulo === "aceitar" ? "Aceitar" : "Dispensar"}
            </span>
          )}
          <div className="flex items-center gap-3">
            <Avatar nome={atual.nome} foto={atual.foto} tamanho={64} />
            <div className="min-w-0">
              <p className="font-display text-h3 break-words">{atual.nome}</p>
              <p className="text-body-sm text-ink-muted">
                {atual.vaga} · {atual.lugar} · {atual.quando}
              </p>
            </div>
          </div>

          {atual.eliminado ? (
            <p className="flex items-center gap-2 rounded-md border border-danger px-3 py-2 text-body-sm text-danger">
              <TriangleAlert aria-hidden className="size-4 shrink-0" />
              Respondeu diferente numa pergunta eliminatória.
            </p>
          ) : atual.nota !== null ? (
            <div className="flex flex-col gap-2">
              <p className="flex items-baseline gap-2">
                <span
                  className={`font-display text-h2 leading-none tabular-nums ${
                    atual.nota >= 80 ? "text-cerrado-text" : ""
                  }`}
                >
                  {atual.nota}%
                </span>
                <span className="text-body-sm text-ink-muted">
                  de aderência · atende {atual.atendidos} de {atual.conferidos}
                </span>
              </p>
              <ul className="flex flex-wrap gap-1.5">
                {atual.criterios.map((k) => (
                  <li
                    key={k.nome}
                    className="inline-flex items-center gap-1 rounded-pill bg-surface-300 px-2.5 py-1 text-body-sm"
                  >
                    {k.extra ? (
                      <Plus aria-label="Ponto a mais" className="size-3.5 text-cerrado-text" />
                    ) : k.ok === true ? (
                      <Check aria-label="Atende" className="size-3.5 text-cerrado-text" />
                    ) : k.ok === false ? (
                      <X aria-label="Não atende" className="size-3.5 text-danger" />
                    ) : (
                      <CircleHelp aria-label="Sem informação" className="size-3.5 text-ink-muted" />
                    )}
                    {k.nome}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {atual.recado && <p className="rounded-md bg-surface-300 px-3 py-2 text-body">“{atual.recado}”</p>}

          <div className="flex flex-col gap-1 text-body-sm">
            {atual.temCurriculo ? (
              <>
                {atual.titulo && <p className="text-label">{atual.titulo}</p>}
                {atual.experiencias.length ? (
                  atual.experiencias.map((e) => <p key={e}>{e}</p>)
                ) : (
                  <p className="text-ink-muted">Primeiro emprego</p>
                )}
                {atual.estudo && <p className="text-ink-muted">{atual.estudo}</p>}
              </>
            ) : (
              <p className="text-ink-muted">
                Sem currículo ainda.
                {atual.semCurriculo &&
                  ` A vaga pede: aceitando, ${atual.semCurriculo} recebe o pedido e o match sai quando ele chegar.`}
              </p>
            )}
          </div>

          {atual.respostas.length > 0 && (
            <dl className="flex flex-col gap-1.5 border-t border-line pt-3 text-body-sm">
              {atual.respostas.map((r) => (
                <div key={r.pergunta}>
                  <dt className="text-ink-muted">{r.pergunta}</dt>
                  <dd className={r.resposta ? "font-semibold" : "text-ink-muted italic"}>
                    {r.resposta || "Não respondeu"}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <Link
            href={`/painel/caixa?aba=responder&c=${atual.anuncioId}:${atual.perfilId}`}
            className="self-start text-label underline underline-offset-2"
          >
            Ver a ficha completa
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <button
          type="button"
          onClick={() => decidir("dispensada")}
          disabled={Boolean(saindo)}
          aria-label="Dispensar"
          className="inline-flex size-16 items-center justify-center rounded-pill border border-line-strong bg-surface-200 text-ink shadow-card hover:bg-surface-300"
        >
          <X aria-hidden className="size-7" />
        </button>
        <button
          type="button"
          onClick={() => decidir("pular")}
          disabled={Boolean(saindo)}
          aria-label="Pular, decidir depois"
          className="inline-flex size-12 items-center justify-center rounded-pill border border-line bg-surface-200 text-ink-muted hover:bg-surface-300"
        >
          <SkipForward aria-hidden className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => decidir("match")}
          disabled={Boolean(saindo)}
          aria-label="Aceitar"
          className="inline-flex size-16 items-center justify-center rounded-pill bg-like text-on-like shadow-card hover:brightness-110"
        >
          <Heart aria-hidden className="size-7" />
        </button>
      </div>
      <p className="text-center text-body-sm text-ink-muted">
        Arraste para o lado ou use os botões.
        <span className="hidden lg:inline"> No teclado: ← dispensar · → aceitar · ↑ pular · Z desfazer.</span>
      </p>
      {ultima?.desfaz && (
        <p role="status" className="flex items-center justify-center gap-3 text-body-sm">
          {ultima.decisao === "pular"
            ? `${ultima.carta.nome.split(" ")[0]}: para depois.`
            : ultima.decisao === "dispensada"
              ? `${ultima.carta.nome.split(" ")[0]} dispensado.`
              : `${ultima.carta.nome.split(" ")[0]} aceito: pedido do currículo enviado.`}
          <button
            type="button"
            onClick={desfazer}
            disabled={pendente}
            className="inline-flex min-h-10 items-center gap-1.5 font-semibold underline underline-offset-2"
          >
            <Undo2 aria-hidden className="size-4" />
            Desfazer
          </button>
        </p>
      )}
      {ultima && !ultima.desfaz && ultima.decisao === "match" && (
        <p role="status" className="text-center text-body-sm text-cerrado-text">
          Deu match com {ultima.carta.nome.split(" ")[0]}! O contato está liberado na caixa de entrada.
        </p>
      )}
      {erro && (
        <p role="alert" className="text-center text-body-sm text-danger">
          {erro}
        </p>
      )}
    </div>
  );
}
