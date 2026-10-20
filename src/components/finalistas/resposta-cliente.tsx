"use client";

import { Check, Printer, X } from "lucide-react";
import { useState, useTransition } from "react";
import { responderFinalista } from "@/lib/acoes/finalistas";
import { DECISOES_CLIENTE, LIMITES_FINALISTAS, type DecisaoCliente } from "@/lib/finalistas";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// A página do cliente (sem conta, pelo link): responder sobre cada finalista e imprimir.

const CHAVE_NOME = "publike_finalistas_quem";

function lerNome() {
  try {
    return localStorage.getItem(CHAVE_NOME) ?? "";
  } catch {
    return "";
  }
}

function guardarNome(nome: string) {
  try {
    if (nome) localStorage.setItem(CHAVE_NOME, nome);
    else localStorage.removeItem(CHAVE_NOME);
  } catch {}
}

/** "Quero entrevistar" ou "Não seguir" (salva na hora) e um comentário para a agência. */
export function RespostaDoCliente({
  token,
  id,
  nome,
  inicial,
}: {
  token: string;
  id: string;
  /** o nome do finalista (para os rótulos) */
  nome: string;
  inicial: { decisao: DecisaoCliente | null; comentario: string | null; quem: string | null };
}) {
  const [decisao, setDecisao] = useState(inicial.decisao);
  const [comentario, setComentario] = useState(inicial.comentario ?? "");
  const [comentarioSalvo, setComentarioSalvo] = useState(inicial.comentario ?? "");
  const [quem, setQuem] = useState(inicial.quem ?? "");
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const primeiro = nome.split(" ")[0];
  const idComentario = `comentario-${id}`;
  const idQuem = `quem-${id}`;

  function salvar(nova: DecisaoCliente | null, texto: string) {
    setAviso(null);
    const anterior = decisao;
    setDecisao(nova);
    iniciar(async () => {
      // o nome de quem responde fica no aparelho: as outras respostas usam o mesmo
      const q = quem.replace(/\s+/g, " ").trim() || lerNome();
      guardarNome(q);
      const r = await responderFinalista(token, id, nova, texto, q);
      if (r.ok) {
        setQuem(q);
        setComentarioSalvo(texto.trim());
        setAviso({ ok: true, texto: r.mensagem ?? "Resposta salva." });
      } else {
        setDecisao(anterior);
        setAviso({ ok: false, texto: r.erro });
      }
    });
  }

  const opcao = (valor: DecisaoCliente) => {
    const marcada = decisao === valor;
    const Icone = valor === "entrevistar" ? Check : X;
    return (
      <button
        type="button"
        aria-pressed={marcada}
        disabled={pendente}
        onClick={() => salvar(marcada ? null : valor, comentario)}
        className={`inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md border px-4 text-label transition-colors disabled:opacity-60 sm:w-auto ${
          marcada
            ? valor === "entrevistar"
              ? "border-transparent bg-cerrado text-on-cerrado"
              : "border-ink bg-ink text-surface-100"
            : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
        }`}
      >
        <Icone aria-hidden className="size-[18px]" />
        {DECISOES_CLIENTE[valor].acao}
      </button>
    );
  };

  return (
    <>
      {/* no papel: a resposta dada (os botões e campos não saem na impressão) */}
      <p className="hidden text-body-sm print:block">
        <span className="font-semibold">Resposta:</span> {decisao ? DECISOES_CLIENTE[decisao].nome : "sem resposta"}
        {comentarioSalvo && (
          <>
            {" · "}
            <span className="font-semibold">Comentário:</span> {comentarioSalvo}
          </>
        )}
      </p>
      <div className="flex flex-col gap-3" data-nao-imprimir>
        <p className="text-label">O que você acha de {primeiro}?</p>
        <div className="flex flex-col gap-2 sm:flex-row" role="group" aria-label={`Sua resposta sobre ${primeiro}`}>
          {opcao("entrevistar")}
          {opcao("nao_seguir")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={idComentario} className="text-body-sm text-ink-muted">
            Comentário para a agência (opcional)
          </label>
          <textarea
            id={idComentario}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={2}
            maxLength={LIMITES_FINALISTAS.comentario}
            placeholder="Ex.: pode vir na quinta às 14h? Quero saber se tem experiência com caixa."
            className={`${classesEntrada} resize-y`}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex min-w-48 flex-1 flex-col gap-1.5">
            <label htmlFor={idQuem} className="text-body-sm text-ink-muted">
              Seu nome (opcional, para a agência saber quem respondeu)
            </label>
            <input
              id={idQuem}
              value={quem}
              onChange={(e) => setQuem(e.target.value)}
              maxLength={LIMITES_FINALISTAS.quem}
              autoComplete="name"
              className={classesEntrada}
            />
          </div>
          {comentario.trim() !== comentarioSalvo && (
            <Botao disabled={pendente} onClick={() => salvar(decisao, comentario)}>
              {pendente ? "Salvando…" : "Salvar comentário"}
            </Botao>
          )}
        </div>
        {aviso && (
          <p
            role={aviso.ok ? "status" : "alert"}
            className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}
          >
            {aviso.texto}
          </p>
        )}
      </div>
    </>
  );
}

export function BotaoImprimir() {
  return (
    <Botao tamanho="sm" onClick={() => window.print()} data-nao-imprimir>
      <Printer aria-hidden />
      Imprimir ou salvar em PDF
    </Botao>
  );
}
