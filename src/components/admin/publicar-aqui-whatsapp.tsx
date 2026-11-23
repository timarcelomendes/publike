"use client";

import { Check } from "lucide-react";
import { useState, useTransition } from "react";
import { salvarPublicarAqui } from "@/lib/acoes/admin-publicar-aqui";
import { classesBotao } from "../ui/botao";

// Admin › Publicar pelo WhatsApp: publicar a vaga aqui mesmo (migração 20270914120000).

export function PublicarAquiWhatsapp({ ligado: ligadoAntes }: { ligado: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [ligado, setLigado] = useState(ligadoAntes);
  const [resposta, setResposta] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <form
      className="mt-6 flex flex-col gap-3 border-t border-line pt-4"
      onChange={() => setResposta(null)}
      onSubmit={(ev) => {
        ev.preventDefault();
        iniciar(async () => {
          const r = await salvarPublicarAqui(ligado);
          setResposta(r.ok ? { ok: true, texto: r.mensagem } : { ok: false, texto: r.erro });
        });
      }}
    >
      <p className="text-label">Publicar aqui mesmo</p>
      <p className="text-caption text-ink-muted">
        A vaga preparada (uma só, com o cargo e o bairro) vem com os botões “Sim, publicar”, “Conferir no site” e “Procuro
        emprego”. No “Sim, publicar”, a vaga sai na hora: na conta que entra com este celular ou numa conta nova, criada
        com o número do WhatsApp e o nome da empresa (o lido no anúncio, ou o Publike pergunta). A vaga passa pelas
        mesmas regras do site; o que não passa vai para o site, já preenchido. Desligado, volta o link do site.
      </p>
      <label className="flex items-center gap-2 text-body-sm">
        <input type="checkbox" checked={ligado} onChange={(ev) => setLigado(ev.target.checked)} className="size-5" />
        Publicar na conversa, com o “Sim, publicar”
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendente} className={classesBotao("secundario", "sm")}>
          {pendente ? "Salvando…" : "Salvar"}
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
