import type { Metadata } from "next";
import { Suspense } from "react";
import { ExcluirConta, FormPerfil } from "@/components/form-perfil";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Container, Esqueleto } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { caminhoSeguro, primeiro } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = {
  title: "Meu perfil",
  robots: { index: false },
};

export default function PaginaPerfil({ searchParams }: PageProps<"/perfil">) {
  return (
    <Container className="max-w-2xl py-8">
      <h1 className="text-h2 sm:text-h1">Meu perfil</h1>
      <p className="mt-2 mb-6 text-body text-ink-muted">
        É o que quem publica vê quando você curte um anúncio.
      </p>
      <Suspense fallback={<Esqueleto className="h-[48rem] w-full rounded-lg" />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/perfil">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const usuario = await exigirUsuario("/perfil");
  const perfil = await obterMeuPerfil();
  const proximo = caminhoSeguro(primeiro(sp.next), "");

  return (
    <>
      <FormPerfil
        perfil={perfil}
        usuarioId={usuario.id}
        telefone={usuario.telefone}
        email={usuario.email}
        nomeSugerido={usuario.nome}
        completar={primeiro(sp.completar) === "1" || !perfil}
        proximo={proximo}
      />
      {perfil && <ExcluirConta />}
    </>
  );
}
