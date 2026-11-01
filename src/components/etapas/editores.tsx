"use client";

import { Plus, Save, X } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarEtapasProprias, salvarHorariosLivres } from "@/lib/acoes/etapas-proprias";
import {
  BASES,
  DIAS_DA_SEMANA,
  MAX_ETAPAS_PROPRIAS,
  type BaseDaEtapa,
  type EtapaPropria,
  type FaixaLivre,
} from "@/lib/etapas-proprias";
import { Botao } from "../ui/botao";
import { classesEntrada, Seletor } from "../ui/campo";

function Aviso({ a }: { a: { ok: boolean; texto: string } | null }) {
  if (!a) return null;
  return (
    <p role={a.ok ? "status" : "alert"} className={`text-body-sm ${a.ok ? "text-cerrado-text" : "text-danger"}`}>
      {a.texto}
    </p>
  );
}

/** As etapas próprias da conta: o nome e depois de qual etapa de hoje ela fica (até 6). */
export function EditorEtapas({ inicial }: { inicial: EtapaPropria[] }) {
  const [lista, setLista] = useState<{ id: string | null; nome: string; base: BaseDaEtapa }[]>(inicial);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {lista.length === 0 && (
        <p className="text-body-sm text-ink-muted">
          Nenhuma ainda. O quadro usa as etapas de sempre: Novos, Em análise, Entrevista, Contratados e Não seguiu.
        </p>
      )}
      <ol className="flex flex-col gap-2">
        {lista.map((e, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <input
              aria-label={`Nome da etapa ${i + 1}`}
              value={e.nome}
              maxLength={30}
              placeholder="Ex.: Teste técnico"
              onChange={(ev) => setLista((l) => l.map((x, j) => (j === i ? { ...x, nome: ev.target.value } : x)))}
              className={`${classesEntrada} min-w-0 flex-1`}
            />
            <Seletor
              aria-label={`Depois de qual etapa a ${i + 1} fica`}
              value={e.base}
              onChange={(ev) =>
                setLista((l) => l.map((x, j) => (j === i ? { ...x, base: ev.target.value as BaseDaEtapa } : x)))
              }
              className={classesEntrada}
              envoltorio="w-60"
            >
              {(Object.keys(BASES) as BaseDaEtapa[]).map((b) => (
                <option key={b} value={b}>
                  Depois de {BASES[b]}
                </option>
              ))}
            </Seletor>
            <button
              type="button"
              onClick={() => setLista((l) => l.filter((_, j) => j !== i))}
              aria-label={`Tirar a etapa ${i + 1}`}
              className="inline-flex size-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        {lista.length < MAX_ETAPAS_PROPRIAS && (
          <Botao
            tamanho="sm"
            variante="fantasma"
            onClick={() => setLista((l) => [...l, { id: null, nome: "", base: "analise" }])}
          >
            <Plus aria-hidden />
            Mais uma etapa
          </Botao>
        )}
        <Botao
          tamanho="sm"
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setAviso(null);
              const r = await chamarAcao(() => salvarEtapasProprias(lista.filter((e) => e.nome.trim())));
              setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
            })
          }
        >
          <Save aria-hidden />
          {pendente ? "Salvando…" : "Salvar as etapas"}
        </Botao>
      </div>
      <Aviso a={aviso} />
    </div>
  );
}

/** Os horários da semana em que a conta entrevista. */
export function EditorHorarios({ inicial }: { inicial: FaixaLivre[] }) {
  const [faixas, setFaixas] = useState<FaixaLivre[]>(inicial);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const mudar = (i: number, m: Partial<FaixaLivre>) =>
    setFaixas((l) => l.map((f, j) => (j === i ? { ...f, ...m } : f)));
  return (
    <div className="flex flex-col gap-3">
      {faixas.length === 0 && <p className="text-body-sm text-ink-muted">Nenhum horário ainda.</p>}
      <ul className="flex flex-col gap-2">
        {faixas.map((f, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2 text-body-sm">
            <Seletor
              aria-label={`Dia da faixa ${i + 1}`}
              value={String(f.dia)}
              onChange={(e) => mudar(i, { dia: Number(e.target.value) })}
              className={classesEntrada}
              envoltorio="w-36"
            >
              {DIAS_DA_SEMANA.map((d, n) => (
                <option key={d} value={n}>
                  {d}
                </option>
              ))}
            </Seletor>
            <span>das</span>
            <input
              type="time"
              aria-label={`Começo da faixa ${i + 1}`}
              value={f.de}
              onChange={(e) => mudar(i, { de: e.target.value })}
              className={`${classesEntrada} w-32!`}
            />
            <span>às</span>
            <input
              type="time"
              aria-label={`Fim da faixa ${i + 1}`}
              value={f.ate}
              onChange={(e) => mudar(i, { ate: e.target.value })}
              className={`${classesEntrada} w-32!`}
            />
            <button
              type="button"
              onClick={() => setFaixas((l) => l.filter((_, j) => j !== i))}
              aria-label={`Tirar a faixa ${i + 1}`}
              className="inline-flex size-10 items-center justify-center rounded-md text-ink-muted hover:bg-surface-300 hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {faixas.length < 14 && (
          <Botao
            tamanho="sm"
            variante="fantasma"
            onClick={() => setFaixas((l) => [...l, { dia: 2, de: "14:00", ate: "17:00" }])}
          >
            <Plus aria-hidden />
            Mais um horário
          </Botao>
        )}
        <Botao
          tamanho="sm"
          variante="primario"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              setAviso(null);
              const r = await chamarAcao(() => salvarHorariosLivres(faixas));
              setAviso(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
            })
          }
        >
          <Save aria-hidden />
          {pendente ? "Salvando…" : "Salvar os horários"}
        </Botao>
      </div>
      <Aviso a={aviso} />
    </div>
  );
}
