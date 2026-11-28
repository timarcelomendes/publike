"use client";

import { useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { chamarDaReserva } from "@/lib/acoes/curtidas";
import { Botao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

/** "Preciso de N agora": chama as N primeiras da reserva (a ordem vem do servidor). */
export function ChamarDaReserva({
  anuncioId,
  ordem,
}: {
  anuncioId: string;
  ordem: string[];
}) {
  const [quantas, setQuantas] = useState(Math.min(5, ordem.length));
  const [rodando, iniciar] = useTransition();
  const [resposta, setResposta] = useState<{
    ok: boolean;
    texto: string;
  } | null>(null);

  function chamar() {
    setResposta(null);
    const n = Math.max(1, Math.min(quantas, ordem.length));
    iniciar(async () => {
      const r = await chamarAcao(() =>
        chamarDaReserva(anuncioId, ordem.slice(0, n)),
      );
      setResposta(
        r.ok
          ? { ok: true, texto: r.mensagem ?? "Pronto." }
          : { ok: false, texto: r.erro },
      );
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="quantas-da-reserva"
          className="text-body-sm font-semibold"
        >
          Preciso de
        </label>
        <div className="w-20">
          <input
            id="quantas-da-reserva"
            type="number"
            inputMode="numeric"
            min={1}
            max={ordem.length}
            value={quantas}
            onChange={(e) => setQuantas(Number(e.target.value) || 1)}
            className={classesEntrada}
          />
        </div>
        <span className="text-body-sm">
          {quantas === 1 ? "pessoa agora" : "pessoas agora"}
        </span>
        <Botao variante="primario" onClick={chamar} disabled={rodando}>
          {rodando ? "Chamando…" : "Chamar da reserva"}
        </Botao>
      </div>
      <p className="text-body-sm text-ink-muted">
        Cada uma recebe “abriu a vaga: ainda tem interesse?”. Restam{" "}
        {ordem.length} sem chamar.
      </p>
      {resposta && (
        <p
          role="status"
          className={`text-body-sm ${resposta.ok ? "text-cerrado-text" : "text-danger"}`}
        >
          {resposta.texto}
        </p>
      )}
    </div>
  );
}
