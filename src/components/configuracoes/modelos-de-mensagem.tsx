"use client";

import { LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { apagarModeloMensagem, salvarModeloMensagem } from "@/lib/acoes/recrutamento";
import type { ModeloMensagem } from "@/lib/recrutamento";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";
import { AvisoSalvar } from "./comum";

/**
 * As mensagens prontas da conta: as que já vêm no Publike (só para ver) e as suas, para criar, mudar e apagar. Antes,
 * só dava para criar dentro do "Mandar mensagem" do quadro.
 */
export function ModelosDeMensagem({ modelos }: { modelos: ModeloMensagem[] }) {
  const [editando, setEditando] = useState<{ id?: string; nome: string; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const minhas = modelos.filter((m) => !m.pronto);
  const prontas = modelos.filter((m) => m.pronto);

  const salvar = () =>
    editando &&
    iniciar(async () => {
      const r = await chamarAcao(() => salvarModeloMensagem(editando.nome, editando.texto, editando.id));
      if (r.ok) setEditando(null);
      setAviso(r.ok ? { ok: true, texto: "Mensagem salva." } : { ok: false, texto: r.erro });
    });
  const apagar = (id: string) =>
    iniciar(async () => {
      const r = await chamarAcao(() => apagarModeloMensagem(id));
      setAviso(r.ok ? { ok: true, texto: "Mensagem apagada." } : { ok: false, texto: r.erro });
    });

  return (
    <div className="flex flex-col gap-3">
      {minhas.length > 0 && (
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface-100">
          {minhas.map((m) => (
            <li key={m.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 p-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-label">{m.nome}</p>
                <p className="line-clamp-2 text-body-sm text-ink-muted">{m.texto}</p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => (setAviso(null), setEditando({ id: m.id, nome: m.nome, texto: m.texto }))}
                  aria-label={`Mudar a mensagem ${m.nome}`}
                  className="inline-flex size-10 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
                >
                  <Pencil aria-hidden className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => apagar(m.id)}
                  aria-label={`Apagar a mensagem ${m.nome}`}
                  className="inline-flex size-10 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300 hover:text-ink"
                >
                  <Trash2 aria-hidden className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editando ? (
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3">
          <label htmlFor="modelo-nome" className="text-label">
            Nome
          </label>
          <input
            id="modelo-nome"
            value={editando.nome}
            maxLength={60}
            placeholder="Ex.: Documentos para a admissão"
            onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
            className={classesEntrada}
          />
          <label htmlFor="modelo-texto" className="text-label">
            Mensagem
          </label>
          <textarea
            id="modelo-texto"
            value={editando.texto}
            maxLength={1800}
            rows={5}
            onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
            className={`${classesEntrada} resize-y`}
          />
          <p className="text-caption text-ink-muted">{"{nome}, {vaga} e {empresa} são trocados na hora de mandar."}</p>
          <div className="flex flex-wrap gap-2">
            <Botao tamanho="sm" variante="primario" disabled={pendente} onClick={salvar}>
              {pendente && <LoaderCircle aria-hidden className="animate-spin" />}
              Salvar a mensagem
            </Botao>
            <Botao tamanho="sm" variante="fantasma" onClick={() => setEditando(null)}>
              Voltar
            </Botao>
          </div>
        </div>
      ) : (
        <Botao
          tamanho="sm"
          className="self-start"
          onClick={() => (setAviso(null), setEditando({ nome: "", texto: "Oi, {nome}! " }))}
        >
          <Plus aria-hidden />
          Nova mensagem pronta
        </Botao>
      )}
      <AvisoSalvar aviso={aviso} />

      {prontas.length > 0 && (
        <details className="rounded-md bg-surface-300 p-3">
          <summary className="cursor-pointer text-label">As que já vêm no Publike ({prontas.length})</summary>
          <ul className="mt-2 flex flex-col gap-2">
            {prontas.map((m) => (
              <li key={m.id} className="text-body-sm">
                <span className="flex items-center gap-2 text-label">
                  {m.nome}
                  <Selo variante="contorno">Pronta</Selo>
                </span>
                <span className="text-ink-muted">{m.texto}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
