import { Eye } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import {
  deHoje,
  NumerosDoPainel,
  NumerosDoPainelEmbaixo,
  type Encerramento,
} from "@/components/admin/numeros-do-painel";
import { MetricasDeProduto } from "@/components/admin/metricas-produto";
import { Container, Selo } from "@/components/ui/basicos";
import type { AcessosSite, MetricasProduto, NumerosPainel, PresencaSite, TempoNasPaginas } from "@/lib/admin/dados";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = {
  title: "Números do Publike",
  robots: { index: false, follow: false },
};

// Os números do Painel do admin no site publicado, só leitura, para quem a equipe liberou (e-mail
// @publike.org, em Admin › Moderadores › Painel no site). O banco confere a cada leitura
// (`painel_no_site`); quem não pode recebe a página "não encontrada".

type PainelNoSite = {
  resumo: NumerosPainel;
  acessos: AcessosSite | null;
  /** sem a migração 20261130120000: não vem */
  presenca?: PresencaSite | null;
  /** sem a migração 20261207120000: não vem */
  metricas?: MetricasProduto | null;
  /** sem a migração 20261208120000: não vem */
  tempo?: TempoNasPaginas | null;
  encerramentos: Encerramento[];
  matches_hoje: number;
};

export default function PainelDaEquipe() {
  return (
    <Container className="py-8">
      <Suspense fallback={<EsqueletoAdmin />}>
        <Conteudo />
      </Suspense>
    </Container>
  );
}

async function Conteudo() {
  if (MODO_DEMO) notFound();
  // sem login (ou sem liberação), a página "não existe": ninguém de fora fica sabendo dela
  if (!(await obterUsuario())) notFound();
  const supabase = await criarClienteServidor();
  const [{ data, error }, agora] = await Promise.all([supabase.rpc("painel_no_site"), agoraDaRequisicao()]);
  if (error || !data) notFound();
  const p = data as unknown as PainelNoSite;
  const hoje = deHoje(p.resumo, p.matches_hoje, agora);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-h2 sm:text-h1">Números do Publike</h1>
        <Selo>
          <Eye aria-hidden />
          Só a equipe vê
        </Selo>
      </div>
      <p className="-mt-3 text-body-sm text-ink-muted">
        Os mesmos números do Painel do admin, sem nomes e sem botões. Atualizam cada vez que você abre a página.
      </p>
      <NumerosDoPainel n={p.resumo} hoje={hoje} acessos={p.acessos} presenca={p.presenca ?? null} links={false} />
      {p.metricas && <MetricasDeProduto m={p.metricas} tempo={p.tempo ?? null} />}
      <NumerosDoPainelEmbaixo n={p.resumo} encerramentos={p.encerramentos} />
    </div>
  );
}
