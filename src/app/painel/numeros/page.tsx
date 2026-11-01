import { BarChart3, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { FunilDeContratacao, DeOndeVieram, TemposDoProcesso } from "@/components/painel/numeros-do-processo";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { diasDoPeriodo, PERIODOS_NUMEROS, textoDoTempo } from "@/lib/automacoes";
import { MODO_DEMO } from "@/lib/config";
import { obterMeuPerfil } from "@/lib/dados";
import { numerosDoProcesso, numerosOrigem } from "@/lib/servidor/automacoes";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Números do processo" };

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
  const [perfil, vagas, origens] = await Promise.all([obterMeuPerfil(), numerosDoProcesso(dias), numerosOrigem(dias)]);
  if (!perfil || perfil.tipo === "pessoa") {
    return <Aviso tipo="info" titulo="Os números são para quem contrata" />;
  }
  if (!vagas || !origens) {
    return (
      <Aviso tipo="alerta" titulo="Ainda não disponível">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  const total = vagas.find((v) => !v.anuncio_id);
  const porVaga = vagas.filter((v) => v.anuncio_id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-h2">
            Números do processo
            <Selo variante="novo">Novo</Selo>
          </h2>
          <p className="mt-1 text-body text-ink-muted">Quanto tempo leva e onde as pessoas ficam pelo caminho.</p>
        </div>
        <BotaoLink href={`/painel/numeros/planilha?periodo=${periodo}`} tamanho="sm" prefetch={false}>
          <Download aria-hidden />
          Baixar planilha
        </BotaoLink>
      </div>
      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {(Object.keys(PERIODOS_NUMEROS) as (keyof typeof PERIODOS_NUMEROS)[]).map((p) => (
          <Link
            key={p}
            href={`/painel/numeros?periodo=${p}`}
            aria-current={p === periodo ? "page" : undefined}
            className={`inline-flex min-h-10 items-center rounded-pill border px-3.5 text-label ${
              p === periodo ? "border-ink bg-ink text-surface-100" : "border-line-strong hover:bg-surface-300"
            }`}
          >
            {PERIODOS_NUMEROS[p]}
          </Link>
        ))}
      </nav>

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
