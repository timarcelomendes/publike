import { CreditCard, QrCode, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AvisoDaFaixa } from "@/components/pagamentos/aviso-da-faixa";
import { CancelarAssinatura } from "@/components/pagamentos/cancelar-assinatura";
import { DevolverPagamento } from "@/components/pagamentos/devolver-pagamento";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario, recursosPagos } from "@/lib/dados";
import { formatarMoeda, primeiro } from "@/lib/formato";
import {
  dataDoDia,
  dataEHora,
  diaBr,
  MESES,
  NOME_CICLO,
  NOME_PRODUTO,
  planoQueCabe,
  POR_CICLO,
  recursosDo,
  faixasDeCima,
  type Assinatura,
  type Compra,
  type PagamentosDaConta,
  type Produto,
} from "@/lib/pagamentos";
import { dataCurta, NOME_RECURSO, PAGINA_DO_RECURSO, RECURSOS_PAGOS, type EstadoRecurso } from "@/lib/recursos-pagos";
import { pagamentosDaConta } from "@/lib/servidor/faturas";
import { sincronizarCliente } from "@/lib/servidor/pagamentos";
import { minhaFaixa } from "@/lib/servidor/pagina-de-carreiras";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Assinatura", robots: { index: false } };

// A assinatura (refeita a pedido do Marcelo, 10/11/2026): o resumo (quanto paga por mês e a próxima cobrança), cada
// assinatura numa linha com o que dá para fazer nela, o que está liberado sem pagar e, quando sai mais em conta, o
// plano que junta tudo. Os planos lado a lado ficam em /painel/planos. Na volta do cartão (?cartao=ok), confere no
// parceiro (claude/plano-checkout-asaas.md).

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
    texto: "Nada foi cobrado. Comece de novo pelos Planos.",
  },
};

/** O cartão como a pessoa reconhece ("Cartão Visa final 1234"); bandeira desconhecida não aparece. */
function nomeDoCartao(a: Assinatura) {
  const b = (a.cartao_bandeira ?? "").trim();
  const bandeira = b && b.toUpperCase() !== "UNKNOWN" ? ` ${b.charAt(0)}${b.slice(1).toLowerCase()}` : "";
  return a.cartao_final ? `Cartão${bandeira} final ${a.cartao_final}` : "Cartão de crédito";
}

const porMes = (a: Assinatura) => a.valor / MESES[a.ciclo];

/** Como a assinatura está, em palavras: ativa, começa depois dos dias grátis ou espera o 1º Pix. */
function estadoDa(a: Assinatura, hoje: string): { selo: string; variante: "match" | "aviso" | "contorno"; nota?: string } {
  if (a.situacao === "ativa") return { selo: "Ativa", variante: "match" };
  if (a.proxima_cobranca && a.proxima_cobranca.slice(0, 10) > hoje) {
    return {
      selo: `Começa em ${dataDoDia(a.proxima_cobranca, false)}`,
      variante: "contorno",
      nota:
        a.forma === "pix"
          ? "Até lá, vale o que você já tem. O Pix da 1ª fatura chega no sino e por e-mail perto do dia."
          : "Até lá, vale o que você já tem. O cartão só é cobrado no dia.",
    };
  }
  return {
    selo: "Esperando o 1º Pix",
    variante: "aviso",
    nota: "A assinatura começa a valer quando o Pix da 1ª fatura for pago.",
  };
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
  const hoje = diaBr(new Date(agora));
  const valendo = (pag?.assinaturas ?? []).filter((a) => a.situacao !== "cancelada");
  const canceladas = (pag?.assinaturas ?? []).filter((a) => a.situacao === "cancelada");
  const total = valendo.reduce((t, a) => t + porMes(a), 0);
  const proxima = valendo
    .filter((a) => a.proxima_cobranca)
    .sort((a, b) => String(a.proxima_cobranca).localeCompare(String(b.proxima_cobranca)))[0];
  // os recursos que as assinaturas já liberam (não se repetem embaixo)
  const assinados = new Set(valendo.flatMap((a) => recursosDo(a.recurso)));
  const semAssinar = [
    ...RECURSOS_PAGOS.filter((r) => recursos && !recursos[r].indisponivel && !assinados.has(r)).map((r) => ({
      nome: NOME_RECURSO[r],
      href: PAGINA_DO_RECURSO[r],
      e: recursos?.[r],
    })),
    ...(recursos && !recursos.salarios.indisponivel && !assinados.has("salarios")
      ? [{ nome: NOME_PRODUTO.salarios, href: "/painel/salarios", e: recursos.salarios }]
      : []),
  ];
  const aviso = volta
    ? VOLTA[volta]
    : primeiro(sp.faixa) === "ok"
      ? { tipo: "sucesso" as const, titulo: "Pronto: a faixa mudou", texto: "A próxima cobrança já vem com o valor novo." }
      : null;
  // o plano por 30 dias (que vale ou espera o pagamento) e a troca de faixa esperando (migração 20270416120000)
  const compras = pag?.compras ?? [];
  const deCima = faixasDeCima(pag);
  const cartaoPendente = volta === "ok" && !valendo.some((a) => a.forma === "cartao") && !compras.length;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-h2">Assinatura</h2>
          <p className="mt-1 text-body text-ink-muted">O que você assina, como paga e o que vem a seguir.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BotaoLink href="/painel/faturas" variante="fantasma" tamanho="sm">
            <ReceiptText aria-hidden />
            Faturas
          </BotaoLink>
          <BotaoLink href="/painel/planos" variante="secundario" tamanho="sm">
            Ver os planos
          </BotaoLink>
        </div>
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

      <AvisoDaFaixa faixa={faixa} />

      {compras.length > 0 && <Compras compras={compras} pag={pag} />}

      {valendo.length === 0 && compras.length > 0 ? null : valendo.length === 0 ? (
        <Vazio
          icone={CreditCard}
          titulo="Você ainda não assina nada"
          acao={
            pag?.pode ? (
              <BotaoLink href="/painel/planos">
                <CreditCard aria-hidden />
                Ver os planos
              </BotaoLink>
            ) : undefined
          }
        >
          Publicar e receber candidatos é grátis. Os planos e os recursos sozinhos, com o preço de cada um, ficam em
          Planos.
        </Vazio>
      ) : (
        <>
          <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
            <div className="flex flex-col gap-1 bg-surface-200 p-5">
              <dt className="text-body-sm text-ink-muted">Você paga</dt>
              <dd>
                <span className="text-h2 tabular-nums">{formatarMoeda(Math.round(total * 100) / 100)}</span>
                <span className="text-body-sm text-ink-muted"> por mês</span>
                <span className="block text-body-sm text-ink-muted">
                  {valendo.length === 1 ? "1 assinatura" : `${valendo.length} assinaturas`}
                </span>
              </dd>
            </div>
            <div className="flex flex-col gap-1 bg-surface-200 p-5">
              <dt className="text-body-sm text-ink-muted">Próxima cobrança</dt>
              <dd>
                {proxima?.proxima_cobranca ? (
                  <>
                    <span className="text-h2">{dataDoDia(proxima.proxima_cobranca, false)}</span>
                    <span className="block text-body-sm text-ink-muted">
                      {formatarMoeda(proxima.valor)}, {NOME_PRODUTO[proxima.recurso]}
                    </span>
                  </>
                ) : (
                  <span className="text-body text-ink-muted">Nenhuma marcada</span>
                )}
              </dd>
            </div>
          </dl>

          <PlanoQueJunta pag={pag} faixa={faixa} valendo={valendo} total={total} />

          <section aria-labelledby="assina" className="flex flex-col gap-3">
            <h3 id="assina" className="text-h3">
              O que você assina
            </h3>
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
              {valendo.map((a) => (
                <LinhaAssinatura
                  key={a.id}
                  a={a}
                  hoje={hoje}
                  subir={deCima.assinatura?.id === a.id ? (deCima.faixas[0]?.recurso ?? null) : null}
                />
              ))}
            </ul>
          </section>
        </>
      )}

      {semAssinar.length > 0 && (
        <section aria-labelledby="sem-assinar" className="flex flex-col gap-3">
          <div>
            <h3 id="sem-assinar" className="text-h3">
              Sem assinatura
            </h3>
            <p className="mt-1 text-body-sm text-ink-muted">Os outros recursos e como estão na sua conta.</p>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {semAssinar.map((r) => {
              const s = situacaoSemAssinar(r.e, agora);
              return (
                <li key={r.href} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-5">
                  <Link href={r.href} className="text-label hover:underline">
                    {r.nome}
                  </Link>
                  <span className={`text-body-sm ${s.aberto ? "text-cerrado-text" : "text-ink-muted"}`}>{s.texto}</span>
                </li>
              );
            })}
          </ul>
        </section>
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

/** Uma assinatura: o nome, o valor, como está, como paga e o que dá para fazer nela. */
function LinhaAssinatura({ a, hoje, subir }: { a: Assinatura; hoje: string; subir: Produto | null }) {
  const estado = estadoDa(a, hoje);
  const pagoAte = a.pago_ate ? dataEHora(a.pago_ate) : null;
  return (
    <li className="flex flex-col gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <p className="text-label">{NOME_PRODUTO[a.recurso]}</p>
          <p className="text-body-sm text-ink-muted">
            {formatarMoeda(a.valor)} {POR_CICLO[a.ciclo]}
          </p>
        </div>
        <Selo variante={estado.variante}>{estado.selo}</Selo>
      </div>
      <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-body-sm">
        <span className="flex items-center gap-1.5">
          {a.forma === "pix" ? (
            <QrCode aria-hidden className="size-4 text-ink-muted" />
          ) : (
            <CreditCard aria-hidden className="size-4 text-ink-muted" />
          )}
          {a.forma === "pix" ? "Pix, a cada fatura" : nomeDoCartao(a)}
        </span>
        {a.situacao === "ativa" && a.proxima_cobranca && (
          <span className="text-ink-muted">Renova em {dataDoDia(a.proxima_cobranca)}</span>
        )}
      </p>
      {estado.nota && <p className="text-body-sm text-ink-muted">{estado.nota}</p>}
      <div className="flex flex-wrap items-start gap-2">
        {a.situacao === "ativa" && (
          <BotaoLink href={`/painel/assinar?recurso=${a.recurso}&troca=1`} variante="secundario" tamanho="sm">
            <CreditCard aria-hidden />
            {a.forma === "cartao" ? "Trocar o cartão" : "Passar para o cartão"}
          </BotaoLink>
        )}
        {subir && (
          <BotaoLink href={`/painel/assinar?recurso=${subir}&mudar=1`} variante="secundario" tamanho="sm">
            Mudar para a faixa de cima
          </BotaoLink>
        )}
        {a.devolver ? (
          <DevolverPagamento cobranca={a.devolver.cobranca} valor={a.devolver.valor} ate={a.devolver.ate} />
        ) : (
          <CancelarAssinatura id={a.id} ate={pagoAte} />
        )}
      </div>
    </li>
  );
}

/** O plano por 30 dias (vale até quando, comprar mais, desistir em 7 dias) e as compras esperando o pagamento. */
function Compras({ compras, pag }: { compras: Compra[]; pag: PagamentosDaConta | null }) {
  return (
    <section aria-labelledby="compras" className="flex flex-col gap-3">
      <h3 id="compras" className="text-h3">
        Por 30 dias, sem renovar
      </h3>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
        {compras.map((k) => {
          const paga = k.situacao === "paga";
          const mensal = pag?.planos.find((p) => p.recurso === k.recurso && p.ciclo === "MONTHLY");
          return (
            <li key={k.id} className="flex flex-col gap-3 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="min-w-0">
                  <p className="text-label">
                    {NOME_PRODUTO[k.recurso]}
                    {k.tipo === "faixa" ? ": a diferença da troca de faixa" : ""}
                  </p>
                  <p className="text-body-sm text-ink-muted">
                    {formatarMoeda(k.valor)}
                    {k.tipo === "trinta_dias" ? ", uma vez só" : ""}
                  </p>
                </div>
                <Selo variante={paga ? "match" : "aviso"}>
                  {paga && k.ate ? `Vale até ${dataEHora(k.ate)}` : "Esperando o pagamento"}
                </Selo>
              </div>
              {paga && k.tipo === "trinta_dias" && (
                <p className="text-body-sm text-ink-muted">
                  Não renova sozinho. Comprar mais 30 dias soma ao fim; assinar começa a cobrar quando estes acabarem.
                </p>
              )}
              <div className="flex flex-wrap items-start gap-2">
                {!paga && k.cobranca && (
                  <BotaoLink href={`/painel/faturas/${k.cobranca}`} variante="secundario" tamanho="sm">
                    Ver a fatura
                  </BotaoLink>
                )}
                {paga && k.tipo === "trinta_dias" && (
                  <>
                    <BotaoLink href={`/painel/assinar?recurso=${k.recurso}&trinta=1`} variante="secundario" tamanho="sm">
                      Comprar mais 30 dias
                    </BotaoLink>
                    {mensal && (
                      <BotaoLink href={`/painel/assinar?recurso=${k.recurso}`} variante="fantasma" tamanho="sm">
                        Assinar por {formatarMoeda(mensal.valor)} por mês
                      </BotaoLink>
                    )}
                    {k.devolver && k.cobranca && (
                      <DevolverPagamento
                        cobranca={k.cobranca}
                        valor={k.valor}
                        ate={k.paga_em ? new Date(new Date(k.paga_em).getTime() + 7 * 86_400_000).toISOString() : null}
                      />
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Um recurso que a pessoa não assina: liberado pelo Publike, nos dias grátis ou fechado. */
function situacaoSemAssinar(e: EstadoRecurso | undefined, agora: number): { texto: string; aberto: boolean } {
  if (!e) return { texto: "Fechado", aberto: false };
  if (e.liberado && !e.ate) return { texto: "Liberado pelo Publike, sem prazo", aberto: true };
  if (e.liberado && e.ate) {
    const gratis = e.fim_experimento && new Date(e.fim_experimento).getTime() > agora;
    return { texto: gratis ? `Grátis até ${dataCurta(e.ate)}` : `Liberado até ${dataCurta(e.ate)}`, aberto: true };
  }
  if (e.experimentou) return { texto: "Os dias grátis acabaram", aberto: false };
  return { texto: "Dá para experimentar 15 dias grátis", aberto: false };
}

/**
 * Quando o plano que cabe nas vagas no ar sai mais barato que as assinaturas somadas (ou pelo mesmo valor, com mais
 * recursos), mostra a troca. Quem já assina um plano não vê.
 */
function PlanoQueJunta({
  pag,
  faixa,
  valendo,
  total,
}: {
  pag: PagamentosDaConta | null;
  faixa: { vagas_no_ar: number; agencia: boolean } | null;
  valendo: Assinatura[];
  total: number;
}) {
  if (valendo.some((a) => recursosDo(a.recurso).includes("carreiras"))) return null;
  const plano = planoQueCabe(pag, faixa);
  const mensal = plano ? pag?.planos.find((p) => p.recurso === plano && p.ciclo === "MONTHLY") : null;
  if (!plano || !mensal || mensal.valor > total + 30) return null;
  const menos = Math.round((total - mensal.valor) * 100) / 100;
  return (
    <section
      aria-labelledby="junta"
      className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-line-strong bg-surface-300 p-5"
    >
      <div className="min-w-0 flex-1 basis-72">
        <h3 id="junta" className="text-label">
          {NOME_PRODUTO[plano]}: {formatarMoeda(mensal.valor)} por mês
        </h3>
        <p className="mt-1 text-body-sm">
          {menos > 0
            ? `${formatarMoeda(menos)} a menos que hoje, e com todos os recursos.`
            : "Todos os recursos juntos, por pouco mais do que você paga hoje."}{" "}
          Cabe nas suas {faixa?.vagas_no_ar ?? 0} vagas no ar.
        </p>
      </div>
      <BotaoLink href="/painel/planos" tamanho="sm">
        Comparar
      </BotaoLink>
    </section>
  );
}
