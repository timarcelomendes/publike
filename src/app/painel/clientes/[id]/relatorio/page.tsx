import { ArrowLeft, BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotaoImprimir } from "@/components/finalistas/resposta-cliente";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { LinkDoRelatorio } from "@/components/relatorio/link-do-relatorio";
import { RelatorioDoCliente } from "@/components/relatorio/relatorio-do-cliente";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { primeiro } from "@/lib/formato";
import { datasDoPeriodo, lerRelatorio, periodoPedido, PERIODOS } from "@/lib/relatorio-cliente";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Relatório do cliente" };

// O relatório por cliente (migração 20270409120000; claude/plano-planos-empresa-e-agencia.md, etapa 2): o trabalho do
// período para mostrar ao cliente, com a marca da agência. Do Plano Agência (ou da cortesia da equipe).

export default function RelatorioDoClientePage({ params, searchParams }: PageProps<"/painel/clientes/[id]/relatorio">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/painel/clientes/[id]/relatorio">["params"];
  searchParams: PageProps<"/painel/clientes/[id]/relatorio">["searchParams"];
}) {
  if (MODO_DEMO) return <SoComSupabase />;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  await exigirUsuario(`/painel/clientes/${id}/relatorio`);
  const periodo = periodoPedido(primeiro(sp.periodo));
  const { de, ate } = datasDoPeriodo(periodo.dias, await agoraDaRequisicao());
  const { data, error } = await (await criarClienteServidor()).rpc("relatorio_do_cliente", {
    p_cliente: id,
    p_de: de,
    p_ate: ate,
  });
  if (error?.code === "P0002") notFound();
  const voltar = (
    <Link
      href={`/painel/clientes/${id}`}
      className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      data-nao-imprimir
    >
      <ArrowLeft aria-hidden className="size-4" />
      Cliente
    </Link>
  );
  if (error) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <Aviso tipo="alerta" titulo="Não deu para abrir o relatório agora">
          {error.code === "PGRST202" ? "O relatório ainda não está pronto." : "Tente de novo em instantes."}
        </Aviso>
      </div>
    );
  }
  const r = lerRelatorio(data);
  if (!r?.liberado) {
    return (
      <div className="flex max-w-2xl flex-col gap-4">
        {voltar}
        <section className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
          <span className="flex size-10 items-center justify-center rounded-pill bg-terra-soft">
            <BarChart3 aria-hidden className="size-5 text-terra-text" />
          </span>
          <h2 className="text-h2">Relatório para o cliente</h2>
          <p className="text-body text-ink-muted">
            Uma página por cliente com as vagas do período, os candidatos, os finalistas, o tempo até eles e os
            contratados, com a marca da sua agência. Você manda por link ou em PDF para mostrar o trabalho feito.
          </p>
          <p className="text-body">
            É do Plano Agência, que chega em breve. Quer testar antes? Fale com a equipe do Publike.
          </p>
        </section>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5" data-imprimir>
      {voltar}
      <div className="flex flex-wrap items-center justify-between gap-3" data-nao-imprimir>
        <nav aria-label="Período" className="flex flex-wrap gap-2">
          {PERIODOS.map((p) => (
            <Link
              key={p.valor}
              href={`/painel/clientes/${id}/relatorio${p.valor === "90" ? "" : `?periodo=${p.valor}`}`}
              aria-current={p.valor === periodo.valor ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-pill border px-4 text-label ${
                p.valor === periodo.valor ? "border-ink bg-ink text-surface-100" : "border-line hover:border-line-strong"
              }`}
            >
              {p.nome}
            </Link>
          ))}
        </nav>
        <BotaoImprimir />
      </div>
      <RelatorioDoCliente r={r} />
      <section className="rounded-lg border border-line bg-surface-200 p-5" data-nao-imprimir>
        <LinkDoRelatorio clienteId={id} inicial={r.token ? `${SITE_URL}/relatorio/${r.token}` : null} />
      </section>
    </div>
  );
}
