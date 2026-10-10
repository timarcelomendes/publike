import type { Metadata } from "next";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { QuadroSugestoes } from "@/components/admin/sugestoes";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { exigirAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Sugestões" };

export default function Sugestoes() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  const c = await exigirAdminLocal();
  const [{ data, error }, agora] = await Promise.all([c.rpc("admin_listar_sugestoes"), agoraDaRequisicao()]);
  return (
    <Secao
      titulo="Sugestões, erros, elogios e melhorias"
      descricao="O que as pessoas mandam pela página Sugestões e erros (/sugerir), com ou sem conta. Arraste os cartões entre as colunas; o que está feito ou descartado há mais de 90 dias sai do quadro."
    >
      {error ? (
        <Aviso tipo="erro" titulo="Não deu para ler as sugestões">
          Confira se a migração 20261010120000_sugestoes_assistente.sql já rodou no Supabase.
        </Aviso>
      ) : (
        <QuadroSugestoes itens={data ?? []} agora={agora} />
      )}
    </Secao>
  );
}
