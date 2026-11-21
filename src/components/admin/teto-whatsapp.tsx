"use client";

import { useState, useTransition } from "react";
import { salvarTetoWhatsapp } from "@/lib/acoes/admin-teto-whatsapp";
import { formatarNumero } from "@/lib/formato";
import { classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// Admin › WhatsApp › Conversas: o teto do mês do atendimento (migração 20270808120000).

export function TetoWhatsapp({ teto, enviadas }: { teto: number; enviadas: number }) {
  const [pendente, iniciar] = useTransition();
  const [n, setN] = useState(String(teto));
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  const pct = teto ? Math.min(100, Math.round((enviadas / teto) * 100)) : 0;
  const economico = teto > 0 && enviadas >= teto;
  return (
    <form
      className="flex flex-col gap-3 border-t border-line pt-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        iniciar(async () => {
          const r = await salvarTetoWhatsapp(n);
          setResposta(r.ok ? { ok: true, texto: r.mensagem ?? "Salvo." } : { ok: false, texto: r.erro });
        });
      }}
    >
      <div className="flex flex-col gap-1.5">
        <p className="text-label">Respostas neste mês</p>
        <p className="text-body-sm">
          <span className="tabular-nums">{formatarNumero(enviadas)}</span>
          {teto ? ` de ${formatarNumero(teto)} (${pct}%)` : " (sem teto)"}
          {economico ? " · modo econômico ligado" : ""}
        </p>
        {teto > 0 && (
          <span className="h-2 w-full max-w-md rounded-pill bg-surface-300" aria-hidden>
            <span
              className={`block h-2 rounded-pill ${pct >= 80 ? "bg-terra" : "bg-ink"}`}
              style={{ width: `${pct}%` }}
            />
          </span>
        )}
      </div>
      <label className="flex max-w-xs flex-col gap-1 text-body-sm">
        <span className="text-label">Teto de respostas por mês</span>
        <input inputMode="numeric" className={classesEntrada} value={n} onChange={(ev) => setN(ev.target.value)} />
        <span className="text-caption text-ink-muted">
          Desde 1º/10/2026, a Meta cobra cada mensagem que o Publike manda (cerca de US$ 0,0068 no Brasil), menos nas 72
          horas depois de a pessoa chegar por um anúncio de clique para o WhatsApp. Contam as respostas do robô e da equipe
          e os códigos de entrar pelo WhatsApp (os códigos saem mesmo no teto). Com 80% do teto, chega um e-mail. No teto,
          quem procura trabalho recebe uma mensagem só por dia, com o link das vagas e sem a IA; quem contrata segue normal.
          0 desliga o teto.
        </span>
      </label>
      <div>
        <button type="submit" disabled={pendente} className={classesBotao("secundario", "sm")}>
          {pendente ? "Salvando…" : "Salvar o teto"}
        </button>
      </div>
      {resposta && (
        <p role="status" className={`text-body-sm ${resposta.ok ? "text-ink" : "text-danger"}`}>
          {resposta.texto}
        </p>
      )}
    </form>
  );
}
