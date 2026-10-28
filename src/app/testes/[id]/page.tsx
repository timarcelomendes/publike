import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SoComSupabase } from "@/components/so-com-supabase";
import { FazerTeste, type TesteParaFazer } from "@/components/testes/fazer-teste";
import { Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Teste da vaga", robots: { index: false } };

// O teste que a vaga pede (migração 20261204120000): só a própria pessoa abre.

export default function PaginaTeste({ params }: PageProps<"/testes/[id]">) {
  return (
    <Container className="max-w-xl py-8">
      <Suspense fallback={<Esqueleto className="h-96 w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ params }: { params: PageProps<"/testes/[id]">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await exigirUsuario(`/testes/${id}`);
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("avaliacao_para_fazer", { p_id: id });
  if (error || !data) notFound();
  const teste = data as unknown as TesteParaFazer;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-body-sm text-ink-muted">
          {teste.empresa} · {teste.vaga}
        </p>
        <h1 className="mt-1 text-h2">{teste.titulo}</h1>
      </div>
      <FazerTeste teste={teste} />
    </div>
  );
}
