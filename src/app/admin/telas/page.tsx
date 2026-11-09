import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { TelasDoAdmin, type GrupoDeTelas } from "@/components/admin/telas-do-admin";
import { Secao } from "@/components/admin/ui";
import { Aviso } from "@/components/ui/basicos";
import { GRUPOS_ADMIN, TELAS_DO_SITE } from "@/lib/admin/telas";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";

export const metadata: Metadata = { title: "Quem vê cada tela" };

export default function Telas() {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  // o admin do computador do dono ou a equipe publike.org no site no ar
  const admin = await ehAdminLocal();
  if (!admin && !(await possoVerTela("/admin/telas"))) notFound();
  const c = admin ? criarClienteAdmin() : await criarClienteServidor();
  const { data, error } = await c.rpc("admin_telas_do_admin");
  if (error) {
    return (
      <Aviso tipo="alerta" titulo="A lista das telas ainda não está no banco">
        Rode a migração 20270327120000_telas_do_admin.sql no Supabase (SQL Editor) e abra esta página de novo.
      </Aviso>
    );
  }
  const marcas = new Map((data ?? []).map((t) => [t.rota, t.somente_publike]));
  const noSite = new Set(TELAS_DO_SITE.map((t) => t.href));
  const grupos: GrupoDeTelas[] = [
    { nome: "Equipe no site", secoes: [{ href: "/admin/numeros", nome: "Números" }] },
    ...GRUPOS_ADMIN.map((g) => ({ nome: g.nome ?? "Início", secoes: g.secoes })),
  ].map((g) => ({
    nome: g.nome,
    telas: g.secoes.map((s) => ({
      ...s,
      // sem a linha no banco, a tela conta como marcada (a regra do banco)
      somente: marcas.get(s.href) ?? true,
      noSite: noSite.has(s.href),
      fixa: s.href === "/admin/telas",
    })),
  }));

  return (
    <Secao
      titulo="Quem vê cada tela"
      descricao={
        <>
          Marque <b className="font-semibold text-ink">Somente publike.org</b> nas telas que só a equipe vê: as contas
          com e-mail @publike.org liberadas em Moderadores › Painel no site. O moderador vê, no site, as telas sem a
          marca. Aqui no computador do admin, tudo continua aberto. As telas com “só no computador do admin” ainda não
          funcionam no site; elas vão abrindo aos poucos, e a marca já vale quando abrirem.
        </>
      }
    >
      <TelasDoAdmin grupos={grupos} />
    </Secao>
  );
}
