import { ChevronDown, Filter, History, ListChecks, Sparkles, Trophy } from "lucide-react";
import { IA } from "@/components/apelido-da-ia";
import { falasDaIANoServidor } from "@/lib/servidor/apelido-ia";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CandidatoDoRanking, LegendaDaTira } from "@/components/copiloto/cartao";
import { EditorDeCriterios } from "@/components/copiloto/criterios";
import { PartesDoCopiloto } from "@/components/copiloto/partes";
import { LerMaisNaTriagem } from "@/components/copiloto/ler-mais";
import { RodarCopiloto } from "@/components/copiloto/rodar";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { CabecalhoDaVaga } from "@/components/painel/cabecalho-da-vaga";
import { FaixaExperimento, OfertaRecurso } from "@/components/recurso-pago";
import { SeloCortesia } from "@/components/selo-cortesia";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo } from "@/components/ui/basicos";
import { NavegacaoDaPagina } from "@/components/ui/navegacao-da-pagina";
import { MODO_DEMO } from "@/lib/config";
import {
  compararLeituras,
  contarLeitura,
  funilDaTriagem,
  gruposDoRanking,
  textoCurto,
  textoDoRegistro,
  type GrupoDoRanking,
  type OrigemCopiloto,
} from "@/lib/copiloto";
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

export const metadata: Metadata = { title: "Triagem com IA da vaga" };
// cada clique lê um lote de currículos com a IA
export const maxDuration = 60;

/** os não lidos pela IA que a aba mostra (o resto está em Candidatos) */
const MOSTRAR_NAO_LIDOS = 100;
// o ranking por prioridade (gruposDoRanking): o nome e o que cada grupo quer dizer
const GRUPOS: Record<GrupoDoRanking, { nome: string; texto: string; cor: string }> = {
  0: { nome: "Atendem os essenciais", texto: "Comece por aqui.", cor: "bg-cerrado" },
  1: {
    nome: "Falta conferir um essencial",
    texto: "O currículo não diz se a pessoa tem. Pergunte na entrevista.",
    cor: "bg-terra",
  },
  2: { nome: "Não atendem um essencial", texto: "", cor: "bg-line-strong" },
};

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
  const ia = await falasDaIANoServidor();
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
  // o funil: dos candidatos com currículo, a IA lê só os primeiros pela pré-nota (até o teto), nunca o eliminado
  const funil = funilDaTriagem(
    comCurriculo.filter((p) => p.origem === "candidato"),
    config.teto,
  );
  const naVez = new Set(funil.naVez.map((p) => p.perfil_id));
  const naoLidos = funil.abaixo
    .map((p, i) => ({ p, posicao: funil.naVez.length + i + 1 }))
    .filter(({ p }) => !leituraAtual(avaliacoes.get(p.perfil_id), config.versao, p));
  const faltam = comCurriculo.filter(
    (p) =>
      (p.origem === "talento" || naVez.has(p.perfil_id)) &&
      !leituraAtual(avaliacoes.get(p.perfil_id), config.versao, p),
  ).length;
  const lidas = comCurriculo
    .flatMap((p) => {
      const a = avaliacoes.get(p.perfil_id);
      if (!a) return [];
      const n = contarLeitura(config.criterios, a.leitura);
      return [{ p, a, n, antiga: !leituraAtual(a, config.versao, p) }];
    })
    .sort((x, y) => compararLeituras({ ...x.n, preNota: x.p.preNota }, { ...y.n, preNota: y.p.preNota }));
  // a posição vale dentro da origem escolhida; na tela, por prioridade, e só os que valem olhar começam abertos
  const ranking = lidas.filter((l) => !vista || l.p.origem === vista).map((l, i) => ({ ...l, posicao: i + 1 }));
  const temObrigatorios = config.criterios.some((c) => c.obrigatorio);
  const grupos = gruposDoRanking(ranking, temObrigatorios);
  const vagaNoAr = anuncio.status === "ativo" && !anuncio.preenchida_em;
  const semCurriculo = candidatos.length - candidatos.filter((p) => p.curriculo).length;
  const href = (v: OrigemCopiloto | null) =>
    `/painel/anuncio/${id}/copiloto${v ? `?ver=${v === "talento" ? "talentos" : "candidatos"}` : ""}`;
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
          <IA forma="Nome" /> lê sozinha cada candidato que chega, contra os critérios, e mostra o trecho que comprova.
          Quem decide é você.
        </p>
      </div>

      <NavegacaoDaPagina
        rotulo="Assuntos da triagem"
        assuntos={[
          { id: "criterios", nome: "Critérios", numero: config.criterios.length },
          { id: "o-que-faz", nome: "O que faz" },
          ...(origens.length ? [{ id: "ranking", nome: "Ranking", numero: lidas.length }] : []),
          ...(origens.length && temCriterios && vista !== "talento" && naoLidos.length
            ? [{ id: "nao-lidos", nome: "Não lidos", numero: naoLidos.length }]
            : []),
          { id: "historico", nome: "Histórico" },
        ]}
      />

      <section
        id="criterios"
        aria-labelledby="titulo-criterios"
        className="scroll-mt-32 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
      >
        <h3 id="titulo-criterios" className="mb-1 flex items-center gap-2 text-h3">
          <ListChecks aria-hidden className="size-5 text-ink-muted" />
          Critérios da vaga
        </h3>
        <p className="mb-3 text-body-sm text-ink-muted">
          O que a pessoa precisa ter para esta vaga. Obrigatório é o que não dá para abrir mão.
        </p>
        {config.automaticos && (
          <p className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-terra-soft px-3 py-2 text-body-sm">
            <IA forma="Nome" /> montou estes critérios pela vaga. Ajuste se quiser: a leitura refaz sozinha.
            <Selo variante="novo">Novo</Selo>
          </p>
        )}
        <EditorDeCriterios anuncioId={id} iniciais={config.criterios} />
      </section>

      <section
        id="o-que-faz"
        aria-labelledby="titulo-partes"
        className="scroll-mt-32 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
      >
        <h3 id="titulo-partes" className="mb-3 text-h3">
          O que a triagem faz nesta vaga
        </h3>
        <PartesDoCopiloto anuncioId={id} triagem={config.triagem} busca={config.busca} />
      </section>

      {!origens.length ? (
        <Aviso tipo="info" titulo="As duas partes estão desligadas">
          Ligue a busca em Talentos ou a leitura dos candidatos para a triagem trabalhar.
        </Aviso>
      ) : (
        <section id="ranking" aria-labelledby="titulo-ranking" className="flex scroll-mt-32 flex-col gap-4">
          <h3 id="titulo-ranking" className="flex items-center gap-2 text-h3">
            <Trophy aria-hidden className="size-5 text-ink-muted" />
            Ranking da vaga
          </h3>
          {!temCriterios ? (
            <Aviso tipo="info" titulo="Salve os critérios para começar">
              Toque em “Sugerir <IA forma="com" />” ou escreva os seus. Depois, <IA /> lê os currículos.
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
                    ? `${ia.Nome} lê primeiro quem se candidatou e depois os Talentos que mais parecem combinar.`
                    : config.busca
                      ? `${ia.Nome} lê primeiro os Talentos que mais parecem combinar.`
                      : `${ia.Nome} lê o currículo de quem se candidatou.`}
                  {config.busca && " Em Talentos só aparece quem deixou o currículo visível para as empresas."}
                </p>
                {config.triagem && candidatos.length > config.teto && (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
                    <Selo variante="novo">Novo</Selo>
                    Com muitos candidatos, <IA /> lê os {config.teto} que mais combinam com a vaga pelo % de match e
                    pelas palavras dos critérios. Os outros ficam abaixo, na mesma ordem.
                  </p>
                )}
                {semCurriculo > 0 && (
                  <p className="text-body-sm text-ink-muted">
                    {semCurriculo} {semCurriculo === 1 ? "candidato sem currículo" : "candidatos sem currículo"}: veja
                    as respostas no quadro.
                  </p>
                )}
                <RodarCopiloto
                  anuncioId={id}
                  origem="todos"
                  faltam={faltam}
                  lidos={lidas.length}
                  semFaltar={naoLidos.length ? `Os ${config.teto} primeiros já foram lidos.` : undefined}
                />
              </div>

              {lidas.length > 0 && origens.length > 1 && (
                <nav aria-label="Quem ver" className="flex flex-wrap gap-2">
                  {[
                    { v: null, nome: "Candidatos e Talentos" },
                    { v: "candidato" as const, nome: "Candidatos" },
                    { v: "talento" as const, nome: "Talentos" },
                  ].map((o) => (
                    <Link
                      key={o.nome}
                      href={href(o.v)}
                      scroll={false}
                      aria-current={o.v === vista ? "page" : undefined}
                      className={chip(o.v === vista)}
                    >
                      {o.nome}
                    </Link>
                  ))}
                </nav>
              )}

              {ranking.length > 0 && <LegendaDaTira />}

              {grupos.map((g) => {
                const info = temObrigatorios
                  ? GRUPOS[g.grupo]
                  : { nome: "Pela nota", texto: "A vaga não tem critério essencial.", cor: "bg-line-strong" };
                const texto =
                  g.grupo === 2 && g.maisFalta
                    ? `O que mais falta: ${textoCurto(g.maisFalta.texto, 90)} (${g.maisFalta.quantos} de ${g.itens.length}).`
                    : info.texto;
                // um obrigatório que deixa de fora a maior parte de quem foi lido: vale rever se precisa ser obrigatório
                const rever = g.grupo === 2 && g.maisFalta && g.maisFalta.quantos >= Math.max(5, 0.7 * ranking.length);
                const dica = rever && (
                  <p className="text-body-sm">
                    Esse essencial deixa de fora quase todo mundo. Se der para aprender no trabalho, desmarque o
                    Essencial dele em{" "}
                    <a href="#criterios" className="text-label underline underline-offset-2">
                      Critérios
                    </a>
                    .
                  </p>
                );
                const lista = (
                  <div className="rounded-lg border border-line bg-surface-200 px-4 sm:px-5">
                    <ol aria-label={info.nome}>
                      {g.itens.map(({ p, a, n, antiga, posicao, aberto }) => (
                        <CandidatoDoRanking
                          key={p.perfil_id}
                          anuncioId={id}
                          pessoa={p}
                          criterios={config.criterios}
                          leitura={a.leitura}
                          antiga={antiga}
                          numeros={n}
                          agora={agora}
                          vagaNoAr={vagaNoAr}
                          posicao={posicao}
                          aberto={aberto}
                        />
                      ))}
                    </ol>
                  </div>
                );
                const titulo = (
                  <span className="flex flex-wrap items-center gap-x-2 text-label">
                    <span aria-hidden className={`size-2.5 rounded-pill ${info.cor}`} />
                    {info.nome}
                    <span className="font-normal text-ink-muted tabular-nums">{g.itens.length}</span>
                  </span>
                );
                // quem não atende um obrigatório fica fechado quando há gente nos outros grupos
                const fechado = g.grupo === 2 && grupos.length > 1;
                return fechado ? (
                  <div key={g.grupo} className="flex flex-col gap-1">
                    <details className="group/grupo">
                      <summary className="flex min-h-11 cursor-pointer list-none flex-col justify-center gap-0.5 [&::-webkit-details-marker]:hidden">
                        <span className="flex items-center gap-2">
                          {titulo}
                          <ChevronDown
                            aria-hidden
                            className="size-4 text-ink-muted transition-transform group-open/grupo:rotate-180"
                          />
                        </span>
                        {texto && <span className="text-body-sm text-ink-muted">{texto}</span>}
                      </summary>

                      <div className="mt-2">{lista}</div>
                    </details>
                    {dica}
                  </div>
                ) : (
                  <div key={g.grupo} className="flex flex-col gap-2">
                    <div className="flex flex-col gap-0.5">
                      <h4>{titulo}</h4>
                      {texto && <p className="text-body-sm text-ink-muted">{texto}</p>}
                      {dica}
                    </div>
                    {lista}
                  </div>
                );
              })}

              {ranking.length > 0 && (
                <p className="text-body-sm text-ink-muted">
                  A nota vai de 0 a 100: o essencial vale o dobro, e o que falta conferir vale a metade.
                  {lidas.some((l) => l.p.origem === "candidato") && (
                    // para decidir (aceitar, mover de etapa), a ordem vai para os Candidatos da vaga
                    <>
                      {" "}
                      Para aceitar e mover os candidatos, use{" "}
                      <Link
                        href={`/painel/anuncio/${id}/quadro?ordem=chamar`}
                        className="text-label text-ink underline underline-offset-2"
                      >
                        Quem chamar primeiro
                      </Link>{" "}
                      em Candidatos.
                    </>
                  )}
                </p>
              )}

              {vista !== "talento" && (naoLidos.length > 0 || funil.eliminados.length > 0) && (
                <section id="nao-lidos" aria-labelledby="titulo-nao-lidos" className="flex scroll-mt-32 flex-col gap-3">
                  <h4 id="titulo-nao-lidos" className="flex flex-wrap items-center gap-2 text-label">
                    <Filter aria-hidden className="size-5 text-ink-muted" />
                    Não lidos <IA forma="por" />
                    <Selo variante="novo">Novo</Selo>
                  </h4>
                  {naoLidos.length > 0 && (
                    <>
                      <p className="text-body-sm text-ink-muted">
                        {naoLidos.length} {naoLidos.length === 1 ? "candidato ficou" : "candidatos ficaram"} depois dos{" "}
                        {config.teto} primeiros. A ordem é pelo % de match e pelas palavras dos critérios, sem <IA />.
                      </p>
                      <div className="rounded-lg border border-line bg-surface-200 px-4 sm:px-5">
                        <ol aria-label={`Não lidos ${ia.por}`}>
                          {naoLidos.slice(0, MOSTRAR_NAO_LIDOS).map(({ p, posicao }) => (
                            <li
                              key={p.perfil_id}
                              className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-2 last:border-b-0"
                            >
                              <span className="w-8 text-label text-ink-muted">{posicao}º</span>
                              <span className="text-label">{p.nome}</span>
                              <span className="text-body-sm text-ink-muted">pré-nota {p.preNota}</span>
                              <Selo className="ml-auto">
                                não lido <IA forma="por" />
                              </Selo>
                            </li>
                          ))}
                        </ol>
                      </div>
                      {naoLidos.length > MOSTRAR_NAO_LIDOS && (
                        <p className="text-body-sm text-ink-muted">
                          E mais {naoLidos.length - MOSTRAR_NAO_LIDOS}. Veja todos em Candidatos.
                        </p>
                      )}
                      <LerMaisNaTriagem anuncioId={id} abaixo={naoLidos.length} />
                    </>
                  )}
                  {funil.eliminados.length > 0 && (
                    <p className="text-body-sm text-ink-muted">
                      {funil.eliminados.length}{" "}
                      {funil.eliminados.length === 1
                        ? "candidato ficou fora por uma pergunta eliminatória"
                        : "candidatos ficaram fora por uma pergunta eliminatória"}
                      : <IA /> não lê. Eles continuam em Candidatos.
                    </p>
                  )}
                </section>
              )}
            </>
          )}
        </section>
      )}

      <section
        id="historico"
        aria-labelledby="titulo-registro"
        className="scroll-mt-32 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
      >
        <h3 id="titulo-registro" className="mb-2 flex items-center gap-2 text-h3">
          <History aria-hidden className="size-5 text-ink-muted" />O que a triagem fez
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
          A triagem não recusa ninguém e cada pessoa recebe no máximo 3 convites por semana, somando todas as empresas.
        </p>
      </section>
    </div>
  );
}
