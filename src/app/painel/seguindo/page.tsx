import { Suspense } from "react";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { ListaSeguindo } from "@/components/social/lista-seguindo";
import { SoComSupabase } from "@/components/so-com-supabase";
import { MODO_DEMO } from "@/lib/config";
import { exigirUsuario } from "@/lib/sessao";

export default function Seguindo() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/seguindo");
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        titulo="Seguindo"
        descricao="As empresas que você segue e as buscas que avisam você das vagas novas."
      />
      <ListaSeguindo voltar="/painel/seguindo" />
    </div>
  );
}
