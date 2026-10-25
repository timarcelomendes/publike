import { Building2, Clock, Handshake, MessageCircle, Search, UserPlus, UsersRound, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DesfazerConexao, ResponderConexao } from "@/components/conexoes/acoes-conexao";
import { linkDoOutro, QuemConexao } from "@/components/conexoes/quem";
import { BotaoConectarCompacto } from "@/components/conexoes/botao-conectar-compacto";
import { AbasMensagens, AbasMensagensBase } from "@/components/painel/abas-mensagens";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { ChipFiltro } from "@/components/painel/fluxo";
import { SeloVerificado } from "@/components/selo-verificado";
import { BotaoSeguir } from "@/components/social/botoes";
import { ListaSeguindo } from "@/components/social/lista-seguindo";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Avatar, Aviso, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { caminhoConexao, pedirDeNovoEm, type Conexao } from "@/lib/conexoes";
import { meuCurriculoNaVitrine, minhasBuscasSalvas, obterMeuPerfil } from "@/lib/dados";
import { meusSeguidos } from "@/lib/dados-social";
import { formatarDataCurta, formatarLugar, plural, primeiro, tempoRelativo } from "@/lib/formato";
import { estadosDeConexao, minhasConexoes } from "@/lib/servidor/conexoes";
import { obterLocal } from "@/lib/local";
import { chaveBairro } from "@/lib/regioes";
import { contasPerto, nomeNaLista, oQueE, type ContaPerto } from "@/lib/servidor/contas-perto";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";

export const metadata: Metadata = { title: "Conexões", robots: { index: false } };

// A rede da conta, em quatro abas: Pessoas (perto de você, com o Conectar), Empresas (comércios,
// empresas e agências perto, com o Seguir), Seguindo (o que a conta segue e as buscas que avisam) e
// Conectadas (os pedidos para responder, as conexões com o contato e a conversa, os pedidos que fiz
// e os que não foram aceitos).

const ABAS = [
  { valor: "pessoas", nome: "Pessoas" },
  { valor: "empresas", nome: "Empresas" },
  { valor: "seguindo", nome: "Seguindo" },
  { valor: "conectadas", nome: "Conectadas" },
] as const;
type Aba = (typeof ABAS)[number]["valor"];

/** Os filtros de cada aba (um de cada vez, além da busca por nome ou bairro). */
const FILTROS: Record<Aba, readonly { valor: string; nome: string }[]> = {
  pessoas: [
    { valor: "bairro", nome: "No seu bairro" },
    { valor: "novas", nome: "Novas no Publike" },
  ],
  empresas: [
    { valor: "contratando", nome: "Contratando agora" },
    { valor: "comercio", nome: "Comércios" },
    { valor: "empresa", nome: "Empresas" },
    { valor: "agencia", nome: "Agências" },
  ],
  seguindo: [
    { valor: "empresas", nome: "Empresas" },
    { valor: "bairros", nome: "Bairros" },
    { valor: "buscas", nome: "Buscas" },
  ],
  conectadas: [
    { valor: "responder", nome: "Para responder" },
    { valor: "novas", nome: "Mensagem nova" },
    { valor: "conectadas", nome: "Suas conexões" },
    { valor: "enviados", nome: "Pedidos que você fez" },
    { valor: "naoaceitos", nome: "Não aceitos" },
    { valor: "pessoas", nome: "Pessoas" },
    { valor: "empresas", nome: "Empresas" },
  ],
};

/** O endereço da aba com o filtro e a busca. */
function endereco(aba: Aba, f: string | null, q: string) {
  const sp = new URLSearchParams({ aba });
  if (f) sp.set("f", f);
  if (q) sp.set("q", q);
  return `/painel/conexoes?${sp}`;
}

/** Para a busca: sem acento e em minúsculas ("Setor Bueno" acha "bueno"). */
const simples = (t: string | null | undefined) =>
  (t ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** A conta bate com a busca pelo nome, pelo bairro ou pela cidade. */
function bate(q: string, ...campos: (string | null | undefined)[]) {
  if (!q) return true;
  const termo = simples(q).trim();
  return campos.some((c) => simples(c).includes(termo));
}

/**
 * A busca (por nome ou bairro) e os filtros da aba, em chips com o número ao lado; tocar de novo no
 * chip escolhido tira o filtro. Só aparece o chip que separa alguma coisa (nem zero, nem todas),
 * além do escolhido. Sem JavaScript também funciona (a busca é um formulário e os chips, links).
 */
function BarraDeFiltros({
  aba,
  f,
  q,
  numeros,
  total,
}: {
  aba: Aba;
  f: string | null;
  q: string;
  numeros: Record<string, number>;
  total: number;
}) {
  const filtros = FILTROS[aba].filter(
    (x) => f === x.valor || ((numeros[x.valor] ?? 0) > 0 && (numeros[x.valor] ?? 0) < total),
  );
  const rotulo = aba === "seguindo" ? "Buscar no que você segue" : "Buscar por nome ou bairro";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <form action="/painel/conexoes" role="search" className="sm:w-72">
        <input type="hidden" name="aba" value={aba} />
        {f && <input type="hidden" name="f" value={f} />}
        <div className="flex h-11 items-center gap-2 rounded-pill border border-line bg-surface-200 pr-1.5 pl-4 focus-within:outline-2 focus-within:outline-focus">
          <Search aria-hidden className="size-[18px] shrink-0 text-terra-text" />
          <label htmlFor="busca-conexoes" className="sr-only">
            {rotulo}
          </label>
          <input
            id="busca-conexoes"
            type="search"
            name="q"
            defaultValue={q}
            maxLength={60}
            enterKeyHint="search"
            placeholder={rotulo}
            className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {q && (
            <Link
              href={endereco(aba, f, "")}
              scroll={false}
              aria-label="Limpar a busca"
              className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted hover:bg-surface-300 hover:text-ink"
            >
              <X aria-hidden className="size-4" />
            </Link>
          )}
        </div>
      </form>
      {filtros.length > 0 && (
        // relative: o texto do leitor de tela dos chips fica dentro da rolagem (sem alargar a página)
        <nav
          aria-label="Filtrar"
          className="sem-barra relative -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
        >
          {filtros.map((x) => (
            <ChipFiltro
              key={x.valor}
              href={endereco(aba, f === x.valor ? null : x.valor, q)}
              ativo={f === x.valor}
              nome={x.nome}
              numero={numeros[x.valor] ?? 0}
              destaque={x.valor === "responder"}
            />
          ))}
        </nav>
      )}
    </div>
  );
}

/** Nada com a busca ou o filtro: o que fazer. */
function NadaComFiltro({ aba, f, q }: { aba: Aba; f: string | null; q: string }) {
  return (
    <p className="rounded-lg border border-dashed border-line-strong px-4 py-5 text-body-sm text-ink-muted">
      {q && !f ? `Nada encontrado para “${q}”.` : "Nada com esse filtro."}{" "}
      <Link href={endereco(aba, null, "")} className="font-semibold text-ink underline underline-offset-2">
        {q && f ? "Limpar a busca e o filtro" : q ? "Limpar a busca" : "Tirar o filtro"}
      </Link>
    </p>
  );
}

// Uma aba das Mensagens (com as Conversas e os Matches).
export default function Conexoes({ searchParams }: PageProps<"/painel/conexoes">) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Suspense fallback={<AbasMensagensBase atual="conexoes" />}>
        <AbasMensagens atual="conexoes" />
      </Suspense>
      <Suspense fallback={<EsqueletoLista />}>
        <Conteudo searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Secao({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-h3">
        {titulo}
      </h3>
      <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card">
        {children}
      </ul>
    </section>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/conexoes">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const pedida = primeiro(sp.aba);
  const escolhida = ABAS.find((a) => a.valor === pedida)?.valor ?? null;
  await exigirUsuario(`/painel/conexoes${escolhida ? `?aba=${escolhida}` : ""}`);
  const [lista, perfil, agora, seguidos] = await Promise.all([
    minhasConexoes(),
    obterMeuPerfil().catch(() => null),
    agoraDaRequisicao(),
    meusSeguidos().catch(() => []),
  ]);
  const empresa = Boolean(perfil && perfil.tipo !== "pessoa");
  // os números das abas: quantas conexões e quantos pedidos esperam resposta; quanto a conta segue
  const conectadas = (lista ?? []).filter((c) => c.status === "aceita").length;
  const paraResponder = (lista ?? []).filter((c) => c.status === "pendente" && !c.pedi).length;
  // sem aba no endereço: com pedido para responder, vai para Conectadas (é onde ele está; com a aba no
  // endereço, responder o pedido não muda a aba); senão, Pessoas
  if (!escolhida && paraResponder > 0) redirect("/painel/conexoes?aba=conectadas");
  const aba: Aba = escolhida ?? "pessoas";
  const fPedido = primeiro(sp.f) ?? null;
  const f = FILTROS[aba].some((x) => x.valor === fPedido) ? fPedido : null;
  const q = (primeiro(sp.q) ?? "").trim().slice(0, 60);
  const numeros: Partial<Record<Aba, number>> = { seguindo: seguidos.length, conectadas };

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div>
        <h2 className="text-h2">Conexões</h2>
        <p className="mt-1 text-body text-ink-muted">
          Pessoas e empresas perto de você. Conecte-se para conversar, mesmo sem vaga aberta (quando o outro lado
          aceita, aparecem o WhatsApp e o e-mail dos dois), e siga as empresas para saber das vagas novas.
        </p>
      </div>
      <nav aria-label="Conexões" className="sem-barra -mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-5">
          {ABAS.map((a) => {
            const atual = a.valor === aba;
            const n = numeros[a.valor];
            const pedidos = a.valor === "conectadas" ? paraResponder : 0;
            return (
              <li key={a.valor} className="shrink-0">
                <Link
                  href={`/painel/conexoes?aba=${a.valor}`}
                  aria-current={atual ? "page" : undefined}
                  className={`-mb-px inline-flex min-h-11 items-center gap-1.5 border-b-[3px] text-label whitespace-nowrap ${
                    atual ? "border-ink text-ink" : "border-transparent text-ink-muted hover:text-ink"
                  }`}
                >
                  {a.nome}
                  {n ? <span className="text-body-sm text-ink-muted tabular-nums">{n}</span> : null}
                  {pedidos > 0 && (
                    <span className="min-w-5 rounded-pill bg-like px-1.5 text-center text-caption leading-5 text-on-like">
                      {pedidos}
                      <span className="sr-only">
                        {" "}
                        {pedidos === 1 ? "pedido para responder" : "pedidos para responder"}
                      </span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {aba === "pessoas" ? (
        <AbaPessoas empresa={empresa} f={f} q={q} />
      ) : aba === "empresas" ? (
        <AbaEmpresas seguidos={seguidos} f={f} q={q} />
      ) : aba === "seguindo" ? (
        <AbaSeguindo seguidos={seguidos} f={f} q={q} />
      ) : lista ? (
        <AbaConectadas lista={lista} empresa={empresa} agora={agora} f={f} q={q} />
      ) : (
        <Aviso tipo="alerta" titulo="Não deu para carregar as conexões agora">
          Tente de novo em instantes.
        </Aviso>
      )}
    </div>
  );
}

/** Uma linha de conta: a foto, o nome (pessoa: "Maria S.") com o selo, o que é e onde, e a ação à direita. */
function LinhaDeConta({
  c,
  detalhe,
  acao,
}: {
  c: {
    id: string;
    nome: string;
    tipo: string;
    foto: string | null;
    cidade: string;
    bairro: string | null;
    verificado: boolean;
  };
  detalhe: string;
  acao: ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 p-4">
      <Link href={`/perfil/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
        <Avatar
          nome={c.nome}
          foto={c.foto}
          tamanho={44}
          forma={c.tipo === "pessoa" ? "redonda" : "quadrada"}
          colorida
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1 text-label">
            <span className="truncate">{nomeNaLista(c)}</span>
            {c.verificado && <SeloVerificado agencia={c.tipo === "agencia"} />}
          </span>
          <span className="block truncate text-body-sm text-ink-muted">{detalhe}</span>
        </span>
      </Link>
      <div className="shrink-0">{acao}</div>
    </li>
  );
}

const LISTA =
  "flex flex-col divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card";

/** Pessoas perto, da mais perto para a mais longe, com o Conectar (ou como está a conexão). */
async function AbaPessoas({ empresa, f, q }: { empresa: boolean; f: string | null; q: string }) {
  const [{ contas: todas, agora }, local] = await Promise.all([
    contasPerto({ quem: "pessoas", quantos: 300 }),
    obterLocal(),
  ]);
  if (!todas.length) {
    return (
      <Vazio icone={UsersRound} titulo="Ninguém por perto ainda">
        Quando mais gente do seu bairro entrar no Publike, aparece aqui.
      </Vazio>
    );
  }
  const meuBairro = local?.bairro ? `${local.cidade}|${chaveBairro(local.bairro)}` : null;
  const noBairro = (c: ContaPerto) =>
    meuBairro !== null && c.bairro !== null && `${c.cidade}|${chaveBairro(c.bairro)}` === meuBairro;
  const nova = (c: ContaPerto) => agora - Date.parse(c.criado_em) < 30 * 24 * 3600 * 1000;
  const achadas = todas.filter((c) => bate(q, c.nome, c.bairro, c.cidade));
  const numeros: Record<string, number> = { novas: achadas.filter(nova).length };
  if (meuBairro) numeros.bairro = achadas.filter(noBairro).length;
  const contas = achadas.filter((c) => (f === "bairro" ? noBairro(c) : f === "novas" ? nova(c) : true)).slice(0, 40);
  const estados = await estadosDeConexao(contas.map((c) => c.id));
  return (
    <div className="flex flex-col gap-4">
      <BarraDeFiltros aba="pessoas" f={f} q={q} numeros={numeros} total={achadas.length} />
      {empresa && (
        <p className="text-body-sm text-ink-muted">
          Quem deixou o currículo para as empresas acharem está também em{" "}
          <Link href="/talentos" className="font-semibold text-ink underline underline-offset-2">
            Talentos
          </Link>
          , com o que faz e a experiência.
        </p>
      )}
      {contas.length === 0 ? (
        <NadaComFiltro aba="pessoas" f={f} q={q} />
      ) : (
        <ul aria-label="Pessoas perto de você" className={LISTA}>
          {contas.map((c) => (
            <LinhaDeConta
              key={c.id}
              c={c}
              detalhe={`${oQueE(c.tipo)} · ${formatarLugar(c.bairro, c.cidade)}`}
              acao={
                <BotaoConectarCompacto
                  outro={{ id: c.id, nome: c.nome, tipo: c.tipo }}
                  estado={estados.get(c.id) ?? null}
                  voltar="/painel/conexoes?aba=pessoas"
                  jeito="pilula"
                />
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/** Comércios, empresas e agências perto, com as vagas no ar e o Seguir (aviso de vaga nova). */
async function AbaEmpresas({
  seguidos,
  f,
  q,
}: {
  seguidos: Awaited<ReturnType<typeof meusSeguidos>>;
  f: string | null;
  q: string;
}) {
  const { contas: todas } = await contasPerto({ quem: "empresas", quantos: 300 });
  if (!todas.length) {
    return (
      <Vazio icone={Building2} titulo="Nenhuma empresa por perto ainda">
        Quando comércios e empresas do seu bairro entrarem no Publike, aparecem aqui.
      </Vazio>
    );
  }
  const achadas = todas.filter((c) => bate(q, c.nome, c.bairro, c.cidade));
  // quantas vagas cada uma tem no ar (as que contratam agora vêm com o número e no filtro), em
  // lotes de 100 contas para o endereço da consulta não ficar grande demais
  const supabase = await criarClienteServidor();
  const ids = achadas.map((c) => c.id);
  const lotes = Array.from({ length: Math.ceil(ids.length / 100) }, (_, i) => ids.slice(i * 100, i * 100 + 100));
  const respostas = await Promise.all(
    lotes.map((lote) =>
      supabase.from("anuncios").select("autor_id").eq("tipo", "vaga").eq("status", "ativo").in("autor_id", lote),
    ),
  );
  const noAr = new Map<string, number>();
  for (const { data } of respostas) for (const v of data ?? []) noAr.set(v.autor_id, (noAr.get(v.autor_id) ?? 0) + 1);
  const passa = (c: ContaPerto, filtro: string | null) =>
    filtro === "contratando" ? (noAr.get(c.id) ?? 0) > 0 : filtro ? c.tipo === filtro : true;
  const numeros: Record<string, number> = Object.fromEntries(
    FILTROS.empresas.map((x) => [x.valor, achadas.filter((c) => passa(c, x.valor)).length]),
  );
  const contas = achadas.filter((c) => passa(c, f)).slice(0, 40);
  return (
    <div className="flex flex-col gap-4">
      <BarraDeFiltros aba="empresas" f={f} q={q} numeros={numeros} total={achadas.length} />
      <p className="text-body-sm text-ink-muted">
        Quem você segue manda um aviso quando sai vaga nova (no máximo 5 por dia).
      </p>
      {contas.length === 0 ? (
        <NadaComFiltro aba="empresas" f={f} q={q} />
      ) : (
        <ul aria-label="Empresas perto de você" className={LISTA}>
          {contas.map((c) => {
            const n = noAr.get(c.id) ?? 0;
            return (
              <LinhaDeConta
                key={c.id}
                c={c}
                detalhe={`${n ? plural(n, "vaga no ar", "vagas no ar") : oQueE(c.tipo)} · ${formatarLugar(c.bairro, c.cidade)}`}
                acao={
                  <BotaoSeguir
                    alvo={{ perfil: c.id }}
                    seguidoId={seguidos.find((s) => s.alvo_perfil === c.id)?.id ?? null}
                    logado
                    voltar="/painel/conexoes?aba=empresas"
                    rotulo="Seguir"
                    rotuloSeguindo="Seguindo"
                  />
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** O que a conta segue (empresas e bairros) e as buscas que avisam, com a busca e os filtros. */
async function AbaSeguindo({
  seguidos,
  f,
  q,
}: {
  seguidos: Awaited<ReturnType<typeof meusSeguidos>>;
  f: string | null;
  q: string;
}) {
  const buscas = await minhasBuscasSalvas().catch(() => []);
  // sem nada seguido: a lista mostra o convite para seguir
  if (seguidos.length + buscas.length === 0) return <ListaSeguindo voltar="/painel/conexoes?aba=seguindo" />;
  const empresas = seguidos.filter((s) => s.alvo_perfil && bate(q, s.alvo_nome));
  const bairros = seguidos.filter((s) => !s.alvo_perfil && bate(q, s.bairro, s.cidade));
  const achadasBuscas = buscas.filter((b) => bate(q, b.rotulo, b.texto));
  const numeros = { empresas: empresas.length, bairros: bairros.length, buscas: achadasBuscas.length };
  const total = empresas.length + bairros.length + achadasBuscas.length;
  // o que sobra com o filtro (a ordem de antes: o que foi seguido por último primeiro)
  const lista =
    f === "buscas"
      ? []
      : seguidos.filter((s) => (f !== "bairros" && empresas.includes(s)) || (f !== "empresas" && bairros.includes(s)));
  const listaBuscas = f === "empresas" || f === "bairros" ? [] : achadasBuscas;
  return (
    <div className="flex flex-col gap-4">
      <BarraDeFiltros aba="seguindo" f={f} q={q} numeros={numeros} total={total} />
      {lista.length + listaBuscas.length === 0 ? (
        <NadaComFiltro aba="seguindo" f={f} q={q} />
      ) : (
        <ListaSeguindo voltar="/painel/conexoes?aba=seguindo" seguidos={lista} buscas={listaBuscas} />
      )}
    </div>
  );
}

/** As conexões: os pedidos para responder, as conexões (com a conversa), os pedidos feitos e os não aceitos. */
function AbaConectadas({
  lista: todas,
  empresa,
  agora,
  f,
  q,
}: {
  lista: Conexao[];
  empresa: boolean;
  agora: number;
  f: string | null;
  q: string;
}) {
  if (todas.length === 0) return empresa ? <VazioEmpresa /> : <VazioTalento />;
  const achadas = todas.filter((c) => bate(q, c.outro_nome, c.outro_bairro, c.outro_cidade));
  const passa: Record<string, (c: Conexao) => boolean> = {
    responder: (c) => c.status === "pendente" && !c.pedi,
    novas: (c) => c.status === "aceita" && c.nao_lidas > 0,
    conectadas: (c) => c.status === "aceita",
    enviados: (c) => c.status === "pendente" && c.pedi,
    naoaceitos: (c) => c.status === "recusada",
    pessoas: (c) => c.outro_tipo === "pessoa",
    empresas: (c) => c.outro_tipo !== "pessoa",
  };
  const numeros = Object.fromEntries(Object.entries(passa).map(([k, p]) => [k, achadas.filter(p).length]));
  // com um filtro, só o que passa nele (cada um na sua parte)
  const lista = f ? achadas.filter(passa[f]) : achadas;
  const recebidos = lista.filter(passa.responder);
  const conexoes = lista.filter(passa.conectadas);
  const enviados = lista.filter(passa.enviados);
  const naoAceitos = lista.filter(passa.naoaceitos);

  return (
    <div className="flex flex-col gap-6">
      <BarraDeFiltros aba="conectadas" f={f} q={q} numeros={numeros} total={achadas.length} />
      {lista.length === 0 && <NadaComFiltro aba="conectadas" f={f} q={q} />}

      {recebidos.length > 0 && (
        <Secao id="recebidos" titulo="Pedidos para você">
          {recebidos.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <QuemConexao c={c} />
                <span className="text-body-sm text-ink-muted">{tempoRelativo(c.criado_em, agora)}</span>
              </div>
              {c.mensagem && (
                <blockquote className="rounded-md bg-surface-300 px-3 py-2 text-body whitespace-pre-line">
                  {c.mensagem}
                </blockquote>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <ResponderConexao id={c.id} />
                <Link href={linkDoOutro(c)} className="text-body-sm underline underline-offset-2 hover:text-ink">
                  {c.outro_tipo === "pessoa" && c.outro_na_vitrine
                    ? "Ver o currículo"
                    : c.outro_tipo === "pessoa"
                      ? "Ver o perfil"
                      : "Ver a página"}
                </Link>
              </div>
            </li>
          ))}
        </Secao>
      )}

      {conexoes.length > 0 && (
        <Secao id="conectados" titulo={conexoes.length === 1 ? "Sua conexão" : "Suas conexões"}>
          {conexoes.map((c) => (
            <li key={c.id}>
              <Link href={caminhoConexao(c.outro_id)} className="flex gap-3 p-4 transition-colors hover:bg-surface-300">
                <div className="min-w-0 flex-1">
                  <QuemConexao c={c} link={false} />
                  <div className="mt-2 flex items-center gap-2">
                    <MessageCircle aria-hidden className="size-4 shrink-0 text-ink-muted" />
                    <p
                      className={`min-w-0 flex-1 truncate text-body-sm ${c.nao_lidas > 0 ? "font-semibold text-ink" : "text-ink-muted"}`}
                    >
                      {c.ultima_texto
                        ? `${c.ultima_minha ? "Você: " : ""}${c.ultima_texto}`
                        : "Conectados! Mande a primeira mensagem."}
                    </p>
                    {c.nao_lidas > 0 && (
                      <span className="inline-flex min-w-6 shrink-0 items-center justify-center rounded-pill bg-like px-1.5 text-caption text-on-like">
                        {c.nao_lidas}
                        <span className="sr-only"> {c.nao_lidas === 1 ? "mensagem nova" : "mensagens novas"}</span>
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </Secao>
      )}

      {enviados.length > 0 && (
        <Secao id="enviados" titulo="Pedidos que você fez">
          {enviados.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <QuemConexao c={c} />
              <div className="flex flex-col items-end gap-1">
                <span className="inline-flex items-center gap-1.5 text-body-sm text-ink-muted">
                  <Clock aria-hidden className="size-4" />
                  Esperando resposta · {tempoRelativo(c.criado_em, agora)}
                </span>
                <DesfazerConexao id={c.id} rotulo="Cancelar pedido" />
              </div>
            </li>
          ))}
        </Secao>
      )}

      {naoAceitos.length > 0 && <NaoAceitos lista={naoAceitos} />}
    </div>
  );
}

function NaoAceitos({ lista }: { lista: Conexao[] }) {
  return (
    <Secao id="nao-aceitos" titulo="Não aceitos">
      {lista.map((c) => {
        const de = pedirDeNovoEm(c.respondida_em);
        return (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <QuemConexao c={c} tamanho={40} />
            <span className="text-body-sm text-ink-muted">
              {de ? `Dá para pedir de novo a partir de ${formatarDataCurta(de)}` : "Não aceitou"}
            </span>
          </li>
        );
      })}
    </Secao>
  );
}

function VazioEmpresa() {
  return (
    <Vazio icone={Handshake} titulo="Nenhuma conexão ainda" acao={<BotaoLink href="/talentos">Ver talentos</BotaoLink>}>
      Na aba Talentos, toque em Conectar em quem combina com a sua empresa, ou no perfil de qualquer pessoa ou empresa.
      Não precisa ter vaga aberta: quando o outro lado aceita, vocês conversam por aqui.
    </Vazio>
  );
}

async function VazioTalento() {
  const naAba = await meuCurriculoNaVitrine().catch(() => false);
  return (
    <Vazio
      icone={UserPlus}
      titulo="Nenhuma conexão ainda"
      acao={
        naAba ? (
          <BotaoLink href="/?tipo=vaga">Ver empresas com vagas</BotaoLink>
        ) : (
          <BotaoLink href="/perfil/curriculo?para=talentos" variante="primario">
            Aparecer na aba Talentos
          </BotaoLink>
        )
      }
    >
      {naAba
        ? "Empresas e pessoas da região podem pedir conexão com você. Você também pode: no perfil de qualquer pessoa, empresa, comércio ou agência, toque em Conectar."
        : "Apareça na aba Talentos para as empresas da região acharem você, mesmo sem vaga aberta. Você também pode pedir conexão no perfil de qualquer pessoa, empresa, comércio ou agência."}
    </Vazio>
  );
}
