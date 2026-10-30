import { ArrowLeft, CircleCheck, CreditCard, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotaoImprimir } from "@/components/pagamentos/imprimir";
import { PixDaFatura } from "@/components/pagamentos/pix-da-fatura";
import { SeloDaFatura } from "@/components/pagamentos/selo-da-fatura";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Logo } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { formatarDocumento } from "@/lib/documento";
import { formatarMoeda } from "@/lib/formato";
import { dataDoDia, dataEHora, emAberto, NOME_CICLO, NOME_PRODUTO, numeroDaFatura } from "@/lib/pagamentos";
import { minhaFatura, qrDoPix } from "@/lib/servidor/faturas";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Fatura", robots: { index: false } };

// Uma fatura: o Pix para pagar (em aberto), o recibo (paga) e a nota fiscal. Tudo com a marca do Publike.

export default function PaginaFatura({ params }: PageProps<"/painel/faturas/[id]">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-2">
      <dt className="text-body-sm text-ink-muted">{rotulo}</dt>
      <dd className="text-body">{children}</dd>
    </div>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/faturas/[id]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  await exigirUsuario(`/painel/faturas/${id}`);
  const f = await minhaFatura(id);
  if (!f) notFound();
  const aberta = emAberto(f.situacao);
  const pix = aberta && f.forma === "pix" ? await qrDoPix(f.id) : null;
  const paga = f.situacao === "paga";
  const nota = f.nota;

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <Link
        href="/painel/faturas"
        className="flex items-center gap-1 self-start text-label text-terra-text print:hidden"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Faturas
      </Link>

      {aberta && f.forma === "pix" && (
        <section
          aria-labelledby="pagar-pix"
          className="flex flex-col gap-4 rounded-lg border border-line-strong bg-surface-200 p-5 shadow-card print:hidden"
        >
          <div>
            <h2 id="pagar-pix" className="text-h2">
              Pague {formatarMoeda(f.valor)} com Pix
            </h2>
            <p className="mt-1 text-body-sm text-ink-muted">
              {f.situacao === "atrasada"
                ? "A fatura venceu. Pague agora para o recurso não fechar."
                : `Vence em ${dataDoDia(f.vencimento)}.`}
            </p>
          </div>
          {pix ? (
            <PixDaFatura id={f.id} imagem={pix.imagem} codigo={pix.codigo} />
          ) : (
            <Aviso tipo="alerta" titulo="O Pix não abriu agora">
              Atualize a página em instantes.
            </Aviso>
          )}
        </section>
      )}

      {aberta && f.forma === "cartao" && (
        <Aviso
          tipo={f.situacao === "pendente" ? "info" : "alerta"}
          titulo={f.situacao === "pendente" ? "Cobrança no cartão" : "O cartão não passou"}
          className="print:hidden"
        >
          <span className="flex flex-col items-start gap-2">
            <span>
              {f.situacao === "pendente"
                ? `Vai ser cobrada no cartão em ${dataDoDia(f.vencimento)}. Você não precisa fazer nada.`
                : "Pague esta fatura com outro cartão ou com Pix, ou troque o cartão da assinatura."}
            </span>
            {f.situacao !== "pendente" && (
              <span className="flex flex-wrap gap-3">
                {f.link_pagar && (
                  <a href={f.link_pagar} className="text-label text-terra-text underline underline-offset-2">
                    Pagar esta fatura
                  </a>
                )}
                <Link
                  href={`/painel/assinar?recurso=${f.recurso}&troca=1`}
                  className="text-label text-terra-text underline underline-offset-2"
                >
                  Trocar o cartão
                </Link>
              </span>
            )}
          </span>
        </Aviso>
      )}

      {paga && (
        <Aviso tipo="sucesso" titulo="Pagamento confirmado" className="print:hidden">
          {NOME_PRODUTO[f.recurso]}: liberado até {dataEHora(f.periodo_ate)}.
        </Aviso>
      )}

      {/* o recibo (e a fatura, enquanto em aberto): é o que sai no Imprimir */}
      <article
        aria-labelledby="recibo"
        className="flex flex-col gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card sm:p-6 print:border-0 print:shadow-none"
      >
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Logo altura={26} />
            <h2 id="recibo" className="text-h3">
              {paga ? "Recibo" : "Fatura"} {numeroDaFatura(f.numero)}
            </h2>
          </div>
          <SeloDaFatura situacao={f.situacao} />
        </header>
        <dl className="flex flex-col divide-y divide-line">
          <Linha rotulo="Para">
            {f.conta.nome ?? "—"}
            {f.conta.cpf_cnpj ? ` · ${formatarDocumento(f.conta.cpf_cnpj)}` : ""}
          </Linha>
          <Linha rotulo="O que é">
            {NOME_PRODUTO[f.recurso]}
            {f.ciclo ? ` · ${NOME_CICLO[f.ciclo].toLowerCase()}` : ""}
          </Linha>
          <Linha rotulo="Período">
            {dataDoDia(f.vencimento)} a {dataEHora(f.periodo_ate)}
          </Linha>
          <Linha rotulo="Vencimento">{dataDoDia(f.vencimento)}</Linha>
          {f.pago_em && <Linha rotulo="Pago em">{dataEHora(f.pago_em)}</Linha>}
          <Linha rotulo="Forma">
            {f.forma === "pix" ? (
              "Pix"
            ) : (
              <span className="flex items-center gap-1.5">
                <CreditCard aria-hidden className="size-4 text-ink-muted" />
                Cartão de crédito
              </span>
            )}
          </Linha>
          <div className="flex justify-between gap-4 pt-3">
            <dt className="text-label">Total</dt>
            <dd className="text-h3 tabular-nums">{formatarMoeda(f.valor)}</dd>
          </div>
        </dl>
        <footer className="flex flex-col gap-3 border-t border-line pt-4">
          {nota?.situacao === "autorizada" ? (
            <a
              href={`/painel/faturas/${f.id}/nota`}
              className="flex items-center gap-2 self-start text-label text-terra-text underline underline-offset-2 print:hidden"
            >
              <FileText aria-hidden className="size-[18px]" />
              Nota fiscal{nota.numero ? ` nº ${nota.numero}` : ""} (PDF)
            </a>
          ) : paga ? (
            <p className="flex items-center gap-2 text-body-sm text-ink-muted">
              <CircleCheck aria-hidden className="size-4" />
              {nota?.situacao === "erro"
                ? "A nota fiscal teve um problema e o Publike já está vendo."
                : "A nota fiscal sai em até 1 dia útil e aparece aqui."}
            </p>
          ) : null}
          {paga && (
            <div className="print:hidden">
              <BotaoImprimir />
            </div>
          )}
          <p className="text-caption text-ink-muted">Publike · publike.org</p>
        </footer>
      </article>
    </div>
  );
}
