import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { EditorDeTeste } from "@/components/testes/editor-teste";
import { comVaga, vagaDaVolta, VoltarParaVaga } from "@/components/testes/voltar-para-vaga";
import { MODO_DEMO } from "@/lib/config";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Novo teste" };

export default function NovoTeste({ searchParams }: PageProps<"/painel/testes/novo">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/testes/novo">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const usuario = await exigirUsuario("/painel/testes/novo");
  const vaga = await vagaDaVolta(sp.vaga, usuario.id);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-5">
        <Link
          href={comVaga("/painel/testes", vaga)}
          className="inline-flex min-h-11 items-center gap-1.5 self-start text-label text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden className="size-4" />
          Testes Publike
        </Link>
        {vaga && <VoltarParaVaga vaga={vaga} />}
      </div>
      <h2 className="text-h2">Novo teste da sua empresa</h2>
      {/* criado pela vaga: depois de salvar, volta para os testes dela com o teste novo escolhido */}
      <EditorDeTeste id={null} vaga={vaga?.id ?? null} />
    </div>
  );
}
