"use client";

import { useActionState, useState, useTransition } from "react";
import { Botao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { editarGastoDivulgacao, salvarGastoDivulgacao } from "@/lib/acoes/painel-admin";
import type { EstadoForm } from "@/lib/tipos";

/** O gasto com anúncios de um mês e canal (Painel › Dinheiro). O canal com o mesmo nome da origem dá o custo por conta. */
export function FormGasto({ mesAtual, canais }: { mesAtual: string; canais: string[] }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarGastoDivulgacao, { ok: false });
  return (
    <form action={acao} className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-label">
        Mês
        <input type="month" name="mes" defaultValue={mesAtual} required className={`${classesEntrada} w-40`} />
      </label>
      <label className="flex flex-col gap-1 text-label">
        Canal (a origem das contas)
        <input
          name="canal"
          list="canais-gasto"
          required
          minLength={2}
          maxLength={40}
          className={`${classesEntrada} w-56`}
        />
        <datalist id="canais-gasto">
          {canais.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1 text-label">
        Gasto (R$)
        <input name="valor" inputMode="decimal" required placeholder="0,00" className={`${classesEntrada} w-32`} />
      </label>
      <Botao type="submit" variante="secundario" disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar"}
      </Botao>
      {(estado.erro || estado.mensagem) && (
        <p role="status" className={`w-full text-body-sm ${estado.erro ? "text-danger" : "text-cerrado-text"}`}>
          {estado.erro ?? estado.mensagem}
        </p>
      )}
    </form>
  );
}

export type LinhaGasto = { mes: string; canal: string; valor: number; contas: number };

const brl = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const valorEscrito = (n: number) => String(n).replace(".", ",");
const lerValor = (t: string) => Number(t.trim().replace(/\./g, "").replace(",", "."));

/** A tabela do gasto com anúncios, com Editar (valor e canal) e Remover (com Desfazer) em cada linha. */
export function TabelaGastos({ linhas }: { linhas: LinhaGasto[] }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [removido, setRemovido] = useState<LinhaGasto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pendente, comecar] = useTransition();
  const chave = (l: LinhaGasto) => `${l.mes}|${l.canal}`;

  const salvar = (l: LinhaGasto, canal: string, valor: number) =>
    comecar(async () => {
      const r = await editarGastoDivulgacao({ mes: l.mes, canalAntigo: l.canal, canal, valor });
      setAviso(r.erro ?? null);
      if (r.ok) setEditando(null);
    });
  const remover = (l: LinhaGasto) =>
    comecar(async () => {
      const r = await editarGastoDivulgacao({ mes: l.mes, canalAntigo: l.canal, canal: l.canal, valor: 0 });
      setAviso(r.erro ?? null);
      if (r.ok) setRemovido(l);
    });
  const desfazer = (l: LinhaGasto) =>
    comecar(async () => {
      const r = await editarGastoDivulgacao({ mes: l.mes, canalAntigo: l.canal, canal: l.canal, valor: l.valor });
      setAviso(r.erro ?? null);
      if (r.ok) setRemovido(null);
    });

  return (
    <div className="flex flex-col gap-2">
      {removido && (
        <p role="status" className="flex flex-wrap items-center gap-2 text-body-sm">
          Removido: {removido.canal}, {brl(removido.valor)}.
          <button
            type="button"
            onClick={() => desfazer(removido)}
            disabled={pendente}
            className="text-label underline underline-offset-2"
          >
            Desfazer
          </button>
        </p>
      )}
      {aviso && (
        <p role="alert" className="text-body-sm text-danger">
          {aviso}
        </p>
      )}
      {linhas.length > 0 && (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[36rem] text-body-sm tabular-nums">
            <thead>
              <tr className="border-b border-line text-left text-ink-muted">
                <th scope="col" className="py-2 pr-2 font-normal">
                  Mês
                </th>
                <th scope="col" className="py-2 pr-2 font-normal">
                  Canal
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Gasto
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Contas novas
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  Por conta
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-normal">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) =>
                editando === chave(l) ? (
                  <LinhaEditando
                    key={chave(l)}
                    l={l}
                    pendente={pendente}
                    onSalvar={(canal, valor) => salvar(l, canal, valor)}
                    onCancelar={() => setEditando(null)}
                  />
                ) : (
                  <tr key={chave(l)} className="border-b border-line last:border-0">
                    <td className="py-2 pr-2">{`${l.mes.slice(5, 7)}/${l.mes.slice(0, 4)}`}</td>
                    <td className="py-2 pr-2 break-all">{l.canal}</td>
                    <td className="py-2 text-right">{brl(l.valor)}</td>
                    <td className="py-2 text-right">{new Intl.NumberFormat("pt-BR").format(l.contas)}</td>
                    <td className="py-2 text-right">{l.contas ? brl(l.valor / l.contas) : "—"}</td>
                    <td className="py-2 pl-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setAviso(null);
                          setEditando(chave(l));
                        }}
                        disabled={pendente}
                        className="text-label underline underline-offset-2"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => remover(l)}
                        disabled={pendente}
                        className="ml-3 text-label text-danger underline underline-offset-2"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LinhaEditando({
  l,
  pendente,
  onSalvar,
  onCancelar,
}: {
  l: LinhaGasto;
  pendente: boolean;
  onSalvar: (canal: string, valor: number) => void;
  onCancelar: () => void;
}) {
  const [canal, setCanal] = useState(l.canal);
  const [valor, setValor] = useState(valorEscrito(l.valor));
  return (
    <tr className="border-b border-line bg-surface-300 last:border-0">
      <td className="py-2 pr-2">{`${l.mes.slice(5, 7)}/${l.mes.slice(0, 4)}`}</td>
      <td className="py-2 pr-2">
        <input
          aria-label="Canal"
          value={canal}
          onChange={(e) => setCanal(e.target.value)}
          maxLength={40}
          className={`${classesEntrada} w-full min-w-40`}
        />
      </td>
      <td className="py-2 text-right" colSpan={3}>
        <input
          aria-label="Gasto (R$)"
          inputMode="decimal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className={`${classesEntrada} w-32 text-right`}
        />
      </td>
      <td className="py-2 pl-3 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() => onSalvar(canal, lerValor(valor))}
          disabled={pendente}
          className="text-label underline underline-offset-2"
        >
          {pendente ? "Salvando…" : "Salvar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="ml-3 text-label text-ink-muted underline underline-offset-2"
        >
          Cancelar
        </button>
      </td>
    </tr>
  );
}
