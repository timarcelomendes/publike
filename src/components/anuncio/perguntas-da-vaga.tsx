"use client";

import { MessageCircleQuestion, Pencil } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { responderPerguntas } from "@/lib/acoes/curtidas";
import { textoDaResposta, type Pergunta, type Respostas } from "@/lib/vaga-extra";
import { Aviso } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada, MensagemErro } from "../ui/campo";

const pilula =
  "inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-pill border border-line bg-surface-300 px-3.5 text-label transition-colors has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus";

/** As obrigatórias que ficaram sem resposta. */
export function faltandoResponder(perguntas: Pergunta[], respostas: Respostas) {
  return perguntas.filter((p) => p.obrigatoria && !(respostas[p.id] ?? "").trim()).map((p) => p.id);
}

/** Os campos das perguntas da vaga, cada um do tipo que a empresa escolheu. */
export function CamposDasPerguntas({
  perguntas,
  respostas,
  mudar,
  faltando = [],
}: {
  perguntas: Pergunta[];
  respostas: Respostas;
  mudar: (id: string, valor: string) => void;
  faltando?: string[];
}) {
  const base = useId();
  return (
    <div className="flex flex-col gap-4">
      {perguntas.map((p) => {
        const id = `${base}-${p.id}`;
        const erro = faltando.includes(p.id) ? "Responda esta pergunta." : undefined;
        const valor = respostas[p.id] ?? "";
        const rotulo = (
          <>
            {p.nome}
            {!p.obrigatoria && <span className="font-normal text-ink-muted"> (opcional)</span>}
          </>
        );
        if (p.tipo === "sim_nao" || p.tipo === "opcoes") {
          const opcoes =
            p.tipo === "sim_nao"
              ? [
                  { valor: "sim", nome: "Sim" },
                  { valor: "nao", nome: "Não" },
                ]
              : p.opcoes.map((o) => ({ valor: o, nome: o }));
          return (
            <fieldset key={p.id} className="flex flex-col gap-2" aria-invalid={erro ? true : undefined}>
              <legend className="mb-1 text-label">{rotulo}</legend>
              <div className="flex flex-wrap gap-2">
                {opcoes.map((o) => (
                  <label key={o.valor} className={pilula}>
                    <input
                      type="radio"
                      name={id}
                      value={o.valor}
                      checked={valor === o.valor}
                      onChange={() => mudar(p.id, o.valor)}
                      className="sr-only"
                    />
                    {o.nome}
                  </label>
                ))}
              </div>
              {erro && <MensagemErro>{erro}</MensagemErro>}
            </fieldset>
          );
        }
        return (
          <div key={p.id} className="flex flex-col gap-1.5">
            <label htmlFor={id} className="text-label">
              {rotulo}
            </label>
            <input
              id={id}
              value={valor}
              onChange={(e) => mudar(p.id, e.target.value)}
              inputMode={p.tipo === "numero" ? "decimal" : undefined}
              maxLength={p.tipo === "numero" ? 10 : 200}
              aria-invalid={erro ? true : undefined}
              className={`${classesEntrada} ${p.tipo === "numero" ? "max-w-40" : ""}`}
            />
            {erro && <MensagemErro>{erro}</MensagemErro>}
          </div>
        );
      })}
    </div>
  );
}

/** Depois de curtir: as respostas que a pessoa deu, com "Mudar respostas". */
export function SuasRespostas({
  anuncioId,
  perguntas,
  iniciais,
  claro = false,
}: {
  anuncioId: string;
  perguntas: Pergunta[];
  iniciais: Respostas;
  /** sobre o fundo verde do match */
  claro?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [respostas, setRespostas] = useState(iniciais);
  const [faltando, setFaltando] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const [pendente, iniciar] = useTransition();
  const semResposta = faltandoResponder(perguntas, iniciais).length > 0;

  function salvar() {
    const falta = faltandoResponder(perguntas, respostas);
    setFaltando(falta);
    if (falta.length) return;
    setErro(null);
    iniciar(async () => {
      const r = await chamarAcao(() => responderPerguntas(anuncioId, respostas));
      if (!r.ok) setErro(r.erro);
      else {
        setEditando(false);
        setSalvo(true);
      }
    });
  }

  return (
    <div className={`flex flex-col gap-3 rounded-md p-3 ${claro ? "bg-surface-200 text-ink" : "bg-surface-200"}`}>
      <p className="flex items-center gap-2 text-label">
        <MessageCircleQuestion aria-hidden className="size-4 shrink-0 text-ink-muted" />
        Suas respostas às perguntas da empresa
      </p>
      {editando ? (
        <>
          <CamposDasPerguntas
            perguntas={perguntas}
            respostas={respostas}
            mudar={(id, v) => setRespostas((r) => ({ ...r, [id]: v }))}
            faltando={faltando}
          />
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" variante="primario" onClick={salvar} disabled={pendente}>
              {pendente ? "Salvando…" : "Salvar respostas"}
            </Botao>
            <Botao
              tamanho="sm"
              variante="fantasma"
              onClick={() => {
                setRespostas(iniciais);
                setFaltando([]);
                setEditando(false);
              }}
            >
              Cancelar
            </Botao>
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
        </>
      ) : (
        <>
          {semResposta && (
            <p className="text-body-sm text-terra-text">
              Falta responder. A empresa vê as respostas junto da sua curtida.
            </p>
          )}
          <dl className="flex flex-col gap-1.5 text-body-sm">
            {perguntas.map((p) => (
              <div key={p.id}>
                <dt className="text-ink-muted">{p.nome}</dt>
                <dd className="font-semibold">{textoDaResposta(p, respostas[p.id]) || "Sem resposta"}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Botao tamanho="sm" variante="secundario" onClick={() => (setSalvo(false), setEditando(true))}>
              <Pencil aria-hidden />
              {semResposta ? "Responder" : "Mudar respostas"}
            </Botao>
            {salvo && (
              <span role="status" className="text-body-sm text-cerrado-text">
                Respostas salvas.
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
