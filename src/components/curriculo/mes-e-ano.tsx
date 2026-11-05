"use client";

import { useState } from "react";
import { classesEntrada, MensagemErro, Seletor } from "../ui/campo";

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];
const MES = /^\d{4}-\d{2}$/;
/** Até quantos anos para trás dá para escolher. */
const ANOS_PARA_TRAS = 60;

/**
 * O mês e o ano em duas listas ("Entrou em: fevereiro · 2023"), no lugar do campo de mês do navegador, que no
 * Firefox e no Safari do computador vira uma caixa de texto. O valor é "AAAA-MM" ou "" (sem data: as datas do
 * currículo são opcionais). Escolheu só o mês ou só o ano: a lista guarda e pede o outro.
 */
export function MesEAno({
  id,
  legenda,
  rotuloMes,
  rotuloAno,
  valor,
  aoMudar,
  min,
  max,
  erro,
  opcional = true,
}: {
  /** os ids das listas: `${id}-mes` e `${id}-ano` */
  id: string;
  legenda: string;
  rotuloMes: string;
  rotuloAno: string;
  valor: string;
  aoMudar: (valor: string) => void;
  /** "AAAA-MM": antes disso, não dá para escolher */
  min?: string;
  /** "AAAA-MM": depois disso, não dá para escolher (o mês de hoje) */
  max: string;
  erro?: string;
  opcional?: boolean;
}) {
  // só o mês ou só o ano escolhido (o valor ainda não vale)
  const [pela, setPela] = useState<{ ano: string; mes: string } | null>(null);
  const [anoValor, mesValor] = MES.test(valor) ? valor.split("-") : ["", ""];
  const ano = pela?.ano ?? anoValor;
  const mes = pela?.mes ?? mesValor;
  const anoMax = Number(max.slice(0, 4));
  const anoMin = min && MES.test(min) ? Number(min.slice(0, 4)) : anoMax - ANOS_PARA_TRAS;
  const anos = Array.from({ length: anoMax - Math.min(anoMin, anoMax - ANOS_PARA_TRAS) + 1 }, (_, i) => anoMax - i);

  function mudar(novoAno: string, novoMes: string) {
    if (novoAno && novoMes) {
      setPela(null);
      aoMudar(`${novoAno}-${novoMes}`);
    } else {
      setPela({ ano: novoAno, mes: novoMes });
      if (valor) aoMudar("");
    }
  }

  const fora = (a: string, m: string) => {
    const v = `${a}-${m}`;
    return v > max || Boolean(min && MES.test(min) && v < min);
  };
  const metade = Boolean(pela && (pela.ano || pela.mes) && !(pela.ano && pela.mes));
  const ajuda = metade ? `${id}-ajuda` : undefined;

  return (
    <fieldset className="flex min-w-0 flex-col gap-1.5" aria-describedby={ajuda}>
      <legend className="mb-1.5 text-label">
        {legenda}
        {opcional && <span className="font-normal text-ink-muted"> (opcional)</span>}
      </legend>
      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-2">
        <Seletor
          id={`${id}-mes`}
          aria-label={rotuloMes}
          value={mes}
          onChange={(e) => mudar(ano, e.target.value)}
          aria-invalid={erro ? true : undefined}
          className={classesEntrada}
        >
          <option value="">Mês</option>
          {MESES.map((nome, i) => {
            const m = String(i + 1).padStart(2, "0");
            return (
              <option key={m} value={m} disabled={Boolean(ano) && fora(ano, m)}>
                {nome}
              </option>
            );
          })}
        </Seletor>
        <Seletor
          id={`${id}-ano`}
          aria-label={rotuloAno}
          value={ano}
          onChange={(e) => mudar(e.target.value, mes)}
          aria-invalid={erro ? true : undefined}
          className={classesEntrada}
        >
          <option value="">Ano</option>
          {anos.map((a) => (
            <option key={a} value={String(a)} disabled={a < anoMin || a > anoMax}>
              {a}
            </option>
          ))}
        </Seletor>
      </div>
      {metade && (
        <p id={ajuda} className="text-body-sm text-ink-muted">
          Escolha {pela?.ano ? "o mês" : "o ano"} também.
        </p>
      )}
      {erro && <MensagemErro>{erro}</MensagemErro>}
    </fieldset>
  );
}
