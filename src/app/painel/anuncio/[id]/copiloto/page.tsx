import { History, ListChecks, Sparkles, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CartaoDoCopiloto, LinhaDoRanking } from "@/components/copiloto/cartao";
import { EditorDeCriterios } from "@/components/copiloto/criterios";
import { PartesDoCopiloto } from "@/components/copiloto/partes";
import { RodarCopiloto } from "@/components/copiloto/rodar";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { FaixaExperimento, OfertaRecurso } from "@/components/recurso-pago";
import { SeloCortesia } from "@/components/selo-cortesia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { MODO_DEMO } from "@/lib/config";
import { compararLeituras, contarLeitura, textoDoRegistro, type OrigemCopiloto } from "@/lib/copiloto";
import { obterAnuncio, recursosPagos } from "@/lib/dados";
import { tempoRelativo } from "@/lib/formato";
import {
  avaliacoesDoCopiloto,
  configDoCopiloto,
  leituraAtual,
  pessoasDoCopiloto,
  registroDoCopiloto,
  type PessoaDoCopiloto,
} from "@/lib/servidor/copiloto";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { marcaDoRecurso } from "@/lib/recursos-pagos";

export const metadata: Metadata = { title: "Copiloto da vaga" };
// cada clique lê um lote de currículos com a IA
export const maxDuration = 60;

type Filtro = "todos" | "obrigatorios" | "conferir";
/** os primeiros do ranking aparecem inteiros; do 4º em diante, uma linha cada (toque abre) */
const DESTAQUES = 3;
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
        <OfertaRecurso recurso="copiloto" estado={(await recursosPagos())?.copiloto ?? null} />
      </div>
    );
  }

  const [agora, recursos] = await Promise.all([agoraDaRequisicao(), recursosPagos()]);
  // quem se candidatou e os Talentos num ranking só; "ver" filtra uma das origens
  const origens: OrigemCopiloto[] = [
    ...(config.triagem ? (["candidato"] as const) : []),
    ...(config.busca ? (["talento"] as const) : []),
  ];
  const pedida = sp.ver === "candidatos" ? "candidato" : sp.ver === "talentos" ? "talento" : null;
  const vista: OrigemCopiloto | null = pedida && origens.includes(pedida) ? pedida : null;
  const filtro: Filtro = FILTROS.some((f) => f.valor === sp.filtro) ? (sp.filtro as Filtro) : "todos";
  const temCriterios = config.criterios.length > 0;

  const [listas, avaliacoes, registro] = await Promise.all([
    temCriterios
      ? Promise.all(origens.map((o) => pessoasDoCopiloto(anuncio, o, config.criterios, agora)))
      : Promise.resolve([] as PessoaDoCopiloto[][]),
    avaliacoesDoCopiloto(id),
    registroDoCopiloto(id),
  ]);
  const pessoas = listas.flat();
  const comCurriculo = pessoas.filter((p) => p.curriculo);
  const candidatos = pessoas.filter((p) => p.origem === "candidato");
  const talentos = comCurriculo.filter((p) => p.origem === "talento");
  const faltam = comCurriculo.filter((p) => !leituraAtual(avaliacoes.get(p.perfil_id), config.versao, p)).length;
  const lidas = comCurriculo
    .flatMap((p) => {
      const a = avaliacoes.get(p.perfil_id);
      if (!a) return [];
      const n = contarLeitura(config.criterios, a.leitura);
      return [{ p, a, n, antiga: !leituraAtual(a, config.versao, p) }];
    })
    .sort((x, y) => compararLeituras({ ...x.n, preNota: x.p.preNota }, { ...y.n, preNota: y.p.preNota }));
  // a posição vale dentro da origem escolhida; o filtro de situação só esconde (a posição fica)
  const ranking = lidas.filter((l) => !vista || l.p.origem === vista).map((l, i) => ({ ...l, posicao: i + 1 }));
  const atendem = ranking.filter((l) => l.n.obrigatoriosOk).length;
  const mostradas = ranking.filter((l) =>
    filtro === "obrigatorios" ? l.n.obrigatoriosOk : filtro === "conferir" ? l.n.conferir > 0 : true,
  );
  const destaques = mostradas.slice(0, DESTAQUES);
  const resto = mostradas.slice(DESTAQUES);
  const semCurriculo = candidatos.length - candidatos.filter((p) => p.curriculo).length;
  const href = (v: OrigemCopiloto | null, f: Filtro) => {
    const q = new URLSearchParams();
    if (v) q.set("ver", v === "talento" ? "talentos" : "candidatos");
    if (f !== "todos") q.set("filtro", f);
    const t = q.toString();
    return `/painel/anuncio/${id}/copiloto${t ? `?${t}` : ""}`;
  };
  const chip = (ativo: boolean) =>
    `inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label ${
      ativo ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-200 hover:bg-surface-300"
    }`;
  const quantos = [
    config.triagem && `${candidatos.length} ${candidatos.length === 1 ? "candidato" : "candidatos"}`,
    config.busca && `${talentos.length} ${talentos.length === 1 ? "pessoa" : "pessoas"} em Talentos`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      {cabecalho}
      <FaixaExperimento recurso="copiloto" estado={recursos?.copiloto} agora={agora} />
      <div className="flex flex-wrap items-center gap-2">
        <SeloCortesia texto={marcaDoRecurso(recursos?.copiloto, agora).longo} />
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

      {!origens.length ? (
        <Aviso tipo="info" titulo="As duas partes estão desligadas">
          Ligue a busca em Talentos ou a leitura dos candidatos para o copiloto trabalhar.
        </Aviso>
      ) : (
        <section aria-labelledby="titulo-ranking" className="flex flex-col gap-4">
          <h3 id="titulo-ranking" className="flex items-center gap-2 text-h3">
            <Trophy aria-hidden className="size-5 text-ink-muted" />
            Ranking da vaga
          </h3>
          {!temCriterios ? (
            <Aviso tipo="info" titulo="Salve os critérios para começar">
              Toque em “Sugerir com a IA” ou escreva os seus. Depois, o copiloto lê os currículos.
            </Aviso>
          ) : (
            <>
              <div className="flex flex-col gap-3 rounded-lg bg-surface-300 p-4">
                <p className="flex flex-wrap items-center gap-x-2 text-label">
                  <Sparkles aria-hidden className="size-5 text-ink-muted" />
                  {quantos.join(" e ")}
                  {lidas.length > 0 && <span className="font-normal text-ink-muted">· {lidas.length} lidos</span>}
                </p>
                <p className="text-body-sm text-ink-muted">
                  {config.triagem && config.busca
                    ? "O copiloto lê primeiro quem se candidatou e depois os Talentos que mais parecem combinar."
                    : config.busca
                      ? "O copiloto lê primeiro os Talentos que mais parecem combinar."
                      : "O copiloto lê o currículo de quem se candidatou."}
                  {config.busca && " Em Talentos só aparece quem deixou o currículo visível para as empresas."}
                </p>
                {semCurriculo > 0 && (
                  <p className="text-body-sm text-ink-muted">
                    {semCurriculo} {semCurriculo === 1 ? "candidato sem currículo" : "candidatos sem currículo"}: veja
                    as respostas no quadro.
                  </p>
                )}
                <RodarCopiloto anuncioId={id} origem="todos" faltam={faltam} lidos={lidas.length} />
              </div>

              {lidas.length > 0 && (
                <div className="flex flex-col gap-2">
                  {origens.length > 1 && (
                    <nav aria-label="Quem ver" className="flex flex-wrap gap-2">
                      {[
                        { v: null, nome: "Candidatos e Talentos" },
                        { v: "candidato" as const, nome: "Candidatos" },
                        { v: "talento" as const, nome: "Talentos" },
                      ].map((o) => (
                        <Link
                          key={o.nome}
                          href={href(o.v, filtro)}
                          scroll={false}
                          aria-current={o.v === vista ? "page" : undefined}
                          className={chip(o.v === vista)}
                        >
                          {o.nome}
                        </Link>
                      ))}
                    </nav>
                  )}
                  <nav aria-label="Filtrar" className="flex flex-wrap gap-2">
                    {FILTROS.map((f) => (
                      <Link
                        key={f.valor}
                        href={href(vista, f.valor)}
                        scroll={false}
                        aria-current={f.valor === filtro ? "page" : undefined}
                        className={chip(f.valor === filtro)}
                      >
                        {f.nome}
                      </Link>
                    ))}
                  </nav>
                </div>
              )}

              {ranking.length > 0 && (
                <p className="text-body-sm text-ink-muted">
                  {atendem > 0
                    ? `${atendem} de ${ranking.length} ${atendem === 1 ? "atende" : "atendem"} todos os obrigatórios. `
                    : "Ninguém atende todos os obrigatórios ainda. "}
                  Primeiro quem atende os obrigatórios, depois pela nota: o obrigatório vale o dobro e o que falta
                  conferir vale a metade.
                </p>
              )}
              {lidas.some((l) => l.p.origem === "candidato") && (
                // para decidir (aceitar, mover de etapa), a ordem do Copiloto vai para os Candidatos da vaga
                <p className="text-body-sm">
                  Para aceitar e mover os candidatos nessa ordem, use{" "}
                  <Link
                    href={`/painel/anuncio/${id}/quadro?ordem=copiloto`}
                    className="text-label underline underline-offset-2"
                  >
                    Ordenar pelo Copiloto
                  </Link>{" "}
                  em Candidatos.
                </p>
              )}

              {destaques.length > 0 && (
                <ol aria-label="Os primeiros do ranking" className="flex flex-col gap-3">
                  {destaques.map(({ p, a, n, antiga, posicao }) => (
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
                      posicao={posicao}
                    />
                  ))}
                </ol>
              )}
              {resto.length > 0 && (
                <div className="rounded-lg border border-line bg-surface-200 px-4 sm:px-5">
                  <ol aria-label="O resto do ranking">
                    {resto.map(({ p, a, n, antiga, posicao }) => (
                      <LinhaDoRanking
                        key={p.perfil_id}
                        anuncioId={id}
                        pessoa={p}
                        criterios={config.criterios}
                        leitura={a.leitura}
                        antiga={antiga}
                        numeros={n}
                        agora={agora}
                        vagaNoAr={anuncio.status === "ativo" && !anuncio.preenchida_em}
                        posicao={posicao}
                      />
                    ))}
                  </ol>
                </div>
              )}
              {lidas.length > 0 && !mostradas.length && (
                <p className="text-body-sm text-ink-muted">Ninguém neste filtro.</p>
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
