"use client";

import { MessageCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import {
  meuWhatsapp,
  mudarAvisosDoWhatsapp,
  mudarWhatsapp,
  type MeuWhatsapp,
  type OrigemDoWhatsapp,
} from "@/lib/acoes/whatsapp";
import { formatarTelefone } from "@/lib/formato";
import { Selo } from "../ui/basicos";

/**
 * "Quero receber pelo WhatsApp": o aceite que a Meta exige antes da primeira mensagem (migração 20261231120000).
 * Com o WhatsApp oficial ligado para todos (Admin › WhatsApp), os avisos já saem; antes, a tela diz que começam em
 * breve e quem marca recebe quando começar. Sem `inicial`, busca sozinho.
 * Some quando a migração não rodou ou quando a pessoa não administra a conta.
 */
export function AceiteWhatsapp({
  inicial,
  origem,
  rotulo,
  explicacao,
  esconderSeAceito = false,
  compacto = false,
  escolher = false,
}: {
  inicial?: MeuWhatsapp | null;
  origem: Exclude<OrigemDoWhatsapp, "cadastro">;
  rotulo: string;
  explicacao?: string;
  /** no Curtir: quem já aceitou não vê de novo */
  esconderSeAceito?: boolean;
  /** só a linha (no quadro): a explicação vai no title */
  compacto?: boolean;
  /** Preferências: com o WhatsApp ligado, a lista dos avisos para escolher (migração 20270711120000) */
  escolher?: boolean;
}) {
  const [estado, setEstado] = useState<MeuWhatsapp | null | undefined>(inicial);
  // como estava ao abrir: no Curtir, quem já tinha aceitado não vê de novo
  const [aceitoAoAbrir, setAceitoAoAbrir] = useState<boolean | null>(() => inicial?.aceito ?? null);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<{ texto: string; ir?: string } | null>(null);
  const [salvandoAvisos, iniciarAvisos] = useTransition();
  const [erroAvisos, setErroAvisos] = useState<string | null>(null);

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

  /** liga ou desliga um aviso; marca na hora e volta se der erro */
  function trocarAviso(tipo: string, quer: boolean) {
    if (!estado) return;
    const antes = estado.desligados;
    const depois = quer ? antes.filter((t) => t !== tipo) : [...antes, tipo];
    setErroAvisos(null);
    setEstado((s) => (s ? { ...s, desligados: depois } : s));
    iniciarAvisos(async () => {
      const r = await chamarAcao(() => mudarAvisosDoWhatsapp(depois));
      if (r.ok) return;
      setEstado((s) => (s ? { ...s, desligados: antes } : s));
      setErroAvisos(r.erro);
    });
  }
  if (esconderSeAceito && aceitoAoAbrir) return null;
  const explicacaoPadrao = estado.ligado
    ? "Os avisos chegam pelo WhatsApp oficial do Publike. Para parar, desmarque aqui ou responda PARAR no WhatsApp."
    : "Os avisos pelo WhatsApp começam em breve. Marque agora e você recebe quando começar.";

  return (
    <div className="flex flex-col gap-1.5">
      <label
        className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-label"
        title={compacto ? explicacaoPadrao : undefined}
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
        {compacto && !estado.ligado && " (em breve)"}
        <Selo variante="novo">Novo</Selo>
      </label>
      {!compacto && (
        <p className="pl-7 text-body-sm text-ink-muted">
          {explicacao ?? explicacaoPadrao}
          {estado.numero && ` No ${formatarTelefone(estado.numero)}.`} Dá para desmarcar quando quiser.
        </p>
      )}
      {escolher && estado.aceito && estado.avisos.length > 0 && (
        <fieldset className="mt-2 flex flex-col pl-7">
          <legend className="text-label text-ink">O que chega pelo WhatsApp</legend>
          <p className="mt-0.5 mb-1 text-body-sm text-ink-muted">O que você desmarcar continua no sino e no e-mail.</p>
          {estado.avisos.map((a) => (
            <label key={a.tipo} className="flex min-h-11 cursor-pointer items-center gap-3 text-body text-ink">
              <input
                type="checkbox"
                checked={!estado.desligados.includes(a.tipo)}
                disabled={salvandoAvisos}
                onChange={(e) => trocarAviso(a.tipo, e.target.checked)}
                className="size-5 shrink-0 accent-[var(--pk-ink)]"
              />
              {a.rotulo}
            </label>
          ))}
          {estado.avisos.every((a) => estado.desligados.includes(a.tipo)) && (
            <p className="text-body-sm text-ink-muted">Nenhum marcado: nada chega pelo WhatsApp.</p>
          )}
          {erroAvisos && (
            <p role="alert" className="text-body-sm text-danger">
              {erroAvisos}
            </p>
          )}
        </fieldset>
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
