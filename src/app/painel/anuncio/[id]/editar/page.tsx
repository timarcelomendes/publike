import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { FormAnuncio } from "@/components/form-anuncio";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { ajudaDaIADisponivel, obterAnuncio, obterMeuPerfil } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";
import { valoresDoAnuncio } from "@/lib/valores-anuncio";

export const metadata: Metadata = { title: "Editar anúncio" };

export default function EditarAnuncio({ params }: PageProps<"/painel/anuncio/[id]/editar">) {
  return (
    <div className="max-w-3xl">
      <Suspense fallback={<Esqueleto className="h-[60rem] w-full rounded-lg" />}>
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

  return (
    <>
      <Link
        href={`/painel/anuncio/${id}`}
        className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Voltar
      </Link>
      <h2 className="mt-1 mb-6 text-h2">Editar anúncio</h2>
      {anuncio.status === "em_analise" || anuncio.status === "removido" ? (
        <Aviso tipo="alerta" titulo="Este anúncio está com a moderação">
          Ele não pode ser alterado até a moderação analisar as denúncias.
        </Aviso>
      ) : (
        <FormAnuncio
          ia={ia}
          agencia={anuncio.autor_tipo === "agencia"}
          contatoAgencia={perfil ? { whatsapp: perfil.whatsapp, email: perfil.email } : null}
          enderecoPublico={anuncio.autor_tipo !== "pessoa"}
          inicial={valoresDoAnuncio(anuncio)}
        />
      )}
    </>
  );
}
