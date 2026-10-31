"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { meuWhatsapp, mudarWhatsapp, type MeuWhatsapp } from "@/lib/acoes/whatsapp";
import { formatarTelefone } from "@/lib/formato";
import { Selo } from "../ui/basicos";

/**
 * "Quero receber pelo WhatsApp": o aceite que a Meta exige antes da primeira mensagem (migração 20261231120000).
 * Os avisos pelo WhatsApp começam em breve; quem marca agora recebe quando começar. Sem `inicial`, busca sozinho.
 * Some quando a migração não rodou ou quando a pessoa não administra a conta.
 */
export function AceiteWhatsapp({
  inicial,
  origem,
  rotulo,
  explicacao,
  esconderSeAceito = false,
  compacto = false,
}: {
  inicial?: MeuWhatsapp | null;
  origem: "avisos" | "curtir" | "quadro";
  rotulo: string;
  explicacao?: string;
  /** no Curtir: quem já aceitou não vê de novo */
  esconderSeAceito?: boolean;
  /** só a linha (no quadro): a explicação vai no title */
  compacto?: boolean;
}) {
  const [estado, setEstado] = useState<MeuWhatsapp | null | undefined>(inicial);
  // como estava ao abrir: no Curtir, quem já tinha aceitado não vê de novo
  const [aceitoAoAbrir, setAceitoAoAbrir] = useState<boolean | null>(() => inicial?.aceito ?? null);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<{ texto: string; ir?: string } | null>(null);

  useEffect(() => {
    if (inicial !== undefined) return;
    let vivo = true;
    chamarAcao(async () => ({ ok: true as const, dados: await meuWhatsapp() })).then((r) => {
      if (!vivo) return;
      const dados = r.ok ? r.dados : null;
      setEstado(dados);
      setAceitoAoAbrir(dados?.aceito ?? null);
    });
    return () => {
      vivo = false;
    };
  }, [inicial]);

  if (!estado || !estado.pode) return null;
  if (esconderSeAceito && aceitoAoAbrir) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-label"
        title={
          compacto ? "Os avisos pelo WhatsApp começam em breve. Marque agora e você recebe quando começar." : undefined
        }
      >
        <input
          type="checkbox"
          checked={estado.aceito}
          disabled={pendente}
          onChange={(e) => {
            const aceito = e.target.checked;
            setErro(null);
            // marca na hora; volta se der erro
            setEstado((s) => (s ? { ...s, aceito } : s));
            iniciar(async () => {
              const r = await chamarAcao(() => mudarWhatsapp(aceito, origem));
              if (r.ok) return;
              setEstado((s) => (s ? { ...s, aceito: !aceito } : s));
              setErro({ texto: r.erro, ir: "ir" in r ? r.ir : undefined });
            });
          }}
          className="size-5 accent-[var(--pk-ink)]"
        />
        <MessageCircle aria-hidden className="size-[18px] text-cerrado-text" />
        {rotulo}
        <Selo variante="novo">Novo</Selo>
      </label>
      {!compacto && (
        <p className="pl-7 text-body-sm text-ink-muted">
          {explicacao ?? "Os avisos pelo WhatsApp começam em breve. Marque agora e você recebe quando começar."}
          {estado.numero && ` No ${formatarTelefone(estado.numero)}.`} Dá para desmarcar quando quiser.
        </p>
      )}
      {erro && (
        <p className="pl-7 text-body-sm text-danger">
          {erro.texto}{" "}
          {erro.ir && (
            <Link href={erro.ir} className="font-semibold underline underline-offset-2">
              Abrir o perfil
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
