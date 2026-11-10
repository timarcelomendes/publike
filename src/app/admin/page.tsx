import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { EsqueletoAdmin } from "@/components/admin/esqueleto";
import { ContasNoApp } from "@/components/admin/numeros-teste-app";
import { AbasDoPainel, abaDoPainel, type AbaDoPainel } from "@/components/admin/painel/abas";
import { Periodo, paramsDoFiltro } from "@/components/admin/painel/periodo";
import { ConteudoDaAba } from "@/components/admin/painel/conteudo";
import { PrecisaDeVoce } from "@/components/admin/painel/precisa-de-voce";
import { BotaoResumoIA } from "@/components/admin/resumo-ia";
import { Secao } from "@/components/admin/ui";
import { configDoSite, registroDaEquipe, ultimoResumo } from "@/lib/admin/dados";
import { dadosDaAba, filtroDoPainel, type FiltroDoPainel } from "@/lib/admin/painel";
import { descreverAcao } from "@/lib/admin/textos";
import { TESTE_FECHADO } from "@/lib/android";
import { primeiro, tempoRelativo } from "@/lib/formato";
import { telasNoSite } from "@/lib/servidor/telas-do-admin";
import { criarClienteAdmin, ehAdminLocal } from "@/lib/supabase/admin";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Painel" };

// O Painel do admin (claude/plano-indicadores-do-admin.md): as abas no alto, "Precisa de você" na Visão geral e
// uma aba por vez, cada uma com as consultas dela.
export default function PainelAdmin({ searchParams }: PageProps<"/admin">) {
  return (
    <Suspense fallback={<EsqueletoAdmin />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/admin">["searchParams"] }) {
  if (!(await ehAdminLocal())) {
    // no site publicado, a equipe começa pelos números (se liberados) e depois a moderação: tudo em Equipe do Publike
    const [primeira] = await telasNoSite();
    if (primeira) redirect(primeira);
    notFound();
  }
  const sp = await searchParams;
  const aba = abaDoPainel(primeiro(sp.aba), true);
  const filtro = filtroDoPainel(primeiro(sp.dias), primeiro(sp.equipe));
  const agora = await agoraDaRequisicao();
  return (
    <div className="flex flex-col gap-6">
      <AbasDoPainel ativa={aba} base="/admin" admin manter={paramsDoFiltro(filtro)} />
      <Suspense key={`${aba}-${filtro.dias}-${filtro.comEquipe}`} fallback={<EsqueletoAdmin />}>
        <Aba aba={aba} agora={agora} filtro={filtro} />
      </Suspense>
    </div>
  );
}

/** As abas em que o período muda os números. */
const COM_PERIODO: AbaDoPainel[] = ["visao", "chegada", "cadastro", "vagas", "dinheiro"];

const horaDe = (agora: number) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(
    new Date(agora),
  );

async function Aba({ aba, agora, filtro }: { aba: AbaDoPainel; agora: number; filtro: FiltroDoPainel }) {
  const d = await dadosDaAba(aba, agora, filtro);
  const c = criarClienteAdmin();
  return (
    <div className="flex flex-col gap-6">
      {COM_PERIODO.includes(aba) && (
        <Periodo
          base="/admin"
          aba={aba}
          filtro={filtro}
          indicadores={d.indicadores}
          atualizado={horaDe(agora)}
          mostrarEquipe={aba !== "dinheiro"}
        />
      )}
      {aba === "visao" && (
        <Suspense fallback={<div className="h-28 animate-pulse rounded-lg bg-surface-300" />}>
          <PrecisaDeVoce agora={agora} />
        </Suspense>
      )}
      <ConteudoDaAba aba={aba} d={d} admin extra={aba === "volta" && TESTE_FECHADO ? <ContasNoApp c={c} /> : null} />
      {aba === "visao" && <ResumoERegistro agora={agora} />}
    </div>
  );
}

/** O Resumo da IA e o que a equipe fez por último, no fim da Visão geral. */
async function ResumoERegistro({ agora }: { agora: number }) {
  const c = criarClienteAdmin();
  const [config, resumo, registro] = await Promise.all([configDoSite(c), ultimoResumo(c), registroDaEquipe(c, 10)]);
  return (
    <>
      {config.ia_resumo && (
        <Secao
          titulo="Resumo da IA"
          descricao={
            resumo
              ? `Últimos ${resumo.dias} dias. Gerado ${tempoRelativo(resumo.criado_em, agora)}.`
              : "A IA lê os números da semana e escreve o que aconteceu, os sinais de alerta e o que fazer."
          }
          acoes={<BotaoResumoIA temResumo={Boolean(resumo)} />}
        >
          {resumo ? (
            <div className="flex flex-col gap-1.5 text-body whitespace-pre-line">{resumo.texto}</div>
          ) : (
            <p className="text-body-sm text-ink-muted">Ainda não há resumo. Custa menos de um centavo por resumo.</p>
          )}
        </Secao>
      )}
      <details className="rounded-lg border border-line bg-surface-200 p-4">
        <summary className="cursor-pointer text-label">O que a equipe fez por último</summary>
        {registro.length === 0 ? (
          <p className="mt-2 text-body-sm text-ink-muted">Nada por enquanto.</p>
        ) : (
          <ul className="mt-2 flex flex-col divide-y divide-line">
            {registro.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 text-body-sm"
              >
                <span>
                  <strong className="font-semibold">{r.quem}</strong> {descreverAcao(r.acao)}{" "}
                  {r.rotulo && <span className="text-ink">“{r.rotulo}”</span>}
                </span>
                <span className="text-ink-muted">{tempoRelativo(r.criado_em, agora)}</span>
              </li>
            ))}
          </ul>
        )}
      </details>
    </>
  );
}
