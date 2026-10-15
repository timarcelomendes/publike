import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormNovaConta, type InicialNovaConta } from "@/components/admin/nova-conta";
import { Secao } from "@/components/admin/ui";
import { formatarFone } from "@/lib/convites";
import { primeiro } from "@/lib/formato";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Criar conta" };

export default function NovaConta({ searchParams }: PageProps<"/admin/usuarios/nova">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin/usuarios/nova">["searchParams"] }) {
  const [c, sp] = await Promise.all([exigirAdminLocal(), searchParams]);
  // vindo de um convite que a empresa autorizou: o formulário já vem preenchido
  const conviteId = primeiro(sp.convite);
  let inicial: InicialNovaConta | undefined;
  if (conviteId && UUID.test(conviteId)) {
    const { data: cv } = await c
      .from("convites")
      .select("id, nome, tipo, whatsapp, telefones, email, nota")
      .eq("id", conviteId)
      .maybeSingle();
    if (cv) {
      const fone = cv.whatsapp[0] ?? cv.telefones[0];
      inicial = {
        convite: cv.id,
        nome: cv.nome,
        tipo: cv.tipo === "agencia" ? "agencia" : "empresa",
        login: cv.email ?? "",
        whatsapp: fone ? formatarFone(fone) : "",
        nota: cv.nota,
      };
    }
  }
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
        descricao="Para quem pediu ajuda para entrar no Publike: quem procura trabalho, quem presta serviço, um comércio, uma empresa ou uma agência. Depois de criar, você publica as vagas ou monta a vitrine de serviços em nome da conta e manda o e-mail de acesso."
      >
        <FormNovaConta inicial={inicial} />
      </Secao>
    </div>
  );
}
