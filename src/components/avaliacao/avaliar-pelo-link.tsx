"use client";

import { ListChecks } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { avaliarPeloLink } from "@/lib/acoes/avaliacao-time";
import { RECOMENDACOES, type Competencia, type Recomendacao } from "@/lib/avaliacao-time";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// o mesmo nome guardado do "Seu nome" da resposta (resposta-cliente.tsx)
const CHAVE_NOME = "publike_finalistas_quem";

function lerNome() {
  try {
    return localStorage.getItem(CHAVE_NOME) ?? "";
  } catch {
    return "";
  }
}

/** O gestor avalia o finalista pelos pontos da ficha da vaga (opcional; migração 20270107120000). */
export function AvaliarPeloLink({
  token,
  id,
  nome,
  competencias,
}: {
  token: string;
  id: string;
  nome: string;
  competencias: Competencia[];
}) {
  const [aberto, setAberto] = useState(false);
  const [quem, setQuem] = useState("");
  const [notas, setNotas] = useState<Record<string, number>>({});
  const [recomendacao, setRecomendacao] = useState<Recomendacao | null>(null);
  const [comentario, setComentario] = useState("");
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const primeiro = nome.split(" ")[0];

  if (!aberto) {
    return (
      <Botao
        tamanho="sm"
        variante="fantasma"
        className="self-start"
        data-nao-imprimir
        onClick={() => {
          setQuem(lerNome());
          setAberto(true);
        }}
      >
        <ListChecks aria-hidden />
        Avaliar {primeiro} ponto a ponto (opcional)
      </Botao>
    );
  }
  return (
    <section className="flex flex-col gap-3 rounded-md border border-line p-4 text-body-sm" data-nao-imprimir>
      <p className="text-label">Avaliação de {primeiro}</p>
      <ul className="flex flex-col gap-3">
        {competencias.map((c) => (
          <li key={c.id} className="flex flex-col gap-1.5">
            <span>{c.nome}</span>
            <div role="radiogroup" aria-label={c.nome} className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={notas[c.id] === n}
                  aria-label={`${c.nome}: ${n}`}
                  onClick={() => setNotas((x) => ({ ...x, [c.id]: n }))}
                  className={`inline-flex size-10 items-center justify-center rounded-md border text-label tabular-nums ${
                    notas[c.id] === n ? "border-ink bg-ink text-surface-100" : "border-line bg-surface-100"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-label">Recomendação</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(RECOMENDACOES) as Recomendacao[]).map((r) => (
            <label
              key={r}
              className="inline-flex min-h-10 cursor-pointer items-center rounded-pill border border-line bg-surface-300 px-3.5 text-label has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-surface-100 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
            >
              <input
                type="radio"
                name={`rec-link-${id}`}
                checked={recomendacao === r}
                onChange={() => setRecomendacao(r)}
                className="sr-only"
              />
              {RECOMENDACOES[r].nome}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`com-link-${id}`}>Comentário (opcional)</label>
        <textarea
          id={`com-link-${id}`}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          rows={2}
          maxLength={1000}
          className={`${classesEntrada} resize-y`}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`quem-link-${id}`}>Seu nome</label>
        <input
          id={`quem-link-${id}`}
          value={quem}
          onChange={(e) => setQuem(e.target.value)}
          maxLength={80}
          autoComplete="name"
          className={classesEntrada}
        />
      </div>
      {aviso && (
        <p role={aviso.ok ? "status" : "alert"} className={aviso.ok ? "text-cerrado-text" : "text-danger"}>
          {aviso.texto}
        </p>
      )}
      <Botao
        tamanho="sm"
        variante="primario"
        className="self-start"
        disabled={pendente}
        onClick={() =>
          iniciar(async () => {
            setAviso(null);
            if (!recomendacao) return setAviso({ ok: false, texto: "Escolha: Seguir, Talvez ou Não seguir." });
            const r = await chamarAcao(() => avaliarPeloLink(token, id, { quem, notas, recomendacao, comentario }));
            setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Avaliação enviada." } : { ok: false, texto: r.erro });
            if (r.ok) {
              try {
                localStorage.setItem(CHAVE_NOME, quem.trim());
              } catch {}
            }
          })
        }
      >
        {pendente ? "Enviando…" : "Enviar a avaliação"}
      </Botao>
    </section>
  );
}
