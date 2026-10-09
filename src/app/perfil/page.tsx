import { ChevronRight, FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
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
      {perfil && (
        <Link
          href="/perfil/curriculo"
          className="mt-8 flex items-center gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card hover:border-line-strong"
        >
          <FileText aria-hidden className="size-6 shrink-0 text-terra-text" />
          <span className="min-w-0 flex-1">
            <span className="block text-h3">Meu currículo</span>
            <span className="block text-body-sm text-ink-muted">
              Para vagas com carteira e estágio. Só vê quem anunciou uma vaga que você curtiu.
            </span>
          </span>
          <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted" />
        </Link>
      )}
      {perfil && <ExcluirConta />}
    </>
  );
}
