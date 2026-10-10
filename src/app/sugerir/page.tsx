import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormSugestao } from "@/components/form-sugestao";
import { Container, Esqueleto } from "@/components/ui/basicos";
import { obterUsuario } from "@/lib/dados";
import { caminhoSeguro, primeiro } from "@/lib/formato";
import { ehTipoSugestao } from "@/lib/sugestoes";

export const metadata: Metadata = {
  title: "Sugestões e erros",
  description: "Achou um erro, tem uma ideia ou quer elogiar? Mande para a equipe do Publike. Não precisa ter conta.",
};

export default function Sugerir({ searchParams }: PageProps<"/sugerir">) {
  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <h1 className="text-h1">Sugestões e erros</h1>
      <p className="mt-3 max-w-2xl text-body-lg text-ink-muted">
        Achou um erro, tem uma ideia ou quer elogiar? Mande para a equipe do Publike: a gente lê tudo. Não precisa ter
        conta.
      </p>
      <p className="mt-2 text-body-sm text-ink-muted">
        Tem uma dúvida? Veja a{" "}
        <Link href="/ajuda" className="underline">
          página de ajuda
        </Link>
        . Viu um anúncio estranho? Use “Denunciar anúncio”, dentro do próprio anúncio.
      </p>
      <section className="mt-8 rounded-lg border border-line bg-surface-200 p-5 sm:p-6">
        <Suspense fallback={<Esqueleto className="h-80" />}>
          <Conteudo searchParams={searchParams} />
        </Suspense>
      </section>
    </Container>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/sugerir">["searchParams"] }) {
  const [sp, usuario] = await Promise.all([searchParams, obterUsuario()]);
  const tipo = primeiro(sp.tipo);
  const pagina = caminhoSeguro(primeiro(sp.de), "") || null;
  return <FormSugestao tipoInicial={ehTipoSugestao(tipo) ? tipo : null} pagina={pagina} logado={Boolean(usuario)} />;
}
