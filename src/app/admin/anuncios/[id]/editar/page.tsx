import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FormAnuncio } from "@/components/form-anuncio";
import { Esqueleto } from "@/components/ui/basicos";
import { salvarAnuncioDaEquipe } from "@/lib/acoes/moderacao";
import { iaConfigurada } from "@/lib/ia/openai";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import type { TipoAnuncio } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Corrigir anúncio" };

export default function CorrigirAnuncio({ params }: PageProps<"/admin/anuncios/[id]/editar">) {
  return (
    <div className="max-w-3xl">
      <Suspense fallback={<Esqueleto className="h-[60rem] w-full rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: { params: PageProps<"/admin/anuncios/[id]/editar">["params"] }) {
  const acesso = await acessoDaEquipe();
  if (!acesso) notFound();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { data: a } = await acesso.cliente.rpc("obter_anuncio", { p_id: id }).maybeSingle();
  if (!a) notFound();

  return (
    <>
      <Link
        href={`/admin/anuncios/${id}`}
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Voltar ao anúncio
      </Link>
      <h2 className="mt-1 text-h2">Corrigir anúncio</h2>
      <p className="mt-1 mb-6 text-body-sm text-ink-muted">
        De {a.autor_nome}. Corrija só o necessário, como tirar uma exigência irregular ou um erro de digitação.
      </p>
      <FormAnuncio
        equipe
        ia={acesso.admin && iaConfigurada()}
        acaoSalvar={salvarAnuncioDaEquipe}
        agencia={a.autor_tipo === "agencia"}
        inicial={{
          id: a.id,
          tipo: a.tipo as TipoAnuncio,
          titulo: a.titulo,
          descricao: a.descricao,
          categoria: a.categoria,
          regime: a.regime,
          pagamento_valor: a.pagamento_valor,
          pagamento_unidade: a.pagamento_unidade,
          beneficios: a.beneficios,
          horario: a.horario,
          vagas: a.vagas,
          pede_curriculo: a.pede_curriculo,
          contratante: a.contratante,
          contratante_confidencial: a.contratante_confidencial,
          cidade: a.cidade,
          bairro: a.bairro,
          lat: a.lat,
          lng: a.lng,
        }}
      />
    </>
  );
}
