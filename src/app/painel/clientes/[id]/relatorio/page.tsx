import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BotaoImprimir } from "@/components/finalistas/resposta-cliente";
import { CabecalhoDaPagina, LinkVoltar } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { Segmentos } from "@/components/painel/segmentos";
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
  const voltar = <LinkVoltar href={`/painel/clientes/${id}`}>Cliente</LinkVoltar>;
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
      <div className="flex flex-col gap-6">
        <CabecalhoDaPagina
          voltar={{ href: `/painel/clientes/${id}`, nome: "Cliente" }}
          titulo="Relatório para o cliente"
          descricao="Uma página por cliente com as vagas do período, os candidatos, os finalistas, o tempo até eles e os contratados, com a marca da sua agência. Você manda por link ou em PDF para mostrar o trabalho feito."
        />
        <Aviso tipo="info" titulo="É do Plano Agência, que chega em breve">
          Quer testar antes? Fale com a equipe do Publike.
        </Aviso>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5" data-imprimir>
      {voltar}
      <div className="flex flex-wrap items-center justify-between gap-3" data-nao-imprimir>
        <Segmentos
          rotulo="Período"
          opcoes={PERIODOS.map((p) => ({
            nome: p.nome,
            href: `/painel/clientes/${id}/relatorio${p.valor === "90" ? "" : `?periodo=${p.valor}`}`,
            ativo: p.valor === periodo.valor,
          }))}
        />
        <BotaoImprimir />
      </div>
      <RelatorioDoCliente r={r} />
      <section className="rounded-lg border border-line bg-surface-200 p-5" data-nao-imprimir>
        <LinkDoRelatorio clienteId={id} inicial={r.token ? `${SITE_URL}/relatorio/${r.token}` : null} />
      </section>
    </div>
  );
}
