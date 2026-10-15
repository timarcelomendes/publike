import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormNovaConta } from "@/components/admin/nova-conta";
import { Secao } from "@/components/admin/ui";
import { exigirAdminLocal } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Criar conta" };

export default function NovaConta() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  await exigirAdminLocal();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/admin/usuarios"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Usuários
      </Link>
      <Secao
        titulo="Criar conta"
        descricao="Para quem pediu ajuda para entrar no Publike, como uma agência que mandou a lista de vagas. Depois de criar, você publica as vagas em nome da conta e manda o e-mail de acesso."
      >
        <FormNovaConta />
      </Secao>
    </div>
  );
}
