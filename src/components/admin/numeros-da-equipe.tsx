import { Eye } from "lucide-react";
import { notFound } from "next/navigation";
import {
  deHoje,
  NumerosDoPainel,
  NumerosDoPainelEmbaixo,
  type Encerramento,
} from "./numeros-do-painel";
import { MetricasDeProduto } from "./metricas-produto";
import { Aviso, Selo } from "@/components/ui/basicos";
import type { AcessosSite, MetricasProduto, NumerosPainel, PresencaSite, TempoNasPaginas } from "@/lib/admin/dados";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

// Os números do Painel do admin no site publicado, só leitura, para quem a equipe liberou (e-mail
// @publike.org, em Admin › Moderadores › Painel no site) e para o moderador quando Números está sem a marca
// "Somente publike.org" (migração 20270330120000). O banco confere a cada leitura (`painel_no_site`). Fica em Equipe › Números (/admin/numeros), junto da moderação; o /equipe antigo leva para lá.

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

/**
 * Os números do Publike para a equipe. `moderador`: quem modera e ainda não tem o Painel liberado vê o aviso de como
 * pedir (na aba Números da equipe); os outros sem acesso recebem a página "não encontrada".
 */
export async function NumerosDaEquipe({ moderador = false }: { moderador?: boolean }) {
  if (MODO_DEMO) notFound();
  // sem login (ou sem liberação), a página "não existe": ninguém de fora fica sabendo dela
  if (!(await obterUsuario())) notFound();
  const supabase = await criarClienteServidor();
  const [{ data, error }, agora] = await Promise.all([supabase.rpc("painel_no_site"), agoraDaRequisicao()]);
  if (error || !data) {
    if (!moderador) notFound();
    return (
      <Aviso tipo="info" titulo="Os números ainda não abrem para a sua conta">
        Eles abrem para a equipe com e-mail @publike.org liberada em Admin › Moderadores e, quando Números está sem a
        marca &ldquo;Somente publike.org&rdquo; em Admin › Quem vê cada tela, também para quem modera.
      </Aviso>
    );
  }
  const p = data as unknown as PainelNoSite;
  const hoje = deHoje(p.resumo, p.matches_hoje, agora);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-h2">Números do Publike</h2>
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
