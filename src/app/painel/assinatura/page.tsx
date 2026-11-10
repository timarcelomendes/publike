import { CreditCard, QrCode, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CancelarAssinatura } from "@/components/pagamentos/cancelar-assinatura";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { BotaoAssinar } from "@/components/recurso-pago";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario, recursosPagos } from "@/lib/dados";
import { formatarMoeda, primeiro } from "@/lib/formato";
import {
  dataDoDia,
  dataEHora,
  economiaDoPacote,
  jaInclui,
  NOME_CICLO,
  NOME_PRODUTO,
  O_PRODUTO,
  planoQueCabe,
  podeAssinarPacote,
  POR_CICLO,
  seCruzam,
  type Assinatura,
  type Produto,
} from "@/lib/pagamentos";
import { dataCurta, NOME_RECURSO, PAGINA_DO_RECURSO, RECURSOS_PAGOS, type EstadoRecurso } from "@/lib/recursos-pagos";
import { pagamentosDaConta } from "@/lib/servidor/faturas";
import { sincronizarCliente } from "@/lib/servidor/pagamentos";
import { exigirUsuario } from "@/lib/sessao";
import { minhaFaixa } from "@/lib/servidor/pagina-de-carreiras";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Assinatura", robots: { index: false } };

// A assinatura dos recursos pagos, do combo e do Plano Completo: a forma de pagar, a próxima cobrança, trocar o cartão e
// cancelar (claude/plano-checkout-asaas.md). Na volta do cartão (?cartao=ok), confere no parceiro.

export default function PaginaAssinatura({ searchParams }: PageProps<"/painel/assinatura">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

const VOLTA: Record<string, { tipo: "sucesso" | "info"; titulo: string; texto?: string }> = {
  ok: {
    tipo: "sucesso",
    titulo: "Cartão aceito",
    texto: "Pronto: a assinatura está feita. O aviso também chega no sino.",
  },
  cancelou: { tipo: "info", titulo: "Você voltou sem pagar", texto: "Nada foi cobrado. Assine quando quiser." },
  expirou: {
    tipo: "info",
    titulo: "A página do cartão expirou",
    texto: "Nada foi cobrado. Comece de novo pelo Assinar.",
  },
};

function FormaDePagar({ a }: { a: Assinatura }) {
  if (a.forma === "pix")
    return (
      <span className="flex items-center gap-2">
        <QrCode aria-hidden className="size-[18px] text-ink-muted" />
        Pix, a cada fatura
      </span>
    );
  return (
    <span className="flex items-center gap-2">
      <CreditCard aria-hidden className="size-[18px] text-ink-muted" />
      {a.cartao_final
        ? `Cartão ${a.cartao_bandeira ? `${a.cartao_bandeira.charAt(0)}${a.cartao_bandeira.slice(1).toLowerCase()} ` : ""}final ${a.cartao_final}`
        : "Cartão de crédito"}
    </span>
  );
}

function CartaoAssinatura({ a }: { a: Assinatura }) {
  const valendo = a.situacao === "ativa";
  const pagoAte = a.pago_ate ? dataEHora(a.pago_ate) : null;
  return (
    <section
      aria-labelledby={`ass-${a.id}`}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={`ass-${a.id}`} className="text-h3">
            {NOME_PRODUTO[a.recurso]}
          </h3>
          <p className="text-body-sm text-ink-muted">
            {NOME_CICLO[a.ciclo]} · {formatarMoeda(a.valor)} {POR_CICLO[a.ciclo]}
          </p>
        </div>
        {valendo ? <Selo variante="match">Ativa</Selo> : <Selo variante="aviso">Esperando o 1º Pix</Selo>}
      </div>
      <dl className="grid gap-3 text-body sm:grid-cols-2">
        <div>
          <dt className="text-body-sm text-ink-muted">Forma de pagar</dt>
          <dd>
            <FormaDePagar a={a} />
          </dd>
        </div>
        {a.proxima_cobranca && (
          <div>
            <dt className="text-body-sm text-ink-muted">Próxima cobrança</dt>
            <dd>{dataDoDia(a.proxima_cobranca)}</dd>
          </div>
        )}
        {pagoAte && (
          <div>
            <dt className="text-body-sm text-ink-muted">Pago até</dt>
            <dd>{pagoAte}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap items-start gap-2 border-t border-line pt-4">
        {valendo && (
          <BotaoLink href={`/painel/assinar?recurso=${a.recurso}&troca=1`} tamanho="sm">
            <CreditCard aria-hidden />
            {a.forma === "cartao" ? "Trocar o cartão" : "Passar para o cartão"}
          </BotaoLink>
        )}
        <BotaoLink href="/painel/faturas" variante="fantasma" tamanho="sm">
          <ReceiptText aria-hidden />
          Faturas
        </BotaoLink>
        <CancelarAssinatura id={a.id} ate={pagoAte} />
      </div>
    </section>
  );
}

/** Como cada recurso está na conta, numa linha: liberado pelo Publike, nos dias grátis, assinado ou fechado. */
function situacaoDoRecurso(e: EstadoRecurso | undefined, agora: number): { texto: string; ok: boolean } {
  if (!e) return { texto: "Fechado", ok: false };
  if (e.assinante) return { texto: "Assinado", ok: true };
  if (e.liberado && !e.ate) return { texto: "Liberado pelo Publike, sem prazo. Nada a pagar.", ok: true };
  if (e.liberado && e.ate) {
    const gratis = e.fim_experimento && new Date(e.fim_experimento).getTime() > agora;
    return { texto: gratis ? `Dias grátis até ${dataCurta(e.ate)}` : `Vale até ${dataCurta(e.ate)}`, ok: true };
  }
  if (e.experimentou) return { texto: "Os dias grátis acabaram", ok: false };
  return { texto: "Fechado: dá para experimentar 15 dias grátis", ok: false };
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/assinatura">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/assinatura");
  const sp = await searchParams;
  const volta = primeiro(sp.cartao);
  if (volta === "ok") {
    // o aviso do parceiro pode chegar depois da volta: confere agora
    const usuario = await obterUsuario();
    if (usuario) await sincronizarCliente(usuario.id).catch(() => undefined);
  }
  const [pag, recursos, agora, faixa] = await Promise.all([
    pagamentosDaConta(),
    recursosPagos(),
    agoraDaRequisicao(),
    minhaFaixa(),
  ]);
  // o plano por faixa que cabe na conta (migração 20270407120000): no lugar do Plano Completo
  const plano = planoQueCabe(pag, faixa);
  const valendo = (pag?.assinaturas ?? []).filter((a) => a.situacao !== "cancelada");
  const canceladas = (pag?.assinaturas ?? []).filter((a) => a.situacao === "cancelada");
  // o Plano Completo primeiro (os quatro juntos saem mais em conta), depois o combo e cada recurso
  const aVenda: Produto[] = [
    ...(plano && podeAssinarPacote(pag, recursos, plano) ? [plano] : []),
    ...(podeAssinarPacote(pag, recursos, "completo") ? (["completo"] as const) : []),
    ...(podeAssinarPacote(pag, recursos, "combo") ? (["combo"] as const) : []),
    ...RECURSOS_PAGOS.filter((r) => recursos?.[r]?.pode_assinar),
  ];
  // quem assina um recurso que o Plano Completo inclui não vê o "Assinar" dele (não valem juntos): mostra a troca
  const trocaCompleto =
    pag?.pode && pag.planos.some((p) => p.recurso === "completo") && !aVenda.includes("completo")
      ? (valendo.find(
          (a) => a.recurso !== "completo" && seCruzam(a.recurso, "completo") && !jaInclui(a.recurso, "completo"),
        ) ?? null)
      : null;
  const aviso = volta ? VOLTA[volta] : null;
  const cartaoPendente = volta === "ok" && !valendo.some((a) => a.forma === "cartao");

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-h2">Assinatura</h2>
          <p className="mt-1 text-body text-ink-muted">O que você assina, como paga e quando vem a próxima cobrança.</p>
        </div>
        <div className="flex flex-wrap gap-4">
          <Link href="/painel/planos" className="text-label text-terra-text underline underline-offset-2">
            Ver os planos
          </Link>
          <Link href="/painel/faturas" className="text-label text-terra-text underline underline-offset-2">
            Ver faturas
          </Link>
        </div>
      </div>

      {recursos && (
        <section aria-labelledby="titulo-recursos" className="rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
          <h3 id="titulo-recursos" className="mb-2 text-label">
            Seus recursos
          </h3>
          <ul className="flex flex-col divide-y divide-line">
            {RECURSOS_PAGOS.filter((r) => !recursos[r].indisponivel).map((r) => {
              const s = situacaoDoRecurso(recursos[r], agora);
              return (
                <li key={r} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                  <Link href={PAGINA_DO_RECURSO[r]} className="text-label hover:underline">
                    {NOME_RECURSO[r]}
                  </Link>
                  <span className={`text-body-sm ${s.ok ? "text-ink" : "text-ink-muted"}`}>{s.texto}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {cartaoPendente ? (
        <Aviso tipo="info" titulo="Confirmando o cartão">
          O parceiro de pagamentos ainda está confirmando. Atualize a página em alguns segundos; o aviso também chega no
          sino.
        </Aviso>
      ) : (
        aviso && (
          <Aviso tipo={aviso.tipo} titulo={aviso.titulo}>
            {aviso.texto}
          </Aviso>
        )
      )}

      {valendo.length === 0 ? (
        <Vazio
          icone={CreditCard}
          titulo="Você ainda não assina nada"
          acao={
            aVenda.length > 0 ? (
              <BotaoLink href="/painel/planos">
                <CreditCard aria-hidden />
                Ver os planos
              </BotaoLink>
            ) : undefined
          }
        >
          Compare os planos e os recursos sozinhos, com o preço de cada um, por mês ou a cada 3 meses.
        </Vazio>
      ) : (
        <>
          {valendo.map((a) => (
            <CartaoAssinatura key={a.id} a={a} />
          ))}
          {trocaCompleto && <TrocarPeloCompleto atual={trocaCompleto} economia={economiaDoPacote(pag, "completo")} />}
          {aVenda.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {aVenda.map((r) => (
                <BotaoAssinar key={r} recurso={r} variante="secundario" tamanho="sm" />
              ))}
            </div>
          )}
        </>
      )}

      {canceladas.length > 0 && (
        <details className="rounded-lg border border-line bg-surface-200 p-4">
          <summary className="cursor-pointer text-label">Canceladas ({canceladas.length})</summary>
          <ul className="mt-3 flex flex-col divide-y divide-line">
            {canceladas.map((a) => (
              <li key={a.id} className="flex flex-wrap justify-between gap-2 py-2 text-body-sm">
                <span>
                  {NOME_PRODUTO[a.recurso]} · {NOME_CICLO[a.ciclo].toLowerCase()} · {formatarMoeda(a.valor)}
                </span>
                <span className="text-ink-muted">
                  {a.cancelada_em ? `cancelada em ${dataEHora(a.cancelada_em)}` : "cancelada"}
                  {a.pago_ate && new Date(a.pago_ate).getTime() > agora ? ` · vale até ${dataEHora(a.pago_ate)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * O Plano Completo para quem já assina um recurso que ele inclui (02/11/2026): os dois não valem juntos, então em vez
 * do "Assinar" vem o caminho da troca: cancelar o de agora (o que foi pago continua valendo) e assinar o Completo, que
 * começa a cobrar quando o pago acabar (a página de assinar explica de novo).
 */
function TrocarPeloCompleto({ atual, economia }: { atual: Assinatura; economia: ReturnType<typeof economiaDoPacote> }) {
  return (
    <section
      aria-labelledby="trocar-completo"
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-6"
    >
      <h3 id="trocar-completo" className="flex flex-wrap items-center gap-2 text-h3">
        Plano Completo
        <Selo variante="novo">Novo</Selo>
      </h3>
      <p className="text-body text-ink-muted">
        A Triagem com IA, o Teste Prático, a Entrevista em vídeo e as Automações numa assinatura só
        {economia
          ? `: ${formatarMoeda(economia.valor)} por mês (separados, ${formatarMoeda(economia.separados)}).`
          : "."}
      </p>
      <p className="text-body-sm">
        Ele inclui {O_PRODUTO[atual.recurso]}, que você já assina. Para trocar, cancele {O_PRODUTO[atual.recurso]} acima
        {atual.proxima_cobranca ? ` (o que já foi pago vale até ${dataDoDia(atual.proxima_cobranca)})` : ""} e assine o
        Plano Completo: ele começa a cobrar quando o pago acabar.
      </p>
      <div>
        <BotaoLink href="/painel/assinar?recurso=completo" variante="secundario" tamanho="sm">
          Ver o Plano Completo
        </BotaoLink>
      </div>
    </section>
  );
}
