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
  type UsoDoWhatsapp,
} from "@/lib/acoes/whatsapp";
import { formatarNumero, formatarTelefone } from "@/lib/formato";
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
  cartao = null,
}: {
  inicial?: MeuWhatsapp | null;
  origem: Exclude<OrigemDoWhatsapp, "cadastro">;
  rotulo: string;
  explicacao?: string;
  /** no Curtir: quem já aceitou não vê de novo */
  esconderSeAceito?: boolean;
  /** só a linha (no quadro): a explicação vai no title */
  compacto?: boolean;
  /**
   * Preferências: com o WhatsApp ligado, a lista dos avisos para escolher (migração 20270711120000) e, para quem
   * contrata, os avisos do mês contra o limite (migração 20270714120000)
   */
  escolher?: boolean;
  /**
   * O cartão para quem contrata (19/11/2026; Marcelo: "quero"): o exemplo da mensagem e um botão só, em vez da caixinha.
   * Depois de publicar e no quadro de candidatos. O toque no botão é o aceite (a caixa nunca vem marcada: LGPD).
   */
  cartao?: { vaga?: string | null; empresa?: string | null; titulo?: string } | null;
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
  if (cartao) {
    const aceitar = () => {
      setErro(null);
      setEstado((s) => (s ? { ...s, aceito: true } : s));
      iniciar(async () => {
        const r = await chamarAcao(() => mudarWhatsapp(true, origem));
        if (r.ok) return;
        setEstado((s) => (s ? { ...s, aceito: false } : s));
        setErro({ texto: r.erro, ir: "ir" in r ? r.ir : undefined });
      });
    };
    return (
      <CartaoDoAceite
        estado={estado}
        cartao={cartao}
        pendente={pendente}
        aceitar={aceitar}
        erro={erro}
      />
    );
  }
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
      {escolher && estado.aceito && estado.ligado && estado.uso && <UsoDoMes uso={estado.uso} />}
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

/** O cartão do aceite para quem contrata: o exemplo da mensagem de verdade e o botão. */
function CartaoDoAceite({
  estado,
  cartao,
  pendente,
  aceitar,
  erro,
}: {
  estado: MeuWhatsapp;
  cartao: { vaga?: string | null; empresa?: string | null; titulo?: string };
  pendente: boolean;
  aceitar: () => void;
  erro: { texto: string; ir?: string } | null;
}) {
  const vaga = cartao.vaga?.trim() || "Atendente";
  const nome = cartao.empresa?.trim() || "Padaria Pão de Ouro";
  if (estado.aceito)
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg border border-line bg-surface-200 p-4">
        <MessageCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-cerrado-text" />
        <p className="text-body-sm">
          <span className="text-label">Pronto! Os próximos candidatos chegam no WhatsApp</span>
          {estado.numero ? ` ${formatarTelefone(estado.numero)}` : ""}.{" "}
          <span className="text-ink-muted">Para parar, responda PARAR ou mude em Preferências.</span>
        </p>
      </div>
    );
  return (
    <section
      aria-label="Receber os candidatos no WhatsApp"
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-4 sm:flex-row sm:items-center sm:p-5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-h3">{cartao.titulo ?? "Receba os candidatos no WhatsApp"}</p>
        <p className="text-body-sm text-ink-muted">
          Quando alguém se candidatar, o WhatsApp oficial do Publike avisa
          {estado.numero ? ` no ${formatarTelefone(estado.numero)}` : ""}, com o botão para ver a pessoa. Os candidatos
          da mesma vaga chegam juntos. Para parar, é só responder PARAR.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={aceitar}
            disabled={pendente || !estado.ligado}
            className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-cerrado px-5 text-label text-on-cerrado transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <MessageCircle aria-hidden className="size-[18px]" />
            {pendente ? "Ligando…" : estado.ligado ? "Receber no WhatsApp" : "Em breve"}
          </button>
        </div>
        {erro && (
          <p role="alert" className="text-body-sm text-danger">
            {erro.texto}{" "}
            {erro.ir && (
              <Link href={erro.ir} className="font-semibold underline underline-offset-2">
                Abrir o perfil
              </Link>
            )}
          </p>
        )}
      </div>
      {/* o exemplo: o texto do modelo publike_candidato_novo */}
      <div aria-hidden className="w-full max-w-xs shrink-0 rounded-lg bg-surface-300 p-3 sm:w-72">
        <div className="rounded-md rounded-tl-none bg-surface-200 px-3 py-2 text-body-sm shadow-card">
          Oi, {nome}! Chegou candidatura nova na vaga de {vaga}: Ana S. e mais 2 pessoas. Veja e responda pelo Publike.
          <span className="mt-2 block border-t border-line pt-2 text-center text-label text-cerrado-text">
            Ver a candidatura
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * Quem contrata, em Preferências: os avisos do mês contra o limite (migração 20270714120000). No grátis, a oferta do
 * plano. Acabou, os avisos seguem no sino e no e-mail até o dia 1º.
 */
function UsoDoMes({ uso }: { uso: UsoDoWhatsapp }) {
  const usadas = Math.min(uso.usadas, uso.limite);
  const cheio = uso.usadas >= uso.limite;
  const parte = uso.limite > 0 ? usadas / uso.limite : 1;
  return (
    <div className="mt-3 flex flex-col gap-1.5 pl-7">
      <p className="text-label text-ink">
        Neste mês: {formatarNumero(usadas)} de {formatarNumero(uso.limite)} avisos
        {uso.plano ? " do seu plano" : " do grátis"}
      </p>
      <div
        role="meter"
        aria-label="Avisos pelo WhatsApp usados neste mês"
        aria-valuemin={0}
        aria-valuemax={uso.limite}
        aria-valuenow={usadas}
        className="h-1.5 w-full max-w-xs overflow-hidden rounded-pill bg-surface-300"
      >
        <div className={`h-full rounded-pill ${cheio ? "bg-terra" : "bg-cerrado"}`} style={{ width: `${parte * 100}%` }} />
      </div>
      <p className="text-body-sm text-ink-muted">
        {cheio
          ? "Acabaram os avisos do mês: até o dia 1º, eles chegam pelo sino e pelo e-mail."
          : "O mês recomeça no dia 1º."}
        {!uso.plano && uso.limitePlano > uso.limite && (
          <>
            {" "}
            Com um plano, são até {formatarNumero(uso.limitePlano)} por mês.{" "}
            <Link href="/painel/planos" className="font-semibold text-ink underline underline-offset-2">
              Ver os planos
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
