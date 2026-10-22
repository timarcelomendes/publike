import { Suspense } from "react";
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
  return <ListaSeguindo voltar="/painel/seguindo" />;
}
