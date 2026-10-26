"use client";

import { Copy, MessageCircle } from "lucide-react";
import { useState } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { mensagemParaEmpresaEsperando } from "@/lib/acoes/admin-esperando";
import { formatarTelefone } from "@/lib/formato";
import { Botao } from "../ui/botao";

/**
 * Admin › Esperando: monta a mensagem para a empresa (quem espera, o link) e abre o WhatsApp do admin
 * com ela pronta. Sem WhatsApp na conta, dá para copiar e mandar por outro lugar.
 */
export function AvisarEmpresa({ contaId }: { contaId: string }) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [gerado, setGerado] = useState<{ whatsapp: string | null; mensagem: string } | null>(null);
  const [copiado, setCopiado] = useState(false);

  async function gerar() {
    setGerando(true);
    setErro(null);
    const r = await chamarAcao(() => mensagemParaEmpresaEsperando(contaId));
    setGerando(false);
    if (r.ok) setGerado({ whatsapp: r.whatsapp, mensagem: r.mensagem });
    else setErro(r.erro);
  }

  if (!gerado) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Botao tamanho="sm" disabled={gerando} onClick={gerar}>
          <MessageCircle aria-hidden />
          {gerando ? "Montando…" : "Montar a mensagem"}
        </Botao>
        {erro && (
          <p role="alert" className="text-body-sm text-danger">
            {erro}
          </p>
        )}
      </div>
    );
  }
  const zap = gerado.whatsapp?.replace(/\D/g, "") ?? "";
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-surface-100 p-3">
      <p className="text-body-sm whitespace-pre-wrap">{gerado.mensagem}</p>
      <div className="flex flex-wrap gap-2">
        {zap.length >= 12 ? (
          <a
            href={`https://wa.me/${zap}?text=${encodeURIComponent(gerado.mensagem)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-cerrado px-3.5 text-label text-on-cerrado"
          >
            <MessageCircle aria-hidden className="size-4" />
            Abrir o WhatsApp {formatarTelefone(zap)}
          </a>
        ) : (
          <p className="self-center text-body-sm text-ink-muted">
            A conta não tem WhatsApp: copie e mande por outro lugar.
          </p>
        )}
        <Botao
          tamanho="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(gerado.mensagem);
              setCopiado(true);
            } catch {
              setCopiado(false);
            }
          }}
        >
          <Copy aria-hidden />
          {copiado ? "Copiada" : "Copiar a mensagem"}
        </Botao>
      </div>
    </div>
  );
}
