import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ContaDoConvite } from "@/components/admin/conta-do-convite";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormAnuncio, type ValoresAnuncio } from "@/components/form-anuncio";
import { Aviso } from "@/components/ui/basicos";
import { publicarConvitePeloAdmin } from "@/lib/acoes/admin-convites";
import { rascunhoValido, type Convite } from "@/lib/convites";
import { iaConfigurada } from "@/lib/ia/openai";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { UUID } from "@/lib/validacao";
import { valoresDoConvite } from "@/lib/valores-convite";
import { PRACA_PADRAO } from "@/lib/pracas";

export const metadata: Metadata = { title: "Publicar com o sim da empresa" };

// A empresa respondeu "sim" no WhatsApp (ou por e-mail) mas não abriu o link: o admin confere a vaga
// lida do anúncio e publica por ela. A conta da empresa é criada aqui, se ainda não existir.
export default function PublicarConvite({ params }: PageProps<"/admin/convites/[id]/publicar">) {
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
  const rascunho = rascunhoValido(convite.rascunho);
  const base: ValoresAnuncio = {
    tipo: "vaga",
    titulo: convite.vagas[0] ?? "",
    descricao: "",
    categoria: "",
    regime: null,
    pagamento_valor: null,
    pagamento_unidade: null,
    beneficios: null,
    horario: null,
    vagas: 1,
    cidade: PRACA_PADRAO.cidade,
    bairro: "",
    lat: null,
    lng: null,
  };
  const inicial = rascunho ? valoresDoConvite(rascunho, base) : base;
  const fone = convite.whatsapp[0];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/admin/convites"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Convites
      </Link>
      <h2 className="text-h2">Publicar a vaga de {convite.nome}</h2>
      <p className="-mt-3 text-body text-ink-muted">
        Para quando a empresa disse “sim” mas não abriu o link. Confira a vaga (veio do anúncio dela) e publique:{" "}
        {conta
          ? `ela sai na conta ${conta.nome}.`
          : "a conta da empresa é criada agora, com os dados abaixo, e a vaga sai no nome dela."}{" "}
        O convite fica como Autorizou.
      </p>
      {convite.anuncio_id && (
        <Aviso tipo="alerta" titulo="Este convite já tem uma vaga publicada">
          Publicar de novo cria outra vaga.{" "}
          <Link href={`/anuncio/${convite.anuncio_id}`} className="underline underline-offset-2">
            Ver a vaga publicada
          </Link>
        </Aviso>
      )}
      <FormAnuncio
        inicial={inicial}
        acaoSalvar={publicarConvitePeloAdmin.bind(null, convite.id)}
        ia={iaConfigurada()}
        agencia={convite.tipo === "agencia"}
        contatoAgencia={{ whatsapp: fone ? `55${fone}` : null, email: convite.email }}
        enderecoPublico
        emNomeDe={convite.nome}
        previa={<ContaDoConvite convite={convite} conta={conta} />}
      />
    </div>
  );
}
