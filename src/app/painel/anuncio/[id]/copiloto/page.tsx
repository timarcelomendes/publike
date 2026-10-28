import { Bot, History, ListChecks, Sparkles, UserSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CartaoDoCopiloto } from "@/components/copiloto/cartao";
import { EditorDeCriterios } from "@/components/copiloto/criterios";
import { PartesDoCopiloto } from "@/components/copiloto/partes";
import { RodarCopiloto } from "@/components/copiloto/rodar";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { SeloCortesia } from "@/components/selo-cortesia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { compararLeituras, contarLeitura, textoDoRegistro, type OrigemCopiloto } from "@/lib/copiloto";
import { obterAnuncio } from "@/lib/dados";
import { tempoRelativo } from "@/lib/formato";
import {
  avaliacoesDoCopiloto,
  configDoCopiloto,
  leituraAtual,
  pessoasDoCopiloto,
  registroDoCopiloto,
} from "@/lib/servidor/copiloto";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Copiloto da vaga" };
// cada clique lê um lote de currículos com a IA
export const maxDuration = 60;

type Filtro = "todos" | "obrigatorios" | "conferir";
const FILTROS: { valor: Filtro; nome: string }[] = [
  { valor: "todos", nome: "Todos" },
  { valor: "obrigatorios", nome: "Atendem os obrigatórios" },
  { valor: "conferir", nome: "Têm o que conferir" },
];

export default function Copiloto({ params, searchParams }: PageProps<"/painel/anuncio/[id]/copiloto">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({
  params,
  searchParams,
}: {
  params: PageProps<"/painel/anuncio/[id]/copiloto">["params"];
  searchParams: PageProps<"/painel/anuncio/[id]/copiloto">["searchParams"];
}) {
  if (MODO_DEMO) return <SoComSupabase />;
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const usuario = await exigirUsuario(`/painel/anuncio/${id}/copiloto`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id || anuncio.tipo !== "vaga") notFound();
  const config = await configDoCopiloto(id);
  const cabecalho = <CabecalhoDaVaga anuncio={anuncio} aba="copiloto" />;
  if (!config?.liberado) {
    return (
      <div className="flex flex-col gap-4">
        {cabecalho}
        <Vazio icone={Bot} titulo="O copiloto está em teste">
          Ele ainda não foi liberado para a sua conta. Quando for, aparece aqui e no quadro da vaga.
        </Vazio>
      </div>
    );
  }

  const agora = await agoraDaRequisicao();
  const abas: { valor: OrigemCopiloto; nome: string }[] = [
    ...(config.busca ? [{ valor: "talento" as const, nome: "Talentos para convidar" }] : []),
    ...(config.triagem ? [{ valor: "candidato" as const, nome: "Candidatos da vaga" }] : []),
  ];
  const pedida = sp.ver === "candidatos" ? "candidato" : sp.ver === "talentos" ? "talento" : null;
  const origem = abas.find((a) => a.valor === pedida)?.valor ?? abas[0]?.valor ?? null;
  const filtro: Filtro = FILTROS.some((f) => f.valor === sp.filtro) ? (sp.filtro as Filtro) : "todos";
  const temCriterios = config.criterios.length > 0;

  const [pessoas, avaliacoes, registro] = await Promise.all([
    origem && temCriterios ? pessoasDoCopiloto(anuncio, origem, config.criterios, agora) : Promise.resolve([]),
    avaliacoesDoCopiloto(id),
    registroDoCopiloto(id),
  ]);
  const comCurriculo = pessoas.filter((p) => p.curriculo);
  const lidas = comCurriculo
    .flatMap((p) => {
      const a = avaliacoes.get(p.perfil_id);
      if (!a) return [];
      const n = contarLeitura(config.criterios, a.leitura);
      return [{ p, a, n, antiga: !leituraAtual(a, config.versao, p), preNota: p.preNota }];
    })
    .sort((x, y) => compararLeituras({ ...x.n, preNota: x.preNota }, { ...y.n, preNota: y.preNota }));
  const faltam = comCurriculo.filter((p) => !leituraAtual(avaliacoes.get(p.perfil_id), config.versao, p)).length;
  const atendem = lidas.filter((l) => l.n.obrigatoriosOk).length;
  const mostradas = lidas.filter((l) =>
    filtro === "obrigatorios" ? l.n.obrigatoriosOk : filtro === "conferir" ? l.n.conferir > 0 : true,
  );
  const semCurriculo = origem === "candidato" ? pessoas.length - comCurriculo.length : 0;
  const href = (o: OrigemCopiloto, f: Filtro = "todos") =>
    `/painel/anuncio/${id}/copiloto?ver=${o === "talento" ? "talentos" : "candidatos"}${f === "todos" ? "" : `&filtro=${f}`}`;

  return (
    <div className="flex flex-col gap-6">
      {cabecalho}
      <div className="flex flex-wrap items-center gap-2">
        <SeloCortesia />
        <Selo variante="contorno">Teste</Selo>
        <p className="text-body-sm text-ink-muted">
          A IA lê cada currículo contra os critérios e mostra o trecho que comprova. Quem decide é você.
        </p>
      </div>

      <section aria-labelledby="titulo-criterios" className="rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
        <h3 id="titulo-criterios" className="mb-1 flex items-center gap-2 text-h3">
          <ListChecks aria-hidden className="size-5 text-ink-muted" />
          Critérios da vaga
        </h3>
        <p className="mb-3 text-body-sm text-ink-muted">
          O que a pessoa precisa ter para esta vaga. Obrigatório é o que não dá para abrir mão.
        </p>
        <EditorDeCriterios anuncioId={id} iniciais={config.criterios} />
      </section>

      <section aria-labelledby="titulo-partes" className="rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
        <h3 id="titulo-partes" className="mb-3 text-h3">
          O que o copiloto faz nesta vaga
        </h3>
        <PartesDoCopiloto anuncioId={id} triagem={config.triagem} busca={config.busca} />
      </section>

      {!origem ? (
        <Aviso tipo="info" titulo="As duas partes estão desligadas">
          Ligue a busca em Talentos ou a leitura dos candidatos para o copiloto trabalhar.
        </Aviso>
      ) : (
        <section aria-labelledby="titulo-lista" className="flex flex-col gap-4">
          <h3 id="titulo-lista" className="sr-only">
            Quem o copiloto leu
          </h3>
          {abas.length > 1 && (
            <nav aria-label="O que ver" className="flex gap-1 border-b border-line">
              {abas.map((a) => (
                <Link
                  key={a.valor}
                  href={href(a.valor)}
                  aria-current={a.valor === origem ? "page" : undefined}
                  className={`-mb-px inline-flex min-h-11 items-center border-b-2 px-3 text-label ${
                    a.valor === origem ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {a.nome}
                </Link>
              ))}
            </nav>
          )}
          {!temCriterios ? (
            <Aviso tipo="info" titulo="Salve os critérios para começar">
              Toque em “Sugerir com a IA” ou escreva os seus. Depois, o copiloto lê os currículos.
            </Aviso>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-lg bg-surface-300 p-4">
                <p className="flex items-center gap-2 text-label">
                  {origem === "talento" ? (
                    <UserSearch aria-hidden className="size-5 text-ink-muted" />
                  ) : (
                    <Sparkles aria-hidden className="size-5 text-ink-muted" />
                  )}
                  {origem === "talento"
                    ? `${comCurriculo.length} ${comCurriculo.length === 1 ? "pessoa" : "pessoas"} em Talentos para esta vaga`
                    : `${pessoas.length} ${pessoas.length === 1 ? "candidato" : "candidatos"}`}
                  {lidas.length > 0 && ` · ${lidas.length} lidos · ${atendem} atendem os obrigatórios`}
                </p>
                {origem === "talento" && (
                  <p className="text-body-sm text-ink-muted">
                    O copiloto lê primeiro quem mais parece combinar. Só aparece quem deixou o currículo visível para as
                    empresas.
                  </p>
                )}
                {semCurriculo > 0 && (
                  <p className="text-body-sm text-ink-muted">
                    {semCurriculo} sem currículo: veja as respostas deles no quadro.
                  </p>
                )}
                <RodarCopiloto anuncioId={id} origem={origem} faltam={faltam} lidos={lidas.length} />
              </div>

              {lidas.length > 0 && (
                <nav aria-label="Filtrar" className="flex flex-wrap gap-2">
                  {FILTROS.map((f) => (
                    <Link
                      key={f.valor}
                      href={href(origem, f.valor)}
                      aria-current={f.valor === filtro ? "page" : undefined}
                      className={`inline-flex min-h-10 items-center rounded-pill border px-3.5 text-label ${
                        f.valor === filtro
                          ? "border-ink bg-ink text-surface-100"
                          : "border-line-strong bg-surface-200 hover:bg-surface-300"
                      }`}
                    >
                      {f.nome}
                    </Link>
                  ))}
                </nav>
              )}

              {mostradas.length > 0 ? (
                <ul aria-label="Quem o copiloto leu" className="flex flex-col gap-3">
                  {mostradas.map(({ p, a, n, antiga }) => (
                    <CartaoDoCopiloto
                      key={p.perfil_id}
                      anuncioId={id}
                      pessoa={p}
                      criterios={config.criterios}
                      leitura={a.leitura}
                      antiga={antiga}
                      numeros={n}
                      agora={agora}
                      vagaNoAr={anuncio.status === "ativo" && !anuncio.preenchida_em}
                    />
                  ))}
                </ul>
              ) : (
                lidas.length > 0 && <p className="text-body-sm text-ink-muted">Ninguém neste filtro.</p>
              )}
            </>
          )}
        </section>
      )}

      <section aria-labelledby="titulo-registro" className="rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
        <h3 id="titulo-registro" className="mb-2 flex items-center gap-2 text-h3">
          <History aria-hidden className="size-5 text-ink-muted" />O que o copiloto fez
        </h3>
        {registro.length ? (
          <ul className="flex flex-col gap-1.5 text-body-sm">
            {registro.map((r, i) => (
              <li key={i} className="flex flex-wrap justify-between gap-x-3">
                <span>{textoDoRegistro(r)}</span>
                <span className="text-ink-muted">{tempoRelativo(r.criado_em, agora)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-ink-muted">Nada ainda.</p>
        )}
        <p className="mt-3 text-body-sm text-ink-muted">
          O copiloto não recusa ninguém e cada pessoa recebe no máximo 3 convites por semana, somando todas as empresas.
        </p>
      </section>
    </div>
  );
}
