import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SoComSupabase } from "@/components/so-com-supabase";
import { EditorDeTeste } from "@/components/testes/editor-teste";
import { MODO_DEMO } from "@/lib/config";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Novo teste" };

export default function NovoTeste() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/testes/novo");
  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/painel/testes"
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-label text-ink-muted hover:text-ink"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Testes Publike
      </Link>
      <h2 className="text-h2">Novo teste da sua empresa</h2>
      <EditorDeTeste id={null} />
    </div>
  );
}
