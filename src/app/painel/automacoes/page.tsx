import { ChevronRight, Workflow } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FaixaExperimento, OfertaRecurso } from "@/components/recurso-pago";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { recursosPagos } from "@/lib/dados";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Automações" };

// As automações de todas as vagas (claude/plano-fluxo-contratar.md, parte 6): as prontas são grátis em cada vaga;
// as Automações sob medida (migração 20270114120000) mostram aqui a oferta dos 15 dias grátis ou os dias que faltam.

export default function Automacoes() {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo />
    </Suspense>
  );
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/automacoes");
  const [recursos, agora, supabase] = await Promise.all([recursosPagos(), agoraDaRequisicao(), criarClienteServidor()]);
  const estado = recursos?.automacoes.indisponivel ? null : (recursos?.automacoes ?? null);
  const { data: vagas } = await supabase
    .from("anuncios")
    .select("id, titulo, status, expira_em")
    .eq("autor_id", usuario.id)
    .eq("tipo", "vaga")
    .eq("status", "ativo")
    .order("criado_em", { ascending: false })
    .limit(50);
  const noAr = (vagas ?? []).filter((v) => new Date(v.expira_em).getTime() > agora);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-h2">Automações</h2>
          <Selo variante="novo">Novo</Selo>
        </div>
        <p className="max-w-2xl text-body text-ink-muted">
          O Publike faz sozinho o que você faria à mão: confirmar que a candidatura chegou, lembrar você de quem está
          parado, dar o retorno a quem ficou sem resposta, marcar a vaga como preenchida quando completar. Tudo começa
          desligado; você liga em cada vaga, e as prontas são grátis.
        </p>
      </div>
      {estado?.liberado ? (
        <FaixaExperimento recurso="automacoes" estado={estado} agora={agora} />
      ) : (
        <OfertaRecurso recurso="automacoes" estado={estado} />
      )}
      {noAr.length === 0 ? (
        <Vazio
          icone={Workflow}
          titulo="Nenhuma vaga no ar"
          acao={
            <BotaoLink href="/publicar" tamanho="sm">
              Publicar vaga
            </BotaoLink>
          }
        >
          As automações ficam em cada vaga.
        </Vazio>
      ) : (
        <section aria-labelledby="vagas-automacoes" className="flex flex-col gap-3">
          <h3 id="vagas-automacoes" className="text-h3">
            Escolha a vaga
          </h3>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {noAr.map((v) => (
              <li key={v.id}>
                <Link
                  href={`/painel/anuncio/${v.id}/automacoes`}
                  className="flex items-center gap-3 px-4 py-3 text-label hover:bg-surface-300"
                >
                  <Workflow aria-hidden className="size-5 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 break-words">{v.titulo}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
