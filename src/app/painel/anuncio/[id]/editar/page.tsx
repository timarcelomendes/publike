import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { FormAnuncio } from "@/components/form-anuncio";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { ajudaDaIADisponivel, obterAnuncio, obterMeuPerfil } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";
import { valoresDoAnuncio } from "@/lib/valores-anuncio";
import { obterTriagem } from "@/lib/servidor/triagem";
import { clienteDaVaga, clientesParaVaga } from "@/lib/servidor/clientes";

export const metadata: Metadata = { title: "Editar anúncio" };

export default function EditarAnuncio({ params }: PageProps<"/painel/anuncio/[id]/editar">) {
  return (
    <div>
      <Suspense fallback={<Esqueleto className="h-[60rem] w-full max-w-3xl rounded-lg" />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

async function Conteudo({ params }: { params: PageProps<"/painel/anuncio/[id]/editar">["params"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/editar`);
  const [anuncio, ia, perfil] = await Promise.all([obterAnuncio(id), ajudaDaIADisponivel(), obterMeuPerfil()]);
  if (!anuncio || anuncio.autor_id !== usuario.id) notFound();
  // os serviços são editados juntos, no cadastro "Meus serviços"
  if (anuncio.tipo === "servico") redirect("/painel/servicos");
  const agencia = anuncio.autor_tipo === "agencia";
  const [triagem, cliente] = await Promise.all([obterTriagem(id), agencia ? clienteDaVaga(id) : null]);
  // a lista de clientes traz o desta vaga, mesmo arquivado
  const clientes = agencia ? await clientesParaVaga(cliente) : null;

  return (
    <>
      <div className="mb-6">
        <CabecalhoDaVaga anuncio={anuncio} aba="editar" />
      </div>
      <div className="max-w-3xl">
        {anuncio.status === "em_analise" || anuncio.status === "removido" ? (
          <Aviso tipo="alerta" titulo="Este anúncio está com a moderação">
            Ele não pode ser alterado até a moderação analisar as denúncias.
          </Aviso>
        ) : (
          <FormAnuncio
            ia={ia}
            agencia={agencia}
            contatoAgencia={perfil ? { whatsapp: perfil.whatsapp, email: perfil.email } : null}
            clientes={clientes}
            enderecoPublico={anuncio.autor_tipo !== "pessoa"}
            inicial={{ ...valoresDoAnuncio(anuncio, { triagem }), cliente_id: clientes ? cliente : null }}
          />
        )}
      </div>
    </>
  );
}
