import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { VagasDaGupyDoConvite } from "@/components/admin/vagas-da-gupy-do-convite";
import { Aviso } from "@/components/ui/basicos";
import { TemVoltarProprio } from "@/components/voltar";
import type { Convite } from "@/lib/convites";
import { paginaDeVagasDaGupy } from "@/lib/gupy";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Publicar as vagas da Gupy com o sim da empresa" };

// A empresa com as vagas na Gupy respondeu "sim" à mensagem "Vagas da Gupy" (claude/plano-quem-contrata-nos-convites.md):
// a conta é criada aqui, se ainda não existir, e o "Puxar do link da Gupy" da conta abre com a lista das vagas dela.
export default function PublicarVagasDaGupy({ params }: PageProps<"/admin/convites/[id]/gupy">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      {params.then(({ id }) => (
        <Conteudo id={id} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ id }: { id: string }) {
  const c = await exigirAdminLocal();
  if (!UUID.test(id)) notFound();
  const { data } = await c.from("convites").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const convite = data as unknown as Convite;
  const { data: conta } = convite.usuario_id
    ? await c.from("perfis").select("id, nome").eq("id", convite.usuario_id).maybeSingle()
    : { data: null };
  const pagina = paginaDeVagasDaGupy(convite.link_vagas);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/admin/convites"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        <TemVoltarProprio />
        Convites
      </Link>
      <h2 className="text-h2">Publicar as vagas da Gupy de {convite.nome}</h2>
      {!pagina ? (
        <Aviso tipo="erro" titulo="Este convite não tem o link da Gupy">
          Volte aos convites e ponha, no cartão de {convite.nome}, o link da página de vagas (https://empresa.gupy.io).
        </Aviso>
      ) : (
        <>
          <p className="text-body text-ink-muted">
            Para quando a empresa respondeu “sim” à mensagem das vagas da Gupy.{" "}
            {conta
              ? `As vagas saem na conta ${conta.nome}.`
              : "A conta da empresa é criada agora, com os dados abaixo, e as vagas saem no nome dela."}{" "}
            Depois, abre a lista das vagas da página dela na Gupy: escolha as que vão para o Publike e publique de uma
            vez. Elas saem com o botão “Candidatar no site da empresa” e saem do ar sozinhas quando fecham lá. O convite
            fica como Autorizou.
          </p>
          <VagasDaGupyDoConvite convite={convite} conta={conta} pagina={pagina} />
        </>
      )}
    </div>
  );
}
