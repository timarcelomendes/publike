"use client";

import { useMemo, useState } from "react";
import {
  diaDoHorario,
  horaDoHorario,
  HORAS_DO_SELETOR,
  horariosDaEscolha,
  nomeDaHora,
  proximosDias,
} from "@/lib/agenda-horarios";
import { classesChip } from "../painel/fluxo";
import { classesEntrada, Seletor } from "../ui/campo";

// O seletor dos horários da agenda (27/11/2026; Marcelo: "aqui deve ter um seletor, algo mais facilitado"): toca
// nos dias, escolhe das tantas às tantas e tira os horários que não servem. A conta dos horários fica em
// src/lib/agenda-horarios.ts (horariosDaEscolha), e o servidor confere a lista (horariosConferidos).

const FAIXAS = [
  { nome: "Manhã", ini: "08:00", fim: "12:00" },
  { nome: "Tarde", ini: "13:00", fim: "18:00" },
  { nome: "Dia todo", ini: "08:00", fim: "18:00" },
];

/** O estado do seletor e os horários escolhidos (sem os que a pessoa tirou). */
export function useEscolhaDeHorarios(agora: number, duracao: number) {
  const [dias, setDias] = useState<string[]>([]);
  const [ini, setIni] = useState("09:00");
  const [fim, setFim] = useState("12:00");
  const [tirados, setTirados] = useState<Set<string>>(() => new Set());
  const todos = useMemo(
    () => horariosDaEscolha(dias, ini, fim, duracao, new Date(agora)),
    [dias, ini, fim, duracao, agora],
  );
  const horarios = useMemo(
    () => todos.filter((h) => !tirados.has(h)),
    [todos, tirados],
  );
  return {
    agora,
    dias,
    ini,
    fim,
    todos,
    tirados,
    horarios,
    alternarDia: (d: string) =>
      setDias((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d])),
    mudarFaixa: (de: string, ate: string) => {
      setIni(de);
      setFim(ate);
    },
    alternarHorario: (h: string) =>
      setTirados((x) => {
        const n = new Set(x);
        if (n.has(h)) n.delete(h);
        else n.add(h);
        return n;
      }),
    limpar: () => {
      setDias([]);
      setTirados(new Set());
    },
  };
}

export type EscolhaDeHorarios = ReturnType<typeof useEscolhaDeHorarios>;

export function SeletorDeHorarios({
  escolha: e,
  dias = 14,
  noPainel = false,
}: {
  escolha: EscolhaDeHorarios;
  dias?: number;
  noPainel?: boolean;
}) {
  const opcoes = useMemo(
    () => proximosDias(new Date(e.agora), dias),
    [e.agora, dias],
  );
  const porDia = new Map<string, string[]>();
  for (const h of e.todos)
    porDia.set(diaDoHorario(h), [...(porDia.get(diaDoHorario(h)) ?? []), h]);
  const faixaInvalida = e.fim <= e.ini;

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label">
          {noPainel
            ? "1. Os dias que você pode entrevistar"
            : "1. Os dias das entrevistas"}
        </legend>
        <div className="flex flex-wrap gap-2">
          {opcoes.map((d) => {
            const ativo = e.dias.includes(d.dia);
            return (
              <button
                key={d.dia}
                type="button"
                aria-pressed={ativo}
                onClick={() => e.alternarDia(d.dia)}
                className={classesChip(ativo, false, d.domingo && !ativo)}
              >
                {d.rotulo}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label">2. O horário</legend>
        <div className="flex flex-wrap items-center gap-2">
          {FAIXAS.map((f) => {
            const ativo = e.ini === f.ini && e.fim === f.fim;
            return (
              <button
                key={f.nome}
                type="button"
                aria-pressed={ativo}
                onClick={() => e.mudarFaixa(f.ini, f.fim)}
                className={classesChip(ativo)}
              >
                {f.nome} ({nomeDaHora(f.ini)} às {nomeDaHora(f.fim)})
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-body-sm">
          <label htmlFor="agenda-ini">Das</label>
          <Seletor
            id="agenda-ini"
            value={e.ini}
            onChange={(x) => e.mudarFaixa(x.target.value, e.fim)}
            className={`${classesEntrada} w-auto`}
          >
            {HORAS_DO_SELETOR.slice(0, -1).map((h) => (
              <option key={h} value={h}>
                {nomeDaHora(h)}
              </option>
            ))}
          </Seletor>
          <label htmlFor="agenda-fim">às</label>
          <Seletor
            id="agenda-fim"
            value={e.fim}
            onChange={(x) => e.mudarFaixa(e.ini, x.target.value)}
            className={`${classesEntrada} w-auto`}
          >
            {HORAS_DO_SELETOR.slice(1).map((h) => (
              <option key={h} value={h}>
                {nomeDaHora(h)}
              </option>
            ))}
          </Seletor>
        </div>
        {faixaInvalida && (
          <p className="text-body-sm text-danger">
            O fim tem que ser depois do começo.
          </p>
        )}
      </fieldset>

      <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3">
        <p className="text-label">
          {e.dias.length === 0
            ? "3. Escolha os dias para ver os horários"
            : e.horarios.length === 0
              ? "3. Nenhum horário nesses dias"
              : `3. ${e.horarios.length === 1 ? "1 horário" : `${e.horarios.length} horários`} na agenda`}
        </p>
        {e.dias.length > 0 && e.todos.length > 0 && (
          <p className="text-body-sm text-ink-muted">
            Toque num horário para tirar (o almoço, uma reunião).
          </p>
        )}
        {[...porDia].map(([dia, horas]) => (
          <div key={dia} className="flex flex-col gap-1.5">
            <span className="text-body-sm font-semibold">{dia}</span>
            <div className="flex flex-wrap gap-1.5">
              {horas.map((h) => {
                const fora = e.tirados.has(h);
                return (
                  <button
                    key={h}
                    type="button"
                    aria-pressed={!fora}
                    aria-label={`${dia} às ${horaDoHorario(h)}${fora ? ", fora da agenda" : ""}`}
                    onClick={() => e.alternarHorario(h)}
                    className={`min-h-9 rounded-md border px-2.5 text-body-sm transition-colors ${
                      fora
                        ? "border-line bg-transparent text-ink-muted line-through"
                        : "border-cerrado-text bg-cerrado/10 text-cerrado-text"
                    }`}
                  >
                    {horaDoHorario(h)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
