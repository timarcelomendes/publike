"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { salvarConviteInstagram } from "@/lib/acoes/admin-instagram-whatsapp";
import { classesBotao } from "../ui/botao";
import { classesEntrada } from "../ui/campo";

// Admin › WhatsApp › Conversas: o convite do Instagram (migração 20270911120000).

export function InstagramWhatsapp({ ligado: ligadoAntes, minutos: minutosAntes }: { ligado: boolean; minutos: number }) {
  const [pendente, iniciar] = useTransition();
  const [ligado, setLigado] = useState(ligadoAntes);
  const [minutos, setMinutos] = useState(String(minutosAntes));
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <form
      className="flex flex-col gap-3 border-t border-line pt-4"
      onChange={() => setResposta(null)}
      onSubmit={(ev) => {
        ev.preventDefault();
        iniciar(async () => {
          const r = await salvarConviteInstagram(ligado, minutos);
          setResposta(r.ok ? { ok: true, texto: r.mensagem } : { ok: false, texto: r.erro });
        });
      }}
    >
      <p className="text-label">Convite do Instagram</p>
      <p className="text-caption text-ink-muted">
        Quem procura trabalho e recebeu vagas, sem responder depois, recebe uma vez só o convite para seguir o Publike no
        Instagram, com o botão. Só na janela das 24 horas, das 8h às 21h, e fora do teto do mês.
      </p>
      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" checked={ligado} onChange={(ev) => setLigado(ev.target.checked)} className="size-5" />
        Mandar o convite
      </label>
      <label className="flex max-w-xs flex-col gap-1 text-body-sm">
        <span className="text-label">Minutos depois da última mensagem</span>
        <input inputMode="numeric" className={classesEntrada} value={minutos} onChange={(ev) => setMinutos(ev.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendente} className={classesBotao("secundario", "sm")}>
          {pendente ? "Salvando…" : "Salvar o convite"}
        </button>
        {resposta && (
          <p role="status" className={`inline-flex items-center gap-1 text-body-sm ${resposta.ok ? "text-cerrado-text" : "text-danger"}`}>
            {resposta.ok && <Check aria-hidden className="size-4" />}
            {resposta.texto}
          </p>
        )}
      </div>
    </form>
  );
}
