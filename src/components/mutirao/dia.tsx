"use client";

import { Check, Printer, X } from "lucide-react";
import Link from "next/link";
import { mudarEntrevista } from "@/lib/acoes/recrutamento";
import { horaDoHorario, type PessoaDoMutirao } from "@/lib/mutirao";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

const ESTADO: Record<string, { nome: string; tom: "match" | "aviso" | "contorno" | "perigo" }> = {
  confirmada: { nome: "Vem", tom: "aviso" },
  marcada: { nome: "Vem", tom: "aviso" },
  realizada: { nome: "Chegou", tom: "match" },
  faltou: { nome: "Faltou", tom: "perigo" },
  escolher: { nome: "Ainda não escolheu", tom: "contorno" },
  cancelada: { nome: "Não pode ir", tom: "contorno" },
  remarcar: { nome: "Pediu outro horário", tom: "contorno" },
};

/**
 * O dia do mutirão: as pessoas por horário, com "Chegou" e "Faltou"; a ficha de cada uma abre na Caixa de entrada,
 * com Contratar e Não seguiu. "Imprimir a lista" leva a lista para a recepção.
 */
export function DiaDoMutirao({ pessoas }: { pessoas: PessoaDoMutirao[] }) {
  const comHorario = pessoas.filter((p) => !["escolher", "cancelada"].includes(p.situacao));
  const semHorario = pessoas.filter((p) => p.situacao === "escolher");
  const naoVao = pessoas.filter((p) => p.situacao === "cancelada");
  const porHorario = [...new Set(comHorario.map((p) => p.quando))].sort();
  return (
    <div className="flex flex-col gap-4">
      <Botao variante="secundario" tamanho="sm" className="self-start print:hidden" onClick={() => window.print()}>
        <Printer aria-hidden />
        Imprimir a lista
      </Botao>
      {porHorario.length === 0 && (
        <p className="text-body-sm text-ink-muted">Ninguém escolheu horário ainda.</p>
      )}
      {porHorario.map((h) => (
        <section key={h} aria-label={`Às ${horaDoHorario(h)}`} className="flex flex-col gap-2 break-inside-avoid">
          <h4 className="text-label">{horaDoHorario(h)}</h4>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {comHorario
              .filter((p) => p.quando === h)
              .map((p) => (
                <Linha key={p.entrevista} p={p} />
              ))}
          </ul>
        </section>
      ))}
      {semHorario.length > 0 && (
        <section aria-label="Ainda não escolheram" className="flex flex-col gap-2 print:hidden">
          <h4 className="text-label">Ainda não escolheram ({semHorario.length})</h4>
          <p className="text-body-sm text-ink-muted">{semHorario.map((p) => p.nome).join(", ")}</p>
        </section>
      )}
      {naoVao.length > 0 && (
        <section aria-label="Não podem ir" className="flex flex-col gap-2 print:hidden">
          <h4 className="text-label">Não podem ir ({naoVao.length})</h4>
          <p className="text-body-sm text-ink-muted">{naoVao.map((p) => p.nome).join(", ")}</p>
        </section>
      )}
    </div>
  );
}

function Linha({ p }: { p: PessoaDoMutirao }) {
  const { rodar, pendente, mensagem } = useAcao();
  const e = ESTADO[p.situacao] ?? ESTADO.confirmada;
  const aberta = p.situacao === "confirmada" || p.situacao === "marcada";
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="min-w-0">
          <span className="text-label">{p.nome}</span>
          <span className="block text-body-sm text-ink-muted">{p.vaga}</span>
        </p>
        <span className="flex flex-wrap items-center gap-2">
          {p.etapa === "contratado" && <Selo variante="match">Contratado</Selo>}
          <Selo variante={e.tom}>{e.nome}</Selo>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {aberta && (
          <>
            <Botao tamanho="sm" variante="primario" disabled={pendente} onClick={() => rodar(() => mudarEntrevista(p.entrevista, "realizada"))}>
              <Check aria-hidden />
              Chegou
            </Botao>
            <Botao tamanho="sm" variante="secundario" disabled={pendente} onClick={() => rodar(() => mudarEntrevista(p.entrevista, "faltou"))}>
              <X aria-hidden />
              Faltou
            </Botao>
          </>
        )}
        <Link
          href={`/painel/caixa?c=${p.anuncio}:${p.perfil}`}
          className="text-body-sm font-semibold text-terra-text underline underline-offset-2"
        >
          {p.situacao === "realizada" ? "Abrir a ficha: contratar ou não seguir" : "Abrir a ficha"}
        </Link>
      </div>
      {mensagem}
    </li>
  );
}
