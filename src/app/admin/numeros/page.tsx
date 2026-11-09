import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { NumerosDaEquipe } from "@/components/admin/numeros-da-equipe";
import { notFound } from "next/navigation";
import { ehModerador } from "@/lib/dados";
import { ehAdminLocal } from "@/lib/supabase/admin";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";

export const metadata: Metadata = { title: "Números" };

// Equipe › Números: os números do Painel no site, no mesmo lugar da moderação (Curtidas, Denúncias, Anúncios e Vagas
// do dia). Quem pode ver confere o banco (painel_no_site); o /equipe antigo leva para cá.
export default function Numeros() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  // a marca "Somente publike.org" (Admin › Quem vê cada tela) tira os números do moderador
  if (!(await ehAdminLocal()) && !(await possoVerTela("/admin/numeros"))) notFound();
  return <NumerosDaEquipe moderador={await ehModerador()} />;
}
