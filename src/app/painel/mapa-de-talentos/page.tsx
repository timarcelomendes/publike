import { Bus, Lock, MapPinned } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { BotaoImprimir } from "@/components/mapa-de-talentos/imprimir";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { Segmentos } from "@/components/painel/segmentos";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { primeiro } from "@/lib/formato";
import { montarMapaDeTalentos, numeroProtegido } from "@/lib/servidor/mapa-de-talentos";
import { minhasVagasNoAr } from "@/lib/servidor/mutirao";
import { exigirUsuario } from "@/lib/sessao";

export const metadata: Metadata = { title: "Mapa de talentos", robots: { index: false } };

// O mapa de talentos (migração 20270419120000): quantas pessoas de Talentos moram perto de uma vaga, por tempo de
// ônibus, por função e por bairro, sem mostrar a casa de ninguém (só grupos de 5 ou mais). Com a Consulta de
// salários ou um plano; sem eles, só o total a até 30 minutos.

export default function PaginaMapaDeTalentos({ searchParams }: PageProps<"/painel/mapa-de-talentos">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/mapa-de-talentos">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/mapa-de-talentos");
  const pedida = primeiro((await searchParams).vaga);
  const vagas = await minhasVagasNoAr();
  const vaga = vagas.find((v) => v.id === pedida) ?? vagas[0] ?? null;
  const mapa = vaga ? await montarMapaDeTalentos(vaga) : null;
  const trinta = mapa?.porTempo.find((t) => t.minutos === 30);

  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina
        titulo="Mapa de talentos"
        descricao="Quantas pessoas que procuram trabalho moram perto da sua vaga, pelo tempo de ônibus. Ajuda a escolher o salário e o lugar do mutirão, e a agência a mostrar ao cliente. Ninguém tem a casa mostrada: só aparecem grupos de 5 pessoas ou mais."
      >
        {vagas.length > 1 && (
          <div className="print:hidden">
            <Segmentos
              rotulo="Vaga"
              opcoes={vagas.map((v) => ({
                nome: v.titulo,
                href: `/painel/mapa-de-talentos?vaga=${v.id}`,
                ativo: v.id === vaga?.id,
              }))}
            />
          </div>
        )}
      </CabecalhoDaPagina>

      {!vaga ? (
        <Aviso tipo="info" titulo="Publique uma vaga primeiro">
          O mapa parte do endereço da vaga.
        </Aviso>
      ) : !mapa ? (
        <Aviso tipo="info" titulo="O mapa de talentos ainda não está ligado">
          Logo você vai poder ver por aqui.
        </Aviso>
      ) : (
        <>
          <section aria-labelledby="perto" className="flex flex-col gap-3">
            <h3 id="perto" className="flex flex-wrap items-center gap-2 text-h3">
              <Bus aria-hidden className="size-5 text-ink-muted" />
              Perto de “{mapa.vaga.titulo}”
            </h3>
            {mapa.vaga.funcao && (
              <p className="text-body-sm text-ink-muted">A função da vaga: {mapa.vaga.funcao}.</p>
            )}
            <dl className="grid gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-3">
              {mapa.porTempo.map((t) => (
                <div key={t.minutos} className="flex flex-col gap-1 bg-surface-200 p-4">
                  <dt className="text-body-sm text-ink-muted">Até {t.minutos} min de ônibus</dt>
                  <dd>
                    {mapa.liberado || t.minutos === 30 ? (
                      <>
                        <span className="text-h2 tabular-nums">{numeroProtegido(t.todos)}</span>
                        <span className="block text-body-sm text-ink-muted">em Talentos</span>
                        {mapa.liberado && t.naFuncao != null && (
                          <span className="block text-body-sm">
                            <strong>{numeroProtegido(t.naFuncao)}</strong> já trabalharam na função
                          </span>
                        )}
                      </>
                    ) : (
                      <Lock aria-label="Nos planos" className="size-5 text-ink-muted" />
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="max-w-2xl text-body-sm text-ink-muted">
              O tempo é uma estimativa pela distância, como na vaga. Só conta quem deixou as empresas acharem o
              currículo e informou o CEP de casa.
            </p>
          </section>

          {!mapa.liberado ? (
            <div>
              <Aviso tipo="info" titulo="Veja por função e por bairro">
                <span className="flex flex-col items-start gap-2">
                  <span>
                    {trinta && trinta.todos >= 5
                      ? `São ${trinta.todos} pessoas a até 30 minutos. `
                      : ""}
                    Com a Consulta de salários ou um plano, você vê quantas já trabalharam em cada função, os bairros
                    onde moram e os tempos de 15 e 45 minutos.
                  </span>
                  <BotaoLink href="/painel/planos" tamanho="sm">
                    Ver os planos
                  </BotaoLink>
                </span>
              </Aviso>
            </div>
          ) : (
            <>
              {/* as funções e os bairros lado a lado, na largura do painel */}
              <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
                <section aria-labelledby="funcoes" className="flex flex-col gap-3">
                  <h3 id="funcoes" className="text-h3">
                    O que já fizeram, a até 30 minutos
                  </h3>
                  {mapa.funcoes.length === 0 ? (
                    <p className="text-body-sm text-ink-muted">Ainda não há 5 pessoas da mesma função por perto.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
                      {mapa.funcoes.map((f) => (
                        <li key={f.nome} className="flex items-center justify-between gap-3 px-4 py-2.5">
                          <span className="flex flex-wrap items-center gap-2 text-body">
                            {f.nome}
                            {f.daVaga && <Selo variante="match">A da vaga</Selo>}
                          </span>
                          <span className="text-label tabular-nums">{f.pessoas}</span>
                        </li>
                      ))}
                      {mapa.outrasFuncoes > 0 && (
                        <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-ink-muted">
                          <span className="text-body">Outras funções</span>
                          <span className="text-label tabular-nums">{numeroProtegido(mapa.outrasFuncoes)}</span>
                        </li>
                      )}
                    </ul>
                  )}
                </section>

                <section aria-labelledby="bairros" className="flex flex-col gap-3">
                  <h3 id="bairros" className="flex items-center gap-2 text-h3">
                    <MapPinned aria-hidden className="size-5 text-ink-muted" />
                    Onde moram, a até 30 minutos
                  </h3>
                  {mapa.bairros.length === 0 ? (
                    <p className="text-body-sm text-ink-muted">Ainda não há 5 pessoas no mesmo bairro.</p>
                  ) : (
                    <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
                      {mapa.bairros.map((b) => (
                        <li key={b.nome} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-2.5">
                          <span className="text-body">{b.nome}</span>
                          <span className="text-body-sm tabular-nums">
                            <strong className="text-label">{b.todos}</strong> pessoas
                            {b.naFuncao != null && <>, {numeroProtegido(b.naFuncao)} na função</>}
                          </span>
                        </li>
                      ))}
                      {mapa.outrosBairros > 0 && (
                        <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-ink-muted">
                          <span className="text-body">Outros bairros</span>
                          <span className="text-body-sm tabular-nums">{numeroProtegido(mapa.outrosBairros)}</span>
                        </li>
                      )}
                    </ul>
                  )}
                </section>
              </div>
              <BotaoImprimir />
            </>
          )}
        </>
      )}
    </div>
  );
}
