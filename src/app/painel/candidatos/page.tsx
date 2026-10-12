import { BadgeCheck, ChevronDown, Download, FileText, Search, ShieldAlert, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BotaoConversar } from "@/components/botao-conversar";
import { BotoesContato } from "@/components/contato";
import { CurriculoResumo } from "@/components/curriculo-resumo";
import { DesfazerMatch } from "@/components/desfazer-match";
import { AcoesInteressado } from "@/components/painel/acoes";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { EtapaDoCandidato } from "@/components/painel/etapa-candidato";
import { FiltroVaga } from "@/components/painel/filtro-vaga";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { classesEntrada } from "@/components/ui/campo";
import { MODO_DEMO } from "@/lib/config";
import {
  ETAPAS_CANDIDATO,
  etapasDoTipo,
  motivoParaOutro,
  nomeMotivoDesfazer,
  type EtapaCandidato,
} from "@/lib/constantes";
import {
  listarCurriculosDosInteressados,
  listarDesfeitosDoAnuncio,
  listarMeusBloqueios,
  listarMeusCandidatos,
  obterAnuncio,
  type Desfeito,
} from "@/lib/dados";
import { formatarLugar, primeiro, tempoRelativo } from "@/lib/formato";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { CurriculoDoInteressado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

export const metadata: Metadata = { title: "Candidatos" };

// Situação da curtida, do jeito que quem publicou age: primeiro quem espera resposta.
const SITUACAO: Record<string, { nome: string; variante: "aviso" | "match" | "contorno"; ordem: number }> = {
  pendente: { nome: "Para responder", variante: "aviso", ordem: 0 },
  match: { nome: "Deu match", variante: "match", ordem: 1 },
  desfeito: { nome: "Match desfeito", variante: "contorno", ordem: 2 },
  dispensada: { nome: "Dispensado", variante: "contorno", ordem: 3 },
};

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
        Tente de novo em instantes. Enquanto isso, cada vaga mostra quem curtiu em “Meus anúncios”.
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
  const paraResponder = daVaga.filter((c) => c.status === "pendente").length;
  const procurado = simples(busca);
  const lista = daVaga
    .filter((c) => (responder ? c.status === "pendente" : !etapa || c.etapa === etapa))
    .filter((c) => !procurado || simples(c.nome).includes(procurado))
    // quem espera resposta primeiro; dentro de cada grupo, a curtida mais nova primeiro
    .sort(
      (a, b) =>
        (SITUACAO[a.status]?.ordem ?? 9) - (SITUACAO[b.status]?.ordem ?? 9) ||
        new Date(b.curtido_em).getTime() - new Date(a.curtido_em).getTime(),
    );

  // O que cada cartão precisa para responder ali mesmo, só das vagas que aparecem
  const vagasDaLista = [...new Set(lista.map((c) => c.anuncio_id))];
  const comCurriculo = vagasDaLista.filter((id) => lista.some((c) => c.anuncio_id === id && c.tem_curriculo));
  const comDesfeito = vagasDaLista.filter((id) => lista.some((c) => c.anuncio_id === id && c.status === "desfeito"));
  const [anuncios, curriculos, desfeitos, bloqueios] = await Promise.all([
    Promise.all(vagasDaLista.map(async (id) => [id, await obterAnuncio(id)] as const)).then((l) => new Map(l)),
    Promise.all(
      comCurriculo.map(async (id) => [id, await listarCurriculosDosInteressados(id).catch(() => null)] as const),
    ).then((l) => new Map(l)),
    Promise.all(
      comDesfeito.map(async (id) => [id, await listarDesfeitosDoAnuncio(id).catch(() => null)] as const),
    ).then((l) => new Map(l)),
    comDesfeito.length ? listarMeusBloqueios() : Promise.resolve(new Map<string, { eu: boolean; ele: boolean }>()),
  ]);

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
  const chip = (ativo: boolean, destaque = false) =>
    `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
      ativo
        ? "border-ink bg-ink text-surface-100"
        : destaque
          ? "border-transparent bg-terra-soft text-terra-text hover:border-terra-text"
          : "border-line bg-surface-300 text-ink hover:border-line-strong"
    }`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <h2 className="text-h2">Candidatos</h2>
          <p className="mt-1 text-body text-ink-muted">
            Quem curtiu suas vagas, todas juntas. Responda aqui mesmo, marque a etapa e anote: a pessoa vê a etapa e
            recebe um aviso quando ela muda; a anotação é só sua.
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
            className={chip(responder, paraResponder > 0)}
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
                className={chip(ativo)}
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
      ) : (
        <ul aria-label="Lista de candidatos" className="flex flex-col gap-3">
          {lista.map((c) => (
            <CartaoCandidato
              key={`${c.anuncio_id}-${c.perfil_id}`}
              c={c}
              agora={agora}
              mostrarVaga={!vaga}
              pedeCurriculo={Boolean(anuncios.get(c.anuncio_id)?.pede_curriculo)}
              curriculo={curriculos.get(c.anuncio_id)?.get(c.perfil_id) ?? null}
              curriculoFalhou={c.tem_curriculo && curriculos.get(c.anuncio_id) === null}
              desfeito={desfeitos.get(c.anuncio_id)?.get(c.perfil_id)}
              bloqueio={bloqueios.get(c.perfil_id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Um candidato, com tudo para resolver ali mesmo: responder (curtir de volta ou
 * dispensar), ver o currículo, conversar e chamar no WhatsApp depois do match,
 * marcar a etapa e anotar.
 */
function CartaoCandidato({
  c,
  agora,
  mostrarVaga,
  pedeCurriculo,
  curriculo,
  curriculoFalhou,
  desfeito,
  bloqueio,
}: {
  c: Candidato;
  agora: number;
  mostrarVaga: boolean;
  pedeCurriculo: boolean;
  curriculo: CurriculoDoInteressado | null;
  curriculoFalhou: boolean;
  desfeito: Desfeito | undefined;
  bloqueio: { eu: boolean; ele: boolean } | undefined;
}) {
  const situacao = SITUACAO[c.status] ?? SITUACAO.pendente;
  const primeiroNome = c.nome.split(" ")[0];
  const comModeracao = c.anuncio_status === "em_analise" || c.anuncio_status === "removido";
  const encerrado = c.status === "dispensada" || c.status === "desfeito";
  const hoje = new Date(agora).toISOString().slice(0, 7);
  // vaga que pede currículo: o match espera a pessoa preencher
  const semCurriculo = pedeCurriculo && !c.tem_curriculo ? primeiroNome : null;

  return (
    <li
      className={`flex flex-col gap-3 rounded-lg border bg-surface-200 p-4 shadow-card sm:p-5 ${
        c.status === "match" ? "border-cerrado" : "border-line"
      }`}
    >
      <div className={`flex gap-3 ${encerrado ? "opacity-75" : ""}`}>
        <Avatar nome={c.nome} foto={c.foto} tamanho={48} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-label">
            <Link href={`/perfil/${c.perfil_id}`} className="truncate underline-offset-2 hover:underline">
              {c.nome}
            </Link>
            {c.verificado && (
              <BadgeCheck aria-label="Perfil verificado" className="size-4 shrink-0 text-cerrado-text" />
            )}
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
            curtiu {tempoRelativo(c.curtido_em, agora)} · {formatarLugar(c.bairro, c.cidade)}
          </p>
          {/* no celular o selo vai embaixo do nome, para não espremer o texto */}
          <span className="mt-1.5 block sm:hidden">
            <Selo variante={situacao.variante}>{situacao.nome}</Selo>
          </span>
        </div>
        <span className="hidden self-start sm:block">
          <Selo variante={situacao.variante}>{situacao.nome}</Selo>
        </span>
      </div>

      {c.mensagem && <blockquote className="rounded-md bg-surface-300 p-3 text-body-sm">“{c.mensagem}”</blockquote>}

      {curriculo ? (
        <details className="group rounded-md border border-line bg-surface-100">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-label [&::-webkit-details-marker]:hidden">
            <FileText aria-hidden className="size-4 shrink-0 text-ink-muted" />
            Ver currículo
            <ChevronDown
              aria-hidden
              className="ml-auto size-4 text-ink-muted transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-line p-3">
            <CurriculoResumo curriculo={curriculo} linkPdf={curriculo.link_pdf} hoje={hoje} />
          </div>
        </details>
      ) : curriculoFalhou ? (
        <p className="flex items-center gap-2 text-body-sm text-ink-muted">
          <FileText aria-hidden className="size-4 shrink-0" />
          <Link href={`/painel/anuncio/${c.anuncio_id}`} className="underline underline-offset-2">
            Ver o currículo na vaga
          </Link>
        </p>
      ) : null}

      {/* ações à esquerda, etapa e anotação à direita (no celular, uma embaixo da outra) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line pt-3">
        {comModeracao ? (
          <p className="flex items-start gap-2 text-body-sm text-ink-muted">
            <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            Esta vaga está com a moderação: dá para responder depois que ela for liberada.
          </p>
        ) : c.status === "match" ? (
          <div className="flex flex-wrap items-center gap-2">
            <BotaoConversar anuncioId={c.anuncio_id} outroId={c.perfil_id} />
            <BotoesContato
              whatsapp={c.whatsapp}
              email={c.email}
              mensagem={`Olá, ${primeiroNome}! Vi que você curtiu “${c.anuncio_titulo}” no Publike. Vamos conversar?`}
            />
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
          />
        )}

        {!encerrado && (
          <EtapaDoCandidato
            compacto
            tipo="vaga"
            anuncioId={c.anuncio_id}
            perfilId={c.perfil_id}
            etapa={c.etapa}
            nota={c.nota}
          />
        )}
      </div>

      {c.status === "match" && !comModeracao && (
        <div>
          <DesfazerMatch anuncioId={c.anuncio_id} perfilId={c.perfil_id} outroNome={c.nome} autorDaVaga />
        </div>
      )}
    </li>
  );
}
