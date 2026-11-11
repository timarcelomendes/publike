import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { FormCliente } from "@/components/painel/form-cliente";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { obterMeuCliente } from "@/lib/servidor/clientes";
import { exigirUsuario } from "@/lib/sessao";
import { PRACA_PADRAO } from "@/lib/pracas";

export const metadata: Metadata = { title: "Editar cliente" };

export default function EditarCliente({ params }: PageProps<"/painel/clientes/[id]/editar">) {
  return (
    <Suspense fallback={<Esqueleto className="h-[40rem] w-full max-w-3xl rounded-lg" />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/clientes/[id]/editar">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  await exigirUsuario(`/painel/clientes/${id}/editar`);
  const [cliente, perfil] = await Promise.all([obterMeuCliente(id), obterMeuPerfil()]);
  if (!cliente) notFound();
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        voltar={{ href: `/painel/clientes/${id}`, nome: cliente.nome }}
        titulo="Editar cliente"
        descricao="Trocar o nome troca também nas vagas deste cliente que mostram o nome."
      />
      {/* um formulário: numa coluna de ler bem */}
      <div className="max-w-3xl">
        <FormCliente cliente={cliente} cidadePadrao={perfil?.cidade ?? PRACA_PADRAO.cidade} />
      </div>
    </div>
  );
}
