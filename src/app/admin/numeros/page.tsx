import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { NumerosDaEquipe } from "@/components/admin/numeros-da-equipe";
import { ehModerador } from "@/lib/dados";

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
  return <NumerosDaEquipe moderador={await ehModerador()} />;
}
