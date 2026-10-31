import { ChevronRight, FileCheck2, ReceiptText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { SeloDaFatura } from "@/components/pagamentos/selo-da-fatura";
import { Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { formatarMoeda } from "@/lib/formato";
import { dataDoDia, emAberto, NOME_PRODUTO, numeroDaFatura } from "@/lib/pagamentos";
import { minhasFaturas } from "@/lib/servidor/faturas";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Faturas", robots: { index: false } };

// As faturas da Triagem com IA e do Teste Prático, da mais nova para a mais antiga: a situação, o recibo e a nota.

export default function Faturas() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/faturas");
  const faturas = await minhasFaturas();
  const abertas = faturas.filter((f) => emAberto(f.situacao));

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-h2">Faturas</h2>
          <p className="mt-1 text-body text-ink-muted">Cada cobrança, com o recibo e a nota fiscal.</p>
        </div>
        <Link href="/painel/assinatura" className="text-label text-terra-text underline underline-offset-2">
          Ver assinatura
        </Link>
      </div>

      {faturas.length === 0 ? (
        <Vazio
          icone={ReceiptText}
          titulo="Nenhuma fatura ainda"
          acao={<BotaoLink href="/painel/assinatura">Ver assinatura</BotaoLink>}
        >
          Quando você assinar a Triagem com IA ou o Teste Prático, as faturas aparecem aqui.
        </Vazio>
      ) : (
        <>
          {abertas.length > 0 && (
            <p className="text-body">
              {abertas.length === 1 ? "1 fatura em aberto" : `${abertas.length} faturas em aberto`}:{" "}
              {formatarMoeda(abertas.reduce((s, f) => s + f.valor, 0))}.
            </p>
          )}
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
            {faturas.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/painel/faturas/${f.id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-surface-300 sm:px-5"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-label">{NOME_PRODUTO[f.recurso]}</span>
                      <SeloDaFatura situacao={f.situacao} />
                    </span>
                    <span className="text-body-sm text-ink-muted">
                      {numeroDaFatura(f.numero)} · vence em {dataDoDia(f.vencimento)}
                      {f.forma === "pix" ? " · Pix" : " · cartão"}
                    </span>
                  </span>
                  {f.nota?.situacao === "autorizada" && (
                    <FileCheck2 aria-label="Com nota fiscal" className="size-[18px] shrink-0 text-cerrado-text" />
                  )}
                  <span className="text-label tabular-nums">{formatarMoeda(f.valor)}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
