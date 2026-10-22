import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
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
    <div className="max-w-3xl">
      <Suspense fallback={<Esqueleto className="h-[40rem] w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/clientes/[id]/editar">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  await exigirUsuario(`/painel/clientes/${id}/editar`);
  const [cliente, perfil] = await Promise.all([obterMeuCliente(id), obterMeuPerfil()]);
  if (!cliente) notFound();
  return (
    <>
      <Link
        href={`/painel/clientes/${id}`}
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {cliente.nome}
      </Link>
      <h2 className="mt-1 text-h2">Editar cliente</h2>
      <p className="mt-1 mb-6 text-body text-ink-muted">
        Trocar o nome troca também nas vagas deste cliente que mostram o nome.
      </p>
      <FormCliente cliente={cliente} cidadePadrao={perfil?.cidade ?? PRACA_PADRAO.cidade} />
    </>
  );
}
