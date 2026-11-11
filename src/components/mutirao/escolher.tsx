"use client";

import { CalendarCheck } from "lucide-react";
import { escolherHorarioDoMutirao, naoPossoIrAoMutirao } from "@/lib/acoes/mutirao";
import { horaDoHorario } from "@/lib/mutirao";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

/** A pessoa chamada escolhe um dos horários que ainda têm lugar (ou troca), ou diz que não pode ir. */
export function EscolherHorarioDoMutirao({
  entrevista,
  horarios,
  atual,
}: {
  entrevista: string;
  horarios: string[];
  /** o horário já escolhido (para trocar) */
  atual: string | null;
}) {
  const { rodar, pendente, mensagem } = useAcao();
  const opcoes = horarios.filter((h) => h !== atual);
  return (
    <div className="flex flex-col gap-3">
      {opcoes.length ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Horários com lugar">
          {opcoes.map((h) => (
            <Botao
              key={h}
              tamanho="sm"
              variante={atual ? "secundario" : "primario"}
              disabled={pendente}
              onClick={() => rodar(() => escolherHorarioDoMutirao(entrevista, h))}
            >
              <CalendarCheck aria-hidden />
              {horaDoHorario(h)}
            </Botao>
          ))}
        </div>
      ) : (
        <p className="text-body-sm text-ink-muted">
          {atual ? "Os outros horários já estão cheios." : "Os horários já estão todos cheios."}
        </p>
      )}
      <Botao
        tamanho="sm"
        variante="fantasma"
        className="self-start"
        disabled={pendente}
        onClick={() => rodar(() => naoPossoIrAoMutirao(entrevista))}
      >
        Não posso ir
      </Botao>
      {mensagem}
    </div>
  );
}
