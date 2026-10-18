import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ContaDoConvite } from "@/components/admin/conta-do-convite";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { FormServicos, type ValoresServicos } from "@/components/form-servicos";
import { Aviso } from "@/components/ui/basicos";
import { montarVitrinePeloAdmin } from "@/lib/acoes/admin-convites";
import { UNIDADES_SERVICO } from "@/lib/constantes";
import { rascunhoValido, type Convite } from "@/lib/convites";
import { regiaoDoBairro } from "@/lib/regioes";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Vitrine com o sim do prestador" };

// O prestador de serviço respondeu "sim" ao convite: o admin confere o serviço lido do anúncio e
// monta a vitrine no nome dele. A conta é criada aqui, se ainda não existir.
export default function VitrineDoConvite({ params }: PageProps<"/admin/convites/[id]/vitrine">) {
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
  // a conta já tem vitrine: os serviços dela vêm junto (salvar troca a lista inteira)
  const { data: existentes } = conta ? await c.rpc("admin_servicos_de", { p_usuario: conta.id }) : { data: null };
  const r = rascunhoValido(convite.rascunho);
  const titulo = r?.titulo || convite.vagas[0] || "";
  const bairro = r?.bairro ?? "";
  const cidade = r?.cidade || "Goiânia";
  const regiao = regiaoDoBairro(cidade, bairro);
  const unidade = r && (UNIDADES_SERVICO as readonly string[]).includes(r.unidade) ? r.unidade : null;
  const inicial: ValoresServicos = {
    servicos: [
      ...(existentes ?? []).map((x) => ({
        id: x.id,
        oficio: x.oficio,
        categoria: x.categoria,
        titulo: x.titulo,
        descricao: x.descricao,
        pagamento_valor: x.pagamento_valor,
        pagamento_unidade: x.pagamento_unidade,
        fotos: x.fotos,
        status: x.status,
      })),
      ...(titulo && !convite.anuncio_id
        ? [
            {
              id: "",
              oficio: r?.oficio || null,
              categoria: r?.categoria ?? "",
              titulo,
              descricao: r?.descricao ?? "",
              pagamento_valor: unidade ? (r?.salario ?? null) : null,
              pagamento_unidade: unidade,
              fotos: [],
              status: "novo",
            },
          ]
        : []),
    ],
    cidade,
    bairro,
    lat: null,
    lng: null,
    atende: [regiao ? `Goiânia: ${regiao}` : cidade],
    horario: null,
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        href="/admin/convites"
        className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Convites
      </Link>
      <h2 className="text-h2">Vitrine de serviços de {convite.nome}</h2>
      <p className="-mt-3 text-body text-ink-muted">
        Para quando a pessoa disse “sim” ao convite. Confira o serviço (veio do anúncio dela) e salve:{" "}
        {conta ? `a vitrine sai na conta ${conta.nome}.` : "a conta é criada agora, com os dados abaixo."} Sem ponto no
        mapa, vale o meio do bairro. O convite fica como Autorizou.
      </p>
      {convite.anuncio_id && (
        <Aviso tipo="alerta" titulo="Este convite já tem uma vitrine">
          Os serviços da conta já estão abaixo: confira e salve se quiser mudar algo.{" "}
          <Link href={`/anuncio/${convite.anuncio_id}`} className="underline underline-offset-2">
            Ver o serviço publicado
          </Link>
        </Aviso>
      )}
      <FormServicos
        inicial={inicial}
        usuarioId={conta?.id ?? "convite"}
        acaoSalvar={montarVitrinePeloAdmin.bind(null, convite.id)}
        emNomeDe={convite.nome}
        extras={<ContaDoConvite convite={convite} conta={conta} />}
      />
    </div>
  );
}
