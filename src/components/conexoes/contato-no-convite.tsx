"use client";

import { Sparkles, Unlock } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { liberarContatoDaConexao, testarContatoNoConvite } from "@/lib/acoes/conexoes";
import { mostrarContatoNoConvite } from "@/lib/acoes/talentos";
import { Selo } from "../ui/basicos";
import { Botao } from "../ui/botao";
import { useAcao } from "../ui/usar-acao";

// O contato dos talentos no convite (migração 20270626120000): nos planos, a empresa que pede conexão a um talento já
// vê o WhatsApp e o e-mail dele, e a conversa abre na hora. Aqui: a oferta para quem está no grátis, os 15 dias, o
// "Ver o contato agora" de um pedido que já esperava e, para quem procura, o "Liberar agora" do aviso do sino.

/** "Testar 15 dias grátis" do contato no convite (uma vez por conta, até 5 contatos a cada 24 horas). */
export function BotaoTestarContatoNoConvite() {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <span className="flex flex-col items-start gap-1">
      <Botao variante="primario" tamanho="sm" disabled={pendente} onClick={() => rodar(() => testarContatoNoConvite())}>
        <Sparkles aria-hidden />
        Testar 15 dias grátis
      </Botao>
      {mensagem}
    </span>
  );
}

/**
 * Para quem contrata sem o plano, na hora de pedir conexão (ou esperando a resposta): o contato no convite à vista,
 * com o selo, os 15 dias grátis e os planos.
 */
export function OfertaContatoNoConvite({
  primeiroNome,
  testou,
  esperando = false,
  aPartirDe,
}: {
  primeiroNome: string;
  /** a conta já usou os 15 dias grátis */
  testou: boolean;
  /** o pedido já foi e está esperando a resposta */
  esperando?: boolean;
  /** o talento já estava no Publike e não escolheu: o contato vem no pedido a partir desta data ("23 de novembro") */
  aPartirDe?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line-strong bg-surface-100 p-3 sm:p-4">
      <Selo variante="aviso" className="self-start">
        Nos planos
      </Selo>
      <p className="text-label">
        {esperando ? `Não quer esperar ${primeiroNome} aceitar?` : `Fale com ${primeiroNome} agora, sem esperar o aceite`}
      </p>
      <p className="text-body-sm text-ink-muted">
        No plano, o WhatsApp e o e-mail aparecem assim que você pede a conexão, e a conversa no Publike já abre.
        {aPartirDe && ` Para ${primeiroNome}, vale a partir de ${aPartirDe}, a não ser que libere antes.`}
      </p>
      {testou && (
        <p className="text-body-sm">Os seus 15 dias grátis já acabaram. O contato no convite continua em todos os planos.</p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {!testou && <BotaoTestarContatoNoConvite />}
        <Link href="/painel/planos" className="text-label text-ink underline underline-offset-2">
          Ver os planos
        </Link>
      </div>
    </div>
  );
}

/** Ver o contato num pedido que já estava esperando (feito antes do plano ou dos 15 dias grátis). */
export function BotaoLiberarContato({ conexaoId }: { conexaoId: string }) {
  const { rodar, pendente, mensagem } = useAcao();
  return (
    <span className="flex flex-col items-start gap-1">
      <Botao variante="primario" tamanho="sm" disabled={pendente} onClick={() => rodar(() => liberarContatoDaConexao(conexaoId))}>
        <Unlock aria-hidden />
        {pendente ? "Liberando…" : "Ver o contato agora"}
      </Botao>
      {mensagem}
    </span>
  );
}

/**
 * Para quem procura, embaixo do aviso do sino: liberar já o WhatsApp e o e-mail às empresas com plano que pedirem
 * conexão, ou não (16/11/2026, Marcelo: "dar ao usuário a opção de liberar o acesso, no aviso do sino, assim ele
 * mesmo pode ter interesse").
 */
export function EscolherContatoNoConvite() {
  const { rodar, pendente, mensagem } = useAcao();
  const [feito, setFeito] = useState(false);
  const escolher = (mostrar: boolean) => rodar(() => mostrarContatoNoConvite(mostrar), (r) => r.ok && setFeito(true));
  return (
    <div className="flex flex-col gap-1 pb-2 pl-[42px] pr-3">
      {!feito && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pendente}
            onClick={() => escolher(true)}
            className="min-h-9 rounded-pill bg-terra px-3 text-[13px] font-semibold text-on-terra transition-colors hover:bg-terra-hover disabled:opacity-60"
          >
            Liberar agora
          </button>
          <button
            type="button"
            disabled={pendente}
            onClick={() => escolher(false)}
            className="min-h-9 rounded-sm px-2 text-[13px] text-ink-muted underline hover:text-ink disabled:opacity-60"
          >
            Não liberar
          </button>
        </div>
      )}
      {mensagem}
    </div>
  );
}
