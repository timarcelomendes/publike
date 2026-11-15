"use client";

import { Eye, Printer } from "lucide-react";
import { useState, useTransition } from "react";
import { mudarCopia } from "@/lib/acoes/rota-curriculo";
import { deslocamentoProvavel } from "@/lib/deslocamento";
import { distanciaCurta, type CopiaDaRota } from "@/lib/rota-curriculo";
import { classesBotao } from "../ui/botao";
import { QueroTrabalharAqui } from "./quero-trabalhar-aqui";
import { bairroDaReceita } from "@/lib/cnpj";

/** O botão de imprimir (a página inteira: a folha da rota e as cópias). */
export function BotaoImprimir({ texto = "Imprimir as cópias" }: { texto?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={classesBotao("primario")}>
      <Printer aria-hidden />
      {texto}
    </button>
  );
}

/** O checklist da rota: "Entreguei", quem abriu o QR code e o "Desligar a página" de cada cópia. */
export function ChecklistDaRota({ copias }: { copias: CopiaDaRota[] }) {
  return (
    <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
      {copias.map((c, i) => (
        <ItemDaRota key={c.codigo} copia={c} ordem={i + 1} />
      ))}
    </ol>
  );
}

function ItemDaRota({ copia, ordem }: { copia: CopiaDaRota; ordem: number }) {
  const [entregue, setEntregue] = useState(Boolean(copia.entregue_em));
  const [desligada, setDesligada] = useState(copia.desligada);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  function mudar(m: { entregue?: boolean; desligada?: boolean }) {
    iniciar(async () => {
      setErro(null);
      const r = await mudarCopia(copia.codigo, m);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      if (m.entregue !== undefined) setEntregue(m.entregue);
      if (m.desligada !== undefined) setDesligada(m.desligada);
    });
  }

  return (
    <li className="flex flex-col gap-2 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-surface-300 text-label tabular-nums">
          {ordem}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-label text-ink">{copia.nome}</p>
          <p className="text-body-sm text-ink-muted">
            {[copia.endereco, copia.bairro && bairroDaReceita(copia.bairro), copia.cidade].filter(Boolean).join(", ")}
            {copia.distancia_m != null && (
              <> ({distanciaCurta(copia.distancia_m)} de casa, {deslocamentoProvavel(copia.distancia_m / 1000).texto})</>
            )}
          </p>
          {copia.aberturas > 0 && (
            <p className="mt-1 inline-flex items-center gap-1 text-body-sm font-semibold text-cerrado-text">
              <Eye aria-hidden className="size-4" />
              Abriram o seu currículo {copia.aberturas === 1 ? "1 vez" : `${copia.aberturas} vezes`}
            </p>
          )}
        </div>
      </div>
      <div className="pl-10">
        <QueroTrabalharAqui cnpj={copia.cnpj} nome={copia.nome} />
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pl-10">
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-body-sm text-ink">
          <input
            type="checkbox"
            checked={entregue}
            disabled={pendente}
            onChange={(e) => mudar({ entregue: e.target.checked })}
            className="size-5 accent-[var(--color-ink)]"
          />
          Entreguei
        </label>
        <button
          type="button"
          disabled={pendente}
          onClick={() => mudar({ desligada: !desligada })}
          className="text-body-sm text-ink-muted underline underline-offset-2"
        >
          {desligada ? "Ligar a página do QR code" : "Desligar a página do QR code"}
        </button>
      </div>
      {desligada && <p className="pl-10 text-body-sm text-ink-muted">Quem escanear o QR code desta cópia não vê o currículo.</p>}
      {erro && (
        <p role="alert" className="pl-10 text-body-sm text-danger">
          {erro}
        </p>
      )}
    </li>
  );
}
