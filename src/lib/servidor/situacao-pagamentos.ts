import "server-only";
import type { ClienteBanco } from "@/lib/supabase/admin";
import { situacaoAsaas } from "./asaas";
import { urlDosEmails } from "./ambiente";

// O que o Admin mostra dos pagamentos: o endereço do webhook, o site no ar (perguntado a ele mesmo, só sim
// ou não), este computador (as variáveis, mascaradas) e os avisos do Asaas chegando (do banco).

export type NoAr = {
  respondeu: boolean;
  producao?: boolean;
  chave?: boolean;
  chaveAceita?: boolean | null;
  chaveDeOutroAmbiente?: boolean;
  token?: boolean;
  tokenComProblema?: boolean;
};

export type Avisos = {
  ultimo_aviso: string | null;
  ultimo_tipo: string | null;
  avisos_7d: number;
  erros_7d: number;
  aberto: boolean;
  planos_a_venda: number;
  contas_teste: number;
  servico_nota: boolean;
  ativas: number;
};

export type SituacaoPagamentos = {
  site: string | null;
  webhook: string | null;
  noAr: NoAr | null;
  local: ReturnType<typeof situacaoAsaas>;
  avisos: Avisos | null;
};

export async function situacaoPagamentos(c: ClienteBanco): Promise<SituacaoPagamentos> {
  const site = urlDosEmails();
  const webhook = site ? `${site}/api/pagamentos/asaas` : null;
  const [noAr, avisos] = await Promise.all([
    webhook
      ? fetch(webhook, { cache: "no-store", signal: AbortSignal.timeout(8000) })
          .then(async (r) => {
            const j = (await r.json().catch(() => null)) as (NoAr & { publike?: string }) | null;
            // sem a página nova no ar (antes do push), o site responde 404 ou outra coisa
            return r.ok && j?.publike === "pagamentos" ? { ...j, respondeu: true } : { respondeu: false };
          })
          .catch(() => ({ respondeu: false }))
      : Promise.resolve(null),
    c.rpc("admin_pagamentos_situacao").then(({ data, error }) => (error ? null : (data as unknown as Avisos))),
  ]);
  return { site, webhook, noAr, local: situacaoAsaas(), avisos };
}

export type ItemPagamento = { ok: boolean; texto: string };

/** A lista do "está tudo ok?" (o Painel do admin e o alto de Admin › Pagamentos). */
export function itensPagamentos(s: SituacaoPagamentos): ItemPagamento[] {
  const n = s.noAr;
  const a = s.avisos;
  const itens: ItemPagamento[] = [];
  if (!s.webhook) {
    itens.push({ ok: false, texto: "Falta o endereço do site no ar (PUBLIKE_URL_PUBLICA neste computador)." });
  } else if (!n?.respondeu) {
    itens.push({
      ok: false,
      texto: "O site no ar ainda não tem a página dos pagamentos: faça o push e espere publicar.",
    });
  } else {
    itens.push({
      ok: Boolean(n.chave) && n.chaveAceita !== false && !n.chaveDeOutroAmbiente,
      texto: !n.chave
        ? "Na Vercel, falta a chave do Asaas (ASAAS_API_KEY)."
        : n.chaveAceita === false
          ? "O Asaas recusou a chave posta na Vercel. Confira se copiou inteira, com o $ do começo."
          : n.chaveDeOutroAmbiente
            ? `A chave na Vercel é de ${n.producao ? "sandbox" : "produção"}, mas ASAAS_AMBIENTE diz ${n.producao ? "produção" : "sandbox"}.`
            : n.chaveAceita
              ? `Chave do Asaas aceita, no ${n.producao ? "ambiente de produção" : "sandbox (teste)"}.`
              : "Chave do Asaas posta na Vercel (o Asaas não respondeu agora para conferir).",
    });
    itens.push({
      ok: Boolean(n.token) && !n.tokenComProblema,
      texto: !n.token
        ? "Na Vercel, falta o token do webhook (ASAAS_WEBHOOK_TOKEN)."
        : n.tokenComProblema
          ? "O token do webhook na Vercel está fora do que o Asaas aceita (32 caracteres ou mais, sem espaço, diferente da chave)."
          : "Token do webhook posto na Vercel.",
    });
  }
  if (a) {
    itens.push({
      ok: a.erros_7d === 0 && Boolean(a.ultimo_aviso),
      texto:
        a.erros_7d > 0
          ? `${a.erros_7d} aviso(s) do Asaas com erro nos últimos 7 dias (veja embaixo, em Com erro).`
          : a.ultimo_aviso
            ? `Avisos do Asaas chegando: ${a.avisos_7d} nos últimos 7 dias.`
            : "Nenhum aviso do Asaas chegou ainda. Cadastre o webhook no Asaas e faça uma compra de teste.",
    });
    itens.push({
      ok: a.planos_a_venda > 0,
      texto: a.planos_a_venda > 0 ? `${a.planos_a_venda} plano(s) à venda.` : "Nenhum plano à venda: ponha os preços.",
    });
    itens.push({
      ok: a.aberto || a.contas_teste > 0,
      texto: a.aberto
        ? "Aberto para todas as contas."
        : a.contas_teste > 0
          ? `Fechado: ${a.contas_teste} conta(s) de teste veem o Assinar.`
          : "Fechado e sem conta de teste: ninguém vê o Assinar.",
    });
    itens.push({
      ok: a.servico_nota,
      texto: a.servico_nota
        ? "Serviço da nota fiscal posto."
        : "Falta o serviço da nota fiscal: sem ele, a nota não sai.",
    });
  } else {
    itens.push({ ok: false, texto: "Rode a migração 20261219120000_pagamentos_situacao.sql para ver os avisos." });
  }
  return itens;
}
