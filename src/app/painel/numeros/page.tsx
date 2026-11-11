import { BarChart3, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FunilDeContratacao, DeOndeVieram, TemposDoProcesso } from "@/components/painel/numeros-do-processo";
import { Segmentos } from "@/components/painel/segmentos";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { diasDoPeriodo, PERIODOS_NUMEROS, textoDoTempo } from "@/lib/automacoes";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { numerosDoProcesso, numerosOrigem } from "@/lib/servidor/automacoes";
import { exigirUsuario } from "@/lib/sessao";
import { numerosSaidas } from "@/lib/servidor/processo";
import { nomeDoMotivo } from "@/lib/processo";

export const metadata: Metadata = { title: "Resultados" };

// Os números do processo (claude/plano-recursos-concorrentes.md, parte 6; migração 20270109120000): o funil, os
// tempos e de onde vieram os candidatos, de todas as vagas e de cada uma.

export default function Numeros({ searchParams }: PageProps<"/painel/numeros">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      {searchParams.then((sp) => (
        <Conteudo periodo={typeof sp.periodo === "string" ? sp.periodo : undefined} />
      ))}
    </Suspense>
  );
}

async function Conteudo({ periodo: pedido }: { periodo?: string }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/numeros");
  const { periodo, dias } = diasDoPeriodo(pedido);
  const [perfil, vagas, origens, saidas] = await Promise.all([
    obterMeuPerfil(),
    numerosDoProcesso(dias),
    numerosOrigem(dias),
    // por que as pessoas saíram (o motivo, quando a conta pede; migração 20270315120000)
    numerosSaidas(dias),
  ]);
  if (!perfil || perfil.tipo === "pessoa") {
    return <Aviso tipo="info" titulo="Os números são para quem contrata" />;
  }
  if (!vagas || !origens) {
    return (
      <div className="flex flex-col gap-6">
        <CabecalhoDaPagina titulo="Resultados" />
        <Aviso tipo="alerta" titulo="Ainda não disponível">
          Tente de novo em instantes.
        </Aviso>
      </div>
    );
  }
  const total = vagas.find((v) => !v.anuncio_id);
  const porVaga = vagas.filter((v) => v.anuncio_id);

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        titulo="Resultados"
        selo={<Selo variante="novo">Novo</Selo>}
        descricao="Quanto tempo leva para contratar e onde as pessoas ficam pelo caminho."
        acoes={
          <BotaoLink href={`/painel/numeros/planilha?periodo=${periodo}`} tamanho="sm" prefetch={false}>
            <Download aria-hidden />
            Baixar planilha
          </BotaoLink>
        }
      >
        <Segmentos
          rotulo="Período"
          opcoes={(Object.keys(PERIODOS_NUMEROS) as (keyof typeof PERIODOS_NUMEROS)[]).map((p) => ({
            nome: PERIODOS_NUMEROS[p],
            href: `/painel/numeros?periodo=${p}`,
            ativo: p === periodo,
          }))}
        />
      </CabecalhoDaPagina>

      {!total || total.candidatos === 0 ? (
        <Vazio
          icone={BarChart3}
          titulo="Ninguém se candidatou neste período"
          acao={
            <BotaoLink href="/painel/links" tamanho="sm">
              Divulgar as vagas
            </BotaoLink>
          }
        >
          Os números aparecem quando as candidaturas chegam.
        </Vazio>
      ) : (
        <>
          <TemposDoProcesso linha={total} />
          <FunilDeContratacao linha={total} />
          {origens.length > 0 && <DeOndeVieram origens={origens} />}
          {saidas && saidas.length > 0 && <PorQueSairam saidas={saidas} />}

          <section aria-labelledby="por-vaga" className="flex flex-col gap-3">
            <h3 id="por-vaga" className="text-h3">
              Resultado por vaga
            </h3>
            <div className="overflow-x-auto rounded-lg border border-line bg-surface-200">
              <table className="w-full min-w-[44rem] text-left text-body-sm">
                <thead className="text-caption text-ink-muted">
                  <tr className="border-b border-line">
                    <th className="px-4 py-2.5 font-normal">Vaga</th>
                    <th className="px-4 py-2.5 text-right font-normal">Candidatos</th>
                    <th className="px-4 py-2.5 text-right font-normal">Responderam</th>
                    <th className="px-4 py-2.5 text-right font-normal">Entrevista</th>
                    <th className="px-4 py-2.5 text-right font-normal">Contratados</th>
                    <th className="px-4 py-2.5 text-right font-normal">1ª resposta</th>
                    <th className="px-4 py-2.5 text-right font-normal">Até contratar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line tabular-nums">
                  {porVaga.map((v) => (
                    <tr key={v.anuncio_id}>
                      <th scope="row" className="px-4 py-2.5 font-normal">
                        <Link
                          href={`/painel/anuncio/${v.anuncio_id}/numeros`}
                          className="text-label underline-offset-2 hover:underline"
                        >
                          {v.titulo}
                        </Link>
                        {v.status !== "ativo" && <span className="text-caption text-ink-muted"> · fora do ar</span>}
                      </th>
                      <td className="px-4 py-2.5 text-right">{v.candidatos}</td>
                      <td className="px-4 py-2.5 text-right">{v.respondidos}</td>
                      <td className="px-4 py-2.5 text-right">{v.entrevista}</td>
                      <td className="px-4 py-2.5 text-right">{v.contratados}</td>
                      <td className="px-4 py-2.5 text-right">{textoDoTempo(v.horas_resposta, "h")}</td>
                      <td className="px-4 py-2.5 text-right">{textoDoTempo(v.dias_contratar, "d")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/** Por que as pessoas saíram do processo (o motivo de Dispensar e Não seguiu, quando a conta pede). */
function PorQueSairam({ saidas }: { saidas: { motivo: string; pessoas: number }[] }) {
  const todas = saidas.reduce((t, x) => t + x.pessoas, 0);
  return (
    <section aria-labelledby="saidas" className="flex flex-col gap-3">
      <h3 id="saidas" className="text-h3">
        Por que saíram
      </h3>
      <ul className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4">
        {saidas.map((x) => (
          <li key={x.motivo} className="flex flex-col gap-1">
            <span className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className="text-label">{nomeDoMotivo(x.motivo)}</span>
              <span className="tabular-nums">{x.pessoas}</span>
            </span>
            <span aria-hidden className="block h-1.5 overflow-hidden rounded-pill bg-surface-300">
              <span className="block h-full rounded-pill bg-ink-muted" style={{ width: `${(100 * x.pessoas) / todas}%` }} />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-body-sm text-ink-muted">
        O motivo de quem foi dispensado ou não seguiu. Para pedir sempre, ligue em{" "}
        <Link href="/painel/configuracoes?aba=processo" className="underline underline-offset-2">
          Configurações
        </Link>
        .
      </p>
    </section>
  );
}
