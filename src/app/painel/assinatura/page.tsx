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
import { dataDoDia, dataEHora, NOME_CICLO, POR_CICLO, type Assinatura } from "@/lib/pagamentos";
import { NOME_RECURSO, type RecursoPago } from "@/lib/recursos-pagos";
import { pagamentosDaConta } from "@/lib/servidor/faturas";
import { sincronizarCliente } from "@/lib/servidor/pagamentos";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Assinatura", robots: { index: false } };

// A assinatura do Copiloto e dos Testes Publike: a forma de pagar, a próxima cobrança, trocar o cartão e
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
            {NOME_RECURSO[a.recurso]}
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
  const [pag, recursos, agora] = await Promise.all([pagamentosDaConta(), recursosPagos(), agoraDaRequisicao()]);
  const valendo = (pag?.assinaturas ?? []).filter((a) => a.situacao !== "cancelada");
  const canceladas = (pag?.assinaturas ?? []).filter((a) => a.situacao === "cancelada");
  const aVenda = (["copiloto", "testes"] as RecursoPago[]).filter((r) => recursos?.[r]?.pode_assinar);
  const aviso = volta ? VOLTA[volta] : null;
  const cartaoPendente = volta === "ok" && !valendo.some((a) => a.forma === "cartao");

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-h2">Assinatura</h2>
          <p className="mt-1 text-body text-ink-muted">O que você assina, como paga e quando vem a próxima cobrança.</p>
        </div>
        <Link href="/painel/faturas" className="text-label text-terra-text underline underline-offset-2">
          Ver faturas
        </Link>
      </div>

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
            aVenda.length > 0
              ? aVenda.map((r, i) => (
                  <BotaoAssinar key={r} recurso={r} variante={i === 0 ? "primario" : "secundario"} />
                ))
              : undefined
          }
        >
          O Copiloto e os Testes Publike são assinados separados, por mês ou a cada 3 meses.
        </Vazio>
      ) : (
        <>
          {valendo.map((a) => (
            <CartaoAssinatura key={a.id} a={a} />
          ))}
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
                  {NOME_RECURSO[a.recurso]} · {NOME_CICLO[a.ciclo].toLowerCase()} · {formatarMoeda(a.valor)}
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
