import {
  CalendarClock,
  ChevronDown,
  Download,
  FileText,
  KanbanSquare,
  Mail,
  MessageCircle,
  NotebookPen,
  Phone,
  Search,
  ShieldAlert,
  Target,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { BotaoConversar } from "@/components/botao-conversar";
import { CurriculoResumo } from "@/components/curriculo-resumo";
import { DesfazerMatch } from "@/components/desfazer-match";
import { AcoesInteressado } from "@/components/painel/acoes";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { EtapaDoCandidato } from "@/components/painel/etapa-candidato";
import { FiltroVaga } from "@/components/painel/filtro-vaga";
import { classesChip } from "@/components/painel/fluxo";
import { CriteriosDaAderencia, NotaAderencia } from "@/components/painel/nota-aderencia";
import { RespostasDoCandidato } from "@/components/painel/respostas-candidato";
import { SeloVerificado } from "@/components/selo-verificado";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { calcularAderencia, type Aderencia } from "@/lib/aderencia";
import { MODO_DEMO } from "@/lib/config";
import {
  ETAPAS_CANDIDATO,
  esperaCurriculo,
  esperaResposta,
  etapasDoTipo,
  motivoParaOutro,
  nomeMotivoDesfazer,
  situacaoDaCurtida,
  type EtapaCandidato,
} from "@/lib/constantes";
import {
  listarCurriculosDosInteressados,
  listarDesfeitosDoAnuncio,
  listarMeusBloqueios,
  listarMeusCandidatos,
  listarRespostasDosCandidatos,
  obterAnuncio,
  type Desfeito,
} from "@/lib/dados";
import { minhasContratacoesPublicas } from "@/lib/dados-social";
import { formatarLugar, formatarTelefone, linkWhatsApp, primeiro, tempoRelativo } from "@/lib/formato";
import { dataDaEntrevista, SITUACOES_ENTREVISTA } from "@/lib/recrutamento";
import { entrevistasDasVagas, type Entrevista } from "@/lib/servidor/quadro";
import { obterTriagens } from "@/lib/servidor/triagem";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { CurriculoDoInteressado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";
import { juntarTriagem, perguntasDoBanco, type Pergunta, type Respostas } from "@/lib/vaga-extra";

export const metadata: Metadata = { title: "Candidatos" };

// A situação de cada candidato, do jeito que quem publicou age.
// "aceita": você aceitou, e a vaga espera o currículo da pessoa para dar match.
const SITUACAO: Record<string, { nome: string; variante: "aviso" | "match" | "contorno" | "neutro" }> = {
  pendente: { nome: "Para responder", variante: "aviso" },
  aceita: { nome: "Esperando currículo", variante: "neutro" },
  match: { nome: "Deu match", variante: "match" },
  desfeito: { nome: "Match desfeito", variante: "contorno" },
  dispensada: { nome: "Dispensado", variante: "contorno" },
};

// A lista em três partes: quem espera a sua resposta, quem você já aceitou e quem saiu.
type Grupo = "responder" | "andamento" | "encerrados";
const GRUPOS: Record<Grupo, { titulo: string; ajuda: string }> = {
  responder: {
    titulo: "Para responder",
    ajuda: "Esperando a sua resposta. Quem mais combina com a vaga vem primeiro.",
  },
  andamento: { titulo: "Em andamento", ajuda: "Quem você aceitou: converse, marque a entrevista e mude a etapa." },
  encerrados: { titulo: "Encerrados", ajuda: "Dispensados e matches desfeitos." },
};
const ORDEM_GRUPOS: Grupo[] = ["responder", "andamento", "encerrados"];
const grupoDe = (c: { status: string; aceita_em?: string | null }): Grupo =>
  esperaResposta(c) ? "responder" : c.status === "dispensada" || c.status === "desfeito" ? "encerrados" : "andamento";

const ENTREVISTA_ABERTA = ["marcada", "confirmada", "remarcar"];

/** Sem acento e em minúsculas, para a busca pelo nome. */
const simples = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export default function Candidatos({ searchParams }: PageProps<"/painel/candidatos">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

type Candidato = NonNullable<Awaited<ReturnType<typeof listarMeusCandidatos>>>[number];

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/candidatos">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel/candidatos");
  const sp = await searchParams;
  const pedidaVaga = primeiro(sp.vaga);
  const pedidaEtapa = primeiro(sp.etapa);
  const responder = primeiro(sp.situacao) === "responder";
  const busca = (primeiro(sp.q) ?? "").trim().slice(0, 60);
  const todos = await listarMeusCandidatos();
  const agora = await agoraDaRequisicao();

  if (!todos) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar os candidatos agora">
        Tente de novo em instantes. Enquanto isso, cada vaga mostra quem curtiu em “Minhas vagas”.
      </Aviso>
    );
  }
  if (todos.length === 0) {
    return (
      <Vazio
        icone={Users}
        titulo="Ninguém curtiu suas vagas ainda"
        acao={<BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>}
      >
        Quem curtir qualquer vaga sua aparece aqui, de todas as vagas juntas. Você responde, marca a etapa de cada
        pessoa, anota o que combinou e baixa a lista numa planilha.
      </Vazio>
    );
  }

  // as vagas com candidatos, para o filtro
  const vagas = new Map<string, { id: string; titulo: string; total: number }>();
  for (const c of todos) {
    const v = vagas.get(c.anuncio_id) ?? { id: c.anuncio_id, titulo: c.anuncio_titulo, total: 0 };
    v.total++;
    vagas.set(c.anuncio_id, v);
  }
  const vaga = pedidaVaga && UUID.test(pedidaVaga) && vagas.has(pedidaVaga) ? pedidaVaga : null;
  const etapa = !responder && pedidaEtapa && pedidaEtapa in ETAPAS_CANDIDATO ? (pedidaEtapa as EtapaCandidato) : null;
  const daVaga = vaga ? todos.filter((c) => c.anuncio_id === vaga) : todos;
  const contagem = new Map<EtapaCandidato, number>();
  for (const c of daVaga) contagem.set(c.etapa, (contagem.get(c.etapa) ?? 0) + 1);
  const paraResponder = daVaga.filter(esperaResposta).length;
  const procurado = simples(busca);
  const lista = daVaga
    .filter((c) => (responder ? esperaResposta(c) : !etapa || c.etapa === etapa))
    .filter((c) => !procurado || simples(c.nome).includes(procurado));

  // O que cada cartão precisa, só das vagas que aparecem
  const vagasDaLista = [...new Set(lista.map((c) => c.anuncio_id))];
  const comCurriculo = vagasDaLista.filter((id) => lista.some((c) => c.anuncio_id === id && c.tem_curriculo));
  const comDesfeito = vagasDaLista.filter((id) => lista.some((c) => c.anuncio_id === id && c.status === "desfeito"));
  const [anuncios, curriculos, desfeitos, bloqueios, publicas, respostas, triagens, entrevistas] = await Promise.all([
    Promise.all(vagasDaLista.map(async (id) => [id, await obterAnuncio(id)] as const)).then((l) => new Map(l)),
    Promise.all(
      comCurriculo.map(async (id) => [id, await listarCurriculosDosInteressados(id).catch(() => null)] as const),
    ).then((l) => new Map(l)),
    Promise.all(
      comDesfeito.map(async (id) => [id, await listarDesfeitosDoAnuncio(id).catch(() => null)] as const),
    ).then((l) => new Map(l)),
    comDesfeito.length ? listarMeusBloqueios() : Promise.resolve(new Map<string, { eu: boolean; ele: boolean }>()),
    minhasContratacoesPublicas(),
    listarRespostasDosCandidatos(vagasDaLista),
    obterTriagens(vagasDaLista),
    entrevistasDasVagas(vagasDaLista),
  ]);

  // a nota de aderência (a mesma do quadro) e a entrevista em aberto de cada um
  const perguntasDe = new Map(
    vagasDaLista.map((id) => [
      id,
      juntarTriagem(perguntasDoBanco(anuncios.get(id)?.perguntas), triagens.get(id) ?? {}),
    ]),
  );
  const chave = (c: Candidato) => `${c.anuncio_id}:${c.perfil_id}`;
  const aderencias = new Map<string, Aderencia | null>();
  for (const c of lista) {
    const a = anuncios.get(c.anuncio_id);
    aderencias.set(
      chave(c),
      a
        ? calcularAderencia(
            {
              escolaridade_minima: a.escolaridade_minima,
              experiencia: a.experiencia,
              cnh: a.cnh,
              cidade: a.cidade,
              perguntas: perguntasDe.get(c.anuncio_id) ?? [],
            },
            {
              curriculo: curriculos.get(c.anuncio_id)?.get(c.perfil_id) ?? null,
              respostas: respostas.get(chave(c)) ?? {},
              cidade: c.cidade,
            },
            agora,
          )
        : null,
    );
  }
  const entrevistaDe = (c: Candidato) => {
    const e = entrevistas.get(chave(c));
    return e && c.status === "match" && ENTREVISTA_ABERTA.includes(e.situacao) ? e : null;
  };

  // cada grupo na sua ordem: para responder, os mais aderentes primeiro; em andamento, a
  // entrevista mais próxima primeiro; encerrados, os mais novos
  const peso = (c: Candidato) => {
    const a = aderencias.get(chave(c));
    return !a ? -1 : a.eliminado ? -2 : (a.nota ?? -1);
  };
  const recente = (a: Candidato, b: Candidato) => new Date(b.curtido_em).getTime() - new Date(a.curtido_em).getTime();
  const grupos: Record<Grupo, Candidato[]> = { responder: [], andamento: [], encerrados: [] };
  for (const c of lista) grupos[grupoDe(c)].push(c);
  grupos.responder.sort((a, b) => peso(b) - peso(a) || recente(a, b));
  grupos.andamento.sort((a, b) => {
    const ea = entrevistaDe(a);
    const eb = entrevistaDe(b);
    if (ea && eb) return new Date(ea.quando).getTime() - new Date(eb.quando).getTime();
    if (ea || eb) return ea ? -1 : 1;
    return recente(a, b);
  });
  grupos.encerrados.sort(recente);
  const comItens = ORDEM_GRUPOS.filter((g) => grupos[g].length > 0);

  const link = (mudar: { etapa?: EtapaCandidato | null; responder?: boolean }) => {
    const q = new URLSearchParams();
    if (vaga) q.set("vaga", vaga);
    if (mudar.responder) q.set("situacao", "responder");
    else if (mudar.etapa) q.set("etapa", mudar.etapa);
    if (busca) q.set("q", busca);
    const s = q.toString();
    return `/painel/candidatos${s ? `?${s}` : ""}`;
  };
  const planilha = (() => {
    const q = new URLSearchParams();
    if (vaga) q.set("vaga", vaga);
    if (responder) q.set("situacao", "responder");
    else if (etapa) q.set("etapa", etapa);
    const s = q.toString();
    return `/painel/candidatos/planilha${s ? `?${s}` : ""}`;
  })();

  const cartao = (c: Candidato) => (
    <CartaoCandidato
      key={chave(c)}
      c={c}
      comSecoes={comItens.length > 1}
      agora={agora}
      mostrarVaga={!vaga}
      pedeCurriculo={Boolean(anuncios.get(c.anuncio_id)?.pede_curriculo)}
      curriculo={curriculos.get(c.anuncio_id)?.get(c.perfil_id) ?? null}
      curriculoFalhou={c.tem_curriculo && curriculos.get(c.anuncio_id) === null}
      desfeito={desfeitos.get(c.anuncio_id)?.get(c.perfil_id)}
      bloqueio={bloqueios.get(c.perfil_id)}
      publica={publicas.get(chave(c))}
      perguntas={perguntasDe.get(c.anuncio_id) ?? []}
      respostas={respostas.get(chave(c))}
      aderencia={aderencias.get(chave(c)) ?? null}
      entrevista={entrevistaDe(c)}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-h2">Candidatos</h2>
          <p className="mt-1 text-body text-ink-muted">
            Todos que curtiram suas vagas. Responda quem está esperando, converse com quem deu match e acompanhe as
            entrevistas.
          </p>
        </div>
        <a href={planilha} className={classesBotao("secundario", "sm")}>
          <Download aria-hidden />
          Baixar planilha
        </a>
      </div>

      <div className="flex flex-col gap-3">
        {(vagas.size > 1 || todos.length > 8) && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {vagas.size > 1 && (
              <FiltroVaga
                vagas={[...vagas.values()]}
                vaga={vaga}
                etapa={responder ? null : etapa}
                situacao={responder ? "responder" : null}
              />
            )}
            {todos.length > 8 && (
              // busca pelo nome (formulário simples: funciona sem JavaScript)
              <form role="search" action="/painel/candidatos" className="flex flex-col gap-1.5 sm:w-72">
                <label htmlFor="busca-candidato" className="text-label">
                  Procurar pelo nome
                </label>
                <div className="relative">
                  <Search
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
                  />
                  <input
                    id="busca-candidato"
                    name="q"
                    type="search"
                    defaultValue={busca}
                    placeholder="Ex.: Maria"
                    className={`${classesEntrada} pl-9`}
                  />
                </div>
                {vaga && <input type="hidden" name="vaga" value={vaga} />}
                {responder && <input type="hidden" name="situacao" value="responder" />}
                {etapa && <input type="hidden" name="etapa" value={etapa} />}
              </form>
            )}
          </div>
        )}
        <nav
          aria-label="Filtrar candidatos"
          // no celular, os filtros rolam de lado (uma linha só); no computador, quebram linha
          className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          <Link
            href={link({ responder: true })}
            scroll={false}
            aria-current={responder ? "page" : undefined}
            className={classesChip(responder, paraResponder > 0)}
          >
            Para responder
            <span className={responder ? "text-surface-100/80" : paraResponder > 0 ? "" : "text-ink-muted"}>
              {paraResponder}
            </span>
          </Link>
          {[null, ...etapasDoTipo("vaga")].map((e) => {
            const ativo = !responder && etapa === e;
            return (
              <Link
                key={e ?? "todos"}
                href={link({ etapa: e })}
                scroll={false}
                aria-current={ativo ? "page" : undefined}
                className={classesChip(ativo)}
              >
                {e ? ETAPAS_CANDIDATO[e].nome : "Todos"}
                <span className={ativo ? "text-surface-100/80" : "text-ink-muted"}>
                  {e ? (contagem.get(e) ?? 0) : daVaga.length}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {lista.length === 0 ? (
        <p className="text-body text-ink-muted">
          {busca
            ? `Ninguém com “${busca}” no nome${responder || etapa ? " neste filtro" : ""}.`
            : responder
              ? "Ninguém esperando resposta: você está em dia."
              : "Ninguém nesta etapa."}
        </p>
      ) : comItens.length === 1 ? (
        // um grupo só (um filtro escolhido, por exemplo): a lista direto, sem título
        <ul aria-label="Lista de candidatos" className="flex flex-col gap-3">
          {grupos[comItens[0]].map(cartao)}
        </ul>
      ) : (
        <div className="flex flex-col gap-8">
          {comItens.map((g) =>
            // encerrados ficam fechados embaixo, para não misturar com quem ainda está no processo
            g === "encerrados" ? (
              <details key={g} className="group">
                <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-0.5 [&::-webkit-details-marker]:hidden">
                  <h3 className="text-h3 whitespace-nowrap">
                    {GRUPOS[g].titulo}{" "}
                    <span className="font-normal text-ink-muted tabular-nums">{grupos[g].length}</span>
                  </h3>
                  <ChevronDown
                    aria-hidden
                    className="size-5 text-ink-muted transition-transform group-open:rotate-180"
                  />
                  <span className="basis-full text-body-sm text-ink-muted sm:basis-auto">{GRUPOS[g].ajuda}</span>
                </summary>
                <ul aria-label={GRUPOS[g].titulo} className="mt-3 flex flex-col gap-3">
                  {grupos[g].map(cartao)}
                </ul>
              </details>
            ) : (
              <section key={g} aria-labelledby={`grupo-${g}`} className="flex flex-col gap-3">
                <div>
                  <h3 id={`grupo-${g}`} className="text-h3">
                    {GRUPOS[g].titulo}{" "}
                    <span className="font-normal text-ink-muted tabular-nums">{grupos[g].length}</span>
                  </h3>
                  <p className="text-body-sm text-ink-muted">{GRUPOS[g].ajuda}</p>
                </div>
                <ul aria-label={GRUPOS[g].titulo} className="flex flex-col gap-3">
                  {grupos[g].map(cartao)}
                </ul>
              </section>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/** Um pedaço dos detalhes do candidato (currículo, aderência, contato), com o título em cima. */
function Bloco({ titulo, icone, children }: { titulo: string; icone: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-md border border-line bg-surface-100 p-3">
      <p className="flex items-center gap-2 text-label">
        {icone}
        {titulo}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/**
 * Um candidato numa olhada: quem é, de qual vaga, a aderência, a entrevista e o recado;
 * embaixo, a ação certa para o momento (responder, conversar) e a etapa. Currículo,
 * respostas, o porquê da nota, contato e “desfazer” abrem em “Ver detalhes”.
 */
function CartaoCandidato({
  c,
  comSecoes,
  agora,
  publica,
  mostrarVaga,
  pedeCurriculo,
  curriculo,
  curriculoFalhou,
  desfeito,
  bloqueio,
  perguntas,
  respostas,
  aderencia,
  entrevista,
}: {
  c: Candidato;
  /** a lista está dividida em grupos com título (Para responder, Em andamento…) */
  comSecoes: boolean;
  agora: number;
  mostrarVaga: boolean;
  pedeCurriculo: boolean;
  curriculo: CurriculoDoInteressado | null;
  curriculoFalhou: boolean;
  desfeito: Desfeito | undefined;
  bloqueio: { eu: boolean; ele: boolean } | undefined;
  publica: { ok_empresa: boolean; ok_pessoa: boolean } | undefined;
  perguntas: Pergunta[];
  respostas: Respostas | undefined;
  aderencia: Aderencia | null;
  entrevista: Entrevista | null;
}) {
  const situacao = SITUACAO[situacaoDaCurtida(c)] ?? SITUACAO.pendente;
  const primeiroNome = c.nome.split(" ")[0];
  const comModeracao = c.anuncio_status === "em_analise" || c.anuncio_status === "removido";
  const match = c.status === "match";
  const encerrado = c.status === "dispensada" || c.status === "desfeito";
  const hoje = new Date(agora).toISOString().slice(0, 7);
  // vaga que pede currículo: o match espera a pessoa mandar
  const semCurriculo = pedeCurriculo && !c.tem_curriculo ? primeiroNome : null;
  // no grupo "Para responder" o título já diz; nos outros, o selo separa match, aceite e encerrado
  const selo = comSecoes && esperaResposta(c) ? null : <Selo variante={situacao.variante}>{situacao.nome}</Selo>;

  return (
    <li
      id={`candidato-${c.anuncio_id}-${c.perfil_id}`}
      className={`scroll-mt-24 rounded-lg border bg-surface-200 shadow-card ${match ? "border-cerrado" : "border-line"}`}
    >
      {/* quem é, numa olhada */}
      <div className={`flex gap-3 p-4 sm:px-5 ${encerrado ? "opacity-75" : ""}`}>
        <Avatar nome={c.nome} foto={c.foto} tamanho={44} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link href={`/perfil/${c.perfil_id}`} className="text-label break-words underline-offset-2 hover:underline">
              {c.nome}
            </Link>
            {c.verificado && <SeloVerificado />}
            {aderencia && !encerrado && <NotaAderencia a={aderencia} longo />}
          </p>
          <p className="text-body-sm text-ink-muted">
            {mostrarVaga && (
              <>
                <Link href={`/painel/anuncio/${c.anuncio_id}`} className="text-ink underline underline-offset-2">
                  {c.anuncio_titulo}
                </Link>
                {" · "}
              </>
            )}
            {formatarLugar(c.bairro, c.cidade)} · curtiu {tempoRelativo(c.curtido_em, agora)}
          </p>
          {/* no celular o selo vai embaixo do nome, para não espremer o texto */}
          {selo && <span className="mt-1.5 block sm:hidden">{selo}</span>}
          {entrevista && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
              <CalendarClock aria-hidden className="size-4 shrink-0 text-ink-muted" />
              <span className="font-semibold">Entrevista {dataDaEntrevista(entrevista.quando)}</span>
              <Selo variante={SITUACOES_ENTREVISTA[entrevista.situacao]?.tom ?? "aviso"}>
                {SITUACOES_ENTREVISTA[entrevista.situacao]?.nome ?? entrevista.situacao}
              </Selo>
            </p>
          )}
          {c.mensagem && (
            <p className="mt-2 line-clamp-3 rounded-md bg-surface-300 px-3 py-2 text-body-sm">“{c.mensagem}”</p>
          )}
          {c.nota && (
            <p className="mt-2 flex items-start gap-1.5 text-body-sm text-ink-muted">
              <NotebookPen aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span className="line-clamp-2">
                <span className="sr-only">Sua anotação: </span>
                {c.nota}
              </span>
            </p>
          )}
        </div>
        {selo && <span className="hidden self-start sm:block">{selo}</span>}
      </div>

      {/* o que fazer agora (à esquerda) e a etapa (à direita; no celular, embaixo) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line px-4 py-3 sm:px-5">
        {comModeracao ? (
          <p className="flex items-start gap-2 text-body-sm text-ink-muted">
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            Esta vaga está com a moderação: dá para responder depois que ela for liberada.
          </p>
        ) : match ? (
          <div className="flex flex-wrap items-center gap-2">
            <BotaoConversar anuncioId={c.anuncio_id} outroId={c.perfil_id} />
            {c.whatsapp && (
              <a
                href={linkWhatsApp(
                  c.whatsapp,
                  `Olá, ${primeiroNome}! Vi que você curtiu “${c.anuncio_titulo}” no Publike. Vamos conversar?`,
                )}
                target="_blank"
                rel="noopener noreferrer"
                className={classesBotao("sucesso", "sm")}
              >
                <MessageCircle aria-hidden />
                WhatsApp
              </a>
            )}
          </div>
        ) : c.status === "desfeito" ? (
          <div className="flex flex-col gap-2">
            <p className="text-body-sm text-ink-muted">
              {desfeito
                ? desfeito.porMim
                  ? `Você desfez o match. Motivo: ${nomeMotivoDesfazer(desfeito.motivo).toLowerCase()}.`
                  : `${primeiroNome} desfez o match. Motivo: ${motivoParaOutro(desfeito.motivo)}.`
                : "O match foi desfeito."}{" "}
              {bloqueio?.ele
                ? `${primeiroNome} preferiu não negociar de novo.`
                : "Se quiserem, dá para dar match de novo."}
            </p>
            {!bloqueio?.ele && (
              <AcoesInteressado
                anuncioId={c.anuncio_id}
                perfilId={c.perfil_id}
                status="desfeito"
                semCurriculo={semCurriculo}
              />
            )}
          </div>
        ) : (
          <AcoesInteressado
            anuncioId={c.anuncio_id}
            perfilId={c.perfil_id}
            status={c.status}
            semCurriculo={semCurriculo}
            aceita={esperaCurriculo(c)}
            compacto
          />
        )}

        {!encerrado && (
          <EtapaDoCandidato
            compacto
            tipo="vaga"
            status={c.status}
            anuncioId={c.anuncio_id}
            perfilId={c.perfil_id}
            etapa={c.etapa}
            nota={c.nota}
            publico={{ okEmpresa: publica?.ok_empresa ?? false, okPessoa: publica?.ok_pessoa ?? false, nome: c.nome }}
          />
        )}
      </div>

      {/* currículo, respostas, o porquê da nota, contato e o resto */}
      <details className="group border-t border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-label text-ink-muted hover:text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
          <FileText aria-hidden className="size-4 shrink-0" />
          {curriculo ? "Ver currículo e detalhes" : "Ver detalhes"}
          <ChevronDown aria-hidden className="ml-auto size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 border-t border-line px-4 py-4 sm:px-5">
          <Bloco titulo="Currículo" icone={<FileText aria-hidden className="size-4 shrink-0 text-ink-muted" />}>
            {curriculo ? (
              <CurriculoResumo curriculo={curriculo} linkPdf={curriculo.link_pdf} hoje={hoje} />
            ) : curriculoFalhou ? (
              <Link href={`/painel/anuncio/${c.anuncio_id}`} className="text-body-sm underline underline-offset-2">
                Ver o currículo na vaga
              </Link>
            ) : (
              <p className="text-body-sm text-ink-muted">
                {primeiroNome} ainda não mandou currículo{pedeCurriculo ? ", que esta vaga pede." : "."}
              </p>
            )}
          </Bloco>
          <RespostasDoCandidato perguntas={perguntas} respostas={respostas} />
          {aderencia && aderencia.criterios.length > 0 && (
            <Bloco
              titulo={
                aderencia.eliminado
                  ? "Aderência à vaga: eliminado"
                  : aderencia.nota !== null
                    ? `Aderência à vaga: ${aderencia.nota}%`
                    : "Aderência à vaga"
              }
              icone={<Target aria-hidden className="size-4 shrink-0 text-ink-muted" />}
            >
              <CriteriosDaAderencia a={aderencia} />
            </Bloco>
          )}
          {match && (c.whatsapp || c.email) && (
            <Bloco titulo="Contato" icone={<Phone aria-hidden className="size-4 shrink-0 text-ink-muted" />}>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-body-sm">
                {c.whatsapp && (
                  <a
                    href={`tel:+${c.whatsapp}`}
                    className="inline-flex min-h-10 items-center gap-1.5 underline-offset-2 hover:underline"
                  >
                    <Phone aria-hidden className="size-4 text-ink-muted" />
                    {formatarTelefone(c.whatsapp)}
                  </a>
                )}
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="inline-flex min-h-10 items-center gap-1.5 break-all underline-offset-2 hover:underline"
                  >
                    <Mail aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    {c.email}
                  </a>
                )}
              </div>
            </Bloco>
          )}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link
              href={`/painel/anuncio/${c.anuncio_id}/quadro?candidato=${c.perfil_id}`}
              className="inline-flex min-h-10 items-center gap-1.5 text-label underline-offset-2 hover:underline"
            >
              <KanbanSquare aria-hidden className="size-4 text-ink-muted" />
              Abrir no quadro (entrevista e mensagens)
            </Link>
            {match && !comModeracao && (
              <DesfazerMatch anuncioId={c.anuncio_id} perfilId={c.perfil_id} outroNome={c.nome} autorDaVaga />
            )}
          </div>
        </div>
      </details>
    </li>
  );
}
