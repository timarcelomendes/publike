import { Building2, Download, Heart, Megaphone, MessageCircleHeart, Plus, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { AcoesAnuncio } from "@/components/painel/acoes";
import { SeletorDeLinks } from "@/components/painel/seletor-de-links";
import { AbasLeves } from "@/components/painel/segmentos";
import { achaNaBusca, ControlesDasVagas, COOKIE_VISAO_VAGAS, type OrdemDasVagas } from "@/components/painel/vagas-em-linhas";
import {
  LinhaDoTempo,
  ListaDeVagas,
  MosaicoDeVagas,
  PreviaPaga,
  VagasPorPrioridade,
  type VagaNaTela,
} from "@/components/painel/vagas/visoes";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { LIMITES_CONTA, STATUS_ANUNCIO } from "@/lib/constantes";
import { listarMeusAnuncios, listarMeusCandidatos, obterMeuPerfil } from "@/lib/dados";
import { ateQuando, formatarLugar, primeiro, rotuloModalidade, semPrazo, tempoRelativo } from "@/lib/formato";
import { empresasDasVagas, listarMeusClientes, type EmpresaNaVaga } from "@/lib/servidor/clientes";
import { minhasVagasSoPeloChat } from "@/lib/servidor/contato-por";
import { entrevistasDasVagas } from "@/lib/servidor/quadro";
import { acessoAsVisoes } from "@/lib/servidor/visoes";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio, TipoAnuncio } from "@/lib/tipos";
import { lerVisao, ordemPedeVoce, resumirVaga, VISOES_PAGAS, type VisaoDasVagas } from "@/lib/visoes-das-vagas";

export const metadata: Metadata = { title: "Meus anúncios" };

const CINCO_DIAS = 5 * 24 * 3600 * 1000;

const TITULOS: Record<"todos" | TipoAnuncio, { titulo: string; texto: string }> = {
  todos: {
    titulo: "Meus anúncios",
    texto: "Tudo o que você publicou. Quem se interessar curte; toque no número para ver quem foi e responder.",
  },
  vaga: {
    titulo: "Vagas",
    texto: "Quem curtir a vaga aparece nela. Toque na vaga para ver os candidatos, responder e editar.",
  },
  servico: {
    titulo: "Seus serviços na vitrine",
    texto: "Quem precisa pede o serviço. Toque em “pedidos” para ver quem foi e responder.",
  },
};

// Filtro pela situação: o que está no ar, o que está pausado e o que já saiu do ar.
const SITUACOES = {
  no_ar: { nome: "No ar", status: ["ativo"] },
  pausados: { nome: "Pausadas", status: ["pausado"] },
  fora: { nome: "Fora do ar", status: ["expirado", "encerrado", "em_analise", "removido"] },
} as const;
type Situacao = keyof typeof SITUACOES;

export default function MeusAnuncios({ searchParams }: PageProps<"/painel/anuncios">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/anuncios">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const sp = await searchParams;
  const usuario = await exigirUsuario("/painel/anuncios");
  const [anuncios, perfil, candidatos, extras, daAgencia, soPeloChat] = await Promise.all([
    listarMeusAnuncios(),
    obterMeuPerfil(),
    listarMeusCandidatos(),
    // o prazo escolhido e a marcação de preenchida de cada vaga
    criarClienteServidor().then((c) =>
      c
        .from("anuncios")
        .select("id, prazo_dias, preenchida_em, vagas, atualizado_em")
        .eq("autor_id", usuario.id)
        .eq("tipo", "vaga"),
    ),
    // agência: os clientes e para quem é cada vaga
    obterMeuPerfil().then((p) =>
      p?.tipo === "agencia" ? Promise.all([listarMeusClientes(), empresasDasVagas(usuario.id)]) : null,
    ),
    // as vagas em que a conversa é só pelo chat do Publike (a etiqueta)
    minhasVagasSoPeloChat(usuario.id),
  ]);
  const [clientes, empresas] = daAgencia ?? [null, null];
  const nomeDoCliente = new Map((clientes ?? []).map((c) => [c.id, c.nome]));
  const pedidoCliente = primeiro(sp.cliente);
  const cliente = pedidoCliente && nomeDoCliente.has(pedidoCliente) ? pedidoCliente : null;
  const extraDe = new Map((extras.data ?? []).map((e) => [e.id, e]));
  const agora = await agoraDaRequisicao();
  const suspensa = Boolean(perfil?.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > agora);
  // o banco conta no limite o que está no ar, pausado ou em análise
  const noAr = anuncios.filter((a) => ["ativo", "pausado", "em_analise"].includes(a.status)).length;

  const pedido = primeiro(sp.tipo);
  const tipo: TipoAnuncio | null = pedido === "vaga" || pedido === "servico" ? pedido : null;
  const vagas = anuncios.filter((a) => a.tipo === "vaga").length;
  const servicos = anuncios.length - vagas;
  const doTipo = (tipo ? anuncios.filter((a) => a.tipo === tipo) : anuncios).filter(
    (a) => !cliente || empresas?.get(a.id)?.cliente === cliente,
  );
  // agência: os clientes com vaga, para o filtro
  const vagasPorCliente = new Map<string, number>();
  for (const e of empresas?.values() ?? []) {
    if (e.cliente && nomeDoCliente.has(e.cliente))
      vagasPorCliente.set(e.cliente, (vagasPorCliente.get(e.cliente) ?? 0) + 1);
  }
  const clientesComVagas = [...vagasPorCliente.entries()]
    .map(([id, total]) => ({ id, nome: nomeDoCliente.get(id) ?? "", total }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const pedidaSituacao = primeiro(sp.situacao);
  const situacao = pedidaSituacao && pedidaSituacao in SITUACOES ? (pedidaSituacao as Situacao) : null;
  const naSituacao = (a: (typeof anuncios)[number], s: Situacao) =>
    (SITUACOES[s].status as readonly string[]).includes(a.status);
  // a busca pelo nome, a ordem e o jeito de ver (claude/plano-fluxo-contratar.md, parte 2); a visão fica guardada
  const q = (primeiro(sp.q) ?? "").slice(0, 80);
  const ordem: OrdemDasVagas = primeiro(sp.ordem) === "esperando" ? "esperando" : "recentes";
  // a visão (11/11/2026, claude/plano-visoes-das-vagas.md): a Lista e "Pelo que pede você" grátis; o Mosaico e a
  // Linha do tempo nos planos, com 15 dias grátis (sem plano, a prévia com as vagas da conta). Cartões e Linhas,
  // as de antes, viram a Lista
  const [entrevistas, acesso] = await Promise.all([
    entrevistasDasVagas(anuncios.filter((a) => a.tipo === "vaga").map((a) => a.id)),
    acessoAsVisoes(),
  ]);
  const pedidaVisao = lerVisao(primeiro(sp.visao) ?? (await cookies()).get(COOKIE_VISAO_VAGAS)?.value);
  const visao: VisaoDasVagas = !acesso.disponivel && VISOES_PAGAS.includes(pedidaVisao) ? "lista" : pedidaVisao;
  const listaDeEntrevistas = [...entrevistas.values()];
  const resumoDe = new Map(
    candidatos
      ? anuncios
          .filter((a) => a.tipo === "vaga")
          .map((a) => {
            const e = extraDe.get(a.id);
            return [
              a.id,
              resumirVaga(
                {
                  id: a.id,
                  titulo: a.titulo,
                  status: a.status,
                  criado_em: a.criado_em,
                  expira_em: a.expira_em,
                  atualizado_em: e?.atualizado_em ?? null,
                  preenchida_em: e?.preenchida_em ?? null,
                  prazo_dias: e ? e.prazo_dias : 30,
                  vagas: e?.vagas ?? 1,
                },
                candidatos,
                listaDeEntrevistas,
                agora,
              ),
            ] as const;
          })
      : [],
  );
  const lista = (situacao ? doTipo.filter((a) => naSituacao(a, situacao)) : doTipo).filter((a) =>
    achaNaBusca(a.titulo, q),
  );
  if (ordem === "esperando") {
    lista.sort((a, b) => {
      const ra = resumoDe.get(a.id);
      const rb = resumoDe.get(b.id);
      return ra && rb ? ordemPedeVoce(ra, rb) : 0;
    });
  }
  // as vagas nas visões; os serviços (e as vagas, sem a leitura dos candidatos) nos cartões de antes
  const vagasNaTela: VagaNaTela[] = lista.flatMap((a) => {
    const r = resumoDe.get(a.id);
    if (!r) return [];
    const e = extraDe.get(a.id);
    const empresa = empresas?.get(a.id);
    const doCliente = empresa?.cliente ? (nomeDoCliente.get(empresa.cliente) ?? null) : (empresa?.contratante ?? null);
    const venceLogo = r.venceEm !== null && r.venceEm <= 5;
    return [
      {
        ...r,
        meta: [
          doCliente,
          rotuloModalidade(a.tipo, a.regime),
          formatarLugar(a.bairro, a.cidade),
          (e?.vagas ?? 1) > 1 ? `${e?.vagas} vagas` : null,
          soPeloChat.has(a.id) ? "só pelo chat" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        podeRenovar: r.status === "expirado" || r.status === "encerrado" || venceLogo,
      },
    ];
  });
  const cartoes = lista.filter((a) => !resumoDe.has(a.id));
  // quem só publicou vagas (o comum em empresa, comércio e agência) vê "Minhas vagas", como na aba
  const { titulo, texto } = TITULOS[tipo ?? (servicos === 0 ? "vaga" : "todos")];
  // o link de cada chip troca só o seu filtro e mantém o outro
  const filtro = (mudar: {
    tipo?: TipoAnuncio | null;
    situacao?: Situacao | null;
    cliente?: string | null;
    ordem?: OrdemDasVagas;
    visao?: VisaoDasVagas;
    q?: string | null;
  }) => {
    const p = new URLSearchParams();
    const t = mudar.tipo !== undefined ? mudar.tipo : tipo;
    const s = mudar.situacao !== undefined ? mudar.situacao : situacao;
    const c = mudar.cliente !== undefined ? mudar.cliente : cliente;
    const o = mudar.ordem ?? ordem;
    const v = mudar.visao ?? visao;
    const busca = mudar.q !== undefined ? mudar.q : q;
    if (t) p.set("tipo", t);
    if (s) p.set("situacao", s);
    if (c) p.set("cliente", c);
    if (o !== "recentes") p.set("ordem", o);
    if (mudar.visao) p.set("visao", v);
    if (busca) p.set("q", busca);
    const texto = p.toString();
    return `/painel/anuncios${texto ? `?${texto}` : ""}`;
  };
  // empresa, comércio e agência põem as vagas no site; quem é pessoa só tem o link
  const contaPublica = perfil ? perfil.tipo !== "pessoa" : false;
  const vagasNoAr = anuncios.filter((a) => a.tipo === "vaga" && a.status === "ativo").length;
  const mostrarPagina = perfil && tipo !== "servico" && (contaPublica || vagas > 0);

  return (
    <div className="flex flex-col gap-6">
      {suspensa && (
        <Aviso tipo="alerta" titulo="Sua conta está suspensa">
          Seus anúncios estão fora do ar e não dá para publicar, curtir ou editar. Veja o motivo no e-mail que enviamos.
        </Aviso>
      )}
      {primeiro(sp.excluido) === "1" && <Aviso tipo="sucesso" titulo="Anúncio excluído." />}
      {/* "Publicar também para outros cargos": as vagas que saíram de uma vez (e as que não) */}
      {(() => {
        const n = Number(primeiro(sp.publicadas));
        if (!Number.isInteger(n) || n < 1 || n > 10) return null;
        const falharam = (primeiro(sp.falharam) ?? "").split("|").filter(Boolean).slice(0, 9);
        return (
          <Aviso
            tipo={falharam.length ? "alerta" : "sucesso"}
            titulo={`Pronto: ${n} ${n === 1 ? "vaga publicada" : "vagas publicadas"}.`}
          >
            {falharam.length
              ? `Não saíram: ${falharam.join(", ")}. Publique de novo pelo botão Publicar vaga, ou confira se passou do limite de vagas por dia.`
              : "Cada uma tem a descrição pelo nome do cargo. Confira e edite pelo Mais de cada vaga."}
          </Aviso>
        );
      })()}
      <CabecalhoDaPagina
        titulo={titulo}
        descricao={texto}
        acoes={
          tipo === "servico" ? (
            <BotaoLink href="/painel/servicos" tamanho="sm">
              <Store aria-hidden />
              Editar vitrine
            </BotaoLink>
          ) : (
            <span className="flex flex-wrap gap-2">
              {/* as vagas que estão na Gupy, todas de uma vez (claude/plano-candidatura-no-site-da-empresa.md) */}
              {contaPublica && (
                <BotaoLink href="/painel/anuncios/importar" tamanho="sm" variante="fantasma">
                  <Download aria-hidden />
                  Importar da Gupy
                </BotaoLink>
              )}
              <BotaoLink href={cliente ? `/publicar?cliente=${cliente}` : "/publicar"} tamanho="sm">
                <Plus aria-hidden />
                Publicar vaga
              </BotaoLink>
            </span>
          )
        }
      >
        {anuncios.length > 0 && (
          <>
            {/* os filtros numa linha leve (01/11/2026): a situação em abas de texto (sem as vazias), o tipo (só para
                quem tem vagas e serviços); à direita, na agência, o cliente numa lista, a ordem e a visão em ícones */}
            {(doTipo.length > 1 ||
              situacao ||
              (vagas > 0 && servicos > 0) ||
              clientesComVagas.length > 1 ||
              cliente ||
              (tipo !== "servico" && vagas > 0 && Boolean(candidatos))) && (
              <ControlesDasVagas
                q={q}
                ordem={ordem}
                visao={visao}
                href={filtro}
                manter={{ tipo, situacao, cliente, ordem: ordem === "recentes" ? null : ordem, visao }}
                comBusca={tipo !== "servico" && (vagas >= 6 || Boolean(q))}
                comOrdem={tipo !== "servico" && vagas > 1 && visao !== "prioridade"}
                comVisao={tipo !== "servico" && vagas > 0 && Boolean(candidatos)}
                pagas={acesso.disponivel ? (acesso.liberado ? "livres" : "trancadas") : null}
                antes={
                  <>
                    {(doTipo.length > 1 || situacao) && (
                      <AbasLeves
                        rotulo="Filtrar pela situação"
                        opcoes={[
                          { nome: "Todas", numero: doTipo.length, href: filtro({ situacao: null }), ativo: !situacao },
                          ...(Object.keys(SITUACOES) as Situacao[]).map((s) => ({
                            nome: SITUACOES[s].nome,
                            numero: doTipo.filter((a) => naSituacao(a, s)).length,
                            href: filtro({ situacao: s }),
                            ativo: situacao === s,
                          })),
                        ]}
                      />
                    )}
                    {vagas > 0 && servicos > 0 && (
                      <AbasLeves
                        rotulo="Filtrar anúncios"
                        opcoes={[
                          { nome: "Vagas e serviços", href: filtro({ tipo: null }), ativo: !tipo },
                          { nome: "Vagas", numero: vagas, href: filtro({ tipo: "vaga" }), ativo: tipo === "vaga" },
                          {
                            nome: "Serviços",
                            numero: servicos,
                            href: filtro({ tipo: "servico" }),
                            ativo: tipo === "servico",
                          },
                        ]}
                      />
                    )}
                  </>
                }
                extra={
                  (clientesComVagas.length > 1 || cliente) &&
                  tipo !== "servico" && (
                    <SeletorDeLinks
                      rotulo="Filtrar pelo cliente"
                      atual={filtro({ cliente })}
                      opcoes={[
                        { nome: "Todos os clientes", href: filtro({ cliente: null }) },
                        ...clientesComVagas.map((c) => ({
                          nome: `${c.nome} (${c.total})`,
                          href: filtro({ cliente: c.id }),
                        })),
                      ]}
                    />
                  )
                }
              />
            )}
          </>
        )}
      </CabecalhoDaPagina>
      {anuncios.length === 0 ? (
        <Vazio
          icone={Megaphone}
          titulo="Você ainda não publicou nada"
          acao={<BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>}
        >
          Precisa de alguém para trabalhar? Publique a vaga de graça e veja quem curte. Se você oferece serviços, monte
          sua vitrine em “Meus serviços”.
        </Vazio>
      ) : (
        <>

          {lista.length === 0 && q ? (
            <p className="rounded-md bg-surface-300 px-4 py-3 text-body-sm text-ink">
              Nenhuma vaga com “{q}” no nome.{" "}
              <Link href={filtro({ q: null })} className="font-semibold underline underline-offset-2">
                Limpar a busca
              </Link>
            </p>
          ) : lista.length === 0 && cliente ? (
            <p className="rounded-md bg-surface-300 px-4 py-3 text-body-sm text-ink">
              {`Nenhuma vaga ${situacao ? `${situacao === "pausados" ? "pausada" : SITUACOES[situacao].nome.toLowerCase()} ` : ""}de ${nomeDoCliente.get(cliente)}.`}{" "}
              <Link href={`/publicar?cliente=${cliente}`} className="font-semibold underline underline-offset-2">
                Publicar vaga para este cliente
              </Link>
            </p>
          ) : lista.length === 0 && situacao ? (
            <p className="rounded-md bg-surface-300 px-4 py-3 text-body-sm text-ink">
              Nada {situacao === "no_ar" ? "no ar" : situacao === "pausados" ? "pausado" : "fora do ar"} aqui.{" "}
              <Link href={filtro({ situacao: null })} className="font-semibold underline underline-offset-2">
                Ver tudo
              </Link>
            </p>
          ) : lista.length === 0 ? (
            <Vazio
              icone={tipo === "servico" ? Store : Megaphone}
              titulo={tipo === "servico" ? "Nenhum serviço na vitrine ainda" : "Nenhuma vaga publicada ainda"}
              acao={
                tipo === "servico" ? (
                  <BotaoLink href="/painel/servicos">Montar minha vitrine</BotaoLink>
                ) : (
                  <BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>
                )
              }
            >
              {tipo === "servico"
                ? "Diga o que você faz e onde atende. Quem precisa vê seus serviços perto de casa e chama você."
                : "Publique a vaga de graça e veja quem curte. Você escolhe com quem conversar."}
            </Vazio>
          ) : (
            <>
              {vagasNaTela.length > 0 &&
                (visao === "prioridade" ? (
                  <VagasPorPrioridade vagas={vagasNaTela} />
                ) : visao === "mosaico" ? (
                  <PreviaPaga
                    nome="Mosaico"
                    texto="Um cartão por vaga com quantos chegaram por dia nos últimos 14 dias: dá para ver na hora qual vaga atrai e qual parou."
                    acesso={acesso}
                  >
                    <MosaicoDeVagas vagas={acesso.liberado ? vagasNaTela : vagasNaTela.slice(0, 3)} />
                  </PreviaPaga>
                ) : visao === "tempo" ? (
                  <PreviaPaga
                    nome="Linha do tempo"
                    artigo="a"
                    texto="Cada vaga numa barra, de quando entrou até quando sai do ar, com hoje marcado e as entrevistas no caminho: dá para planejar o que renovar."
                    acesso={acesso}
                  >
                    <LinhaDoTempo vagas={acesso.liberado ? vagasNaTela : vagasNaTela.slice(0, 4)} agora={agora} />
                  </PreviaPaga>
                ) : (
                  <ListaDeVagas vagas={vagasNaTela} />
                ))}
              {cartoes.length > 0 && (
            <ul aria-label={vagasNaTela.length ? "Serviços" : "Lista de anúncios"} className="flex flex-col gap-4">
              {cartoes.map((a) => {
                const status = a.status as StatusAnuncio;
                const venceLogo =
                  status === "ativo" && !semPrazo(a.expira_em) && new Date(a.expira_em).getTime() - agora < CINCO_DIAS;
                const extra = extraDe.get(a.id);
                const empresa = empresas?.get(a.id);
                const podeRenovar = status === "expirado" || status === "encerrado" || venceLogo;
                return (
                  <li
                    key={a.id}
                    className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5"
                  >
                    {(() => {
                      const cabecalho = (
                        <>
                          <div className="flex flex-wrap items-center gap-2">
                            <Selo
                              variante={
                                status === "ativo"
                                  ? "match"
                                  : status === "em_analise" || status === "removido"
                                    ? "perigo"
                                    : "contorno"
                              }
                            >
                              {STATUS_ANUNCIO[status]?.nome ?? status}
                            </Selo>
                            <Selo>{rotuloModalidade(a.tipo, a.regime)}</Selo>
                            {extra?.preenchida_em && <Selo variante="aviso">Vaga preenchida</Selo>}
                            {soPeloChat.has(a.id) && <Selo variante="contorno">Só pelo chat</Selo>}
                          </div>
                          <h3 className="text-h3">
                            {/* a vaga abre a página dela no painel (as abas); o serviço, o anúncio */}
                            <Link
                              href={a.tipo === "vaga" ? `/painel/anuncio/${a.id}/quadro` : `/anuncio/${a.id}`}
                              className="underline-offset-2 hover:underline"
                            >
                              {a.titulo}
                            </Link>
                          </h3>
                          {empresa && <EmpresaDaVagaNaLista empresa={empresa} nome={nomeDoCliente} />}
                          <p className="text-body-sm text-ink-muted">
                            {formatarLugar(a.bairro, a.cidade)} · publicado {tempoRelativo(a.criado_em, agora)} ·{" "}
                            {status === "ativo"
                              ? `no ar ${ateQuando(a.expira_em)}`
                              : (STATUS_ANUNCIO[status]?.ajuda ?? "")}
                            {a.tipo === "vaga" &&
                              ` · ${a.curtidas_total} ${a.curtidas_total === 1 ? "candidato" : "candidatos"}`}
                          </p>
                        </>
                      );
                      return (
                        <>
                          {cabecalho}
                          <div className="flex flex-wrap items-center gap-3">
                            <Link href={`/painel/anuncio/${a.id}`} className={classesBotao("secundario", "sm")}>
                              <Heart
                                aria-hidden
                                className="text-like"
                                fill={a.curtidas_total ? "currentColor" : "none"}
                              />
                              {a.curtidas_total}{" "}
                              {a.tipo === "servico"
                                ? a.curtidas_total === 1
                                  ? "pedido"
                                  : "pedidos"
                                : a.curtidas_total === 1
                                  ? "candidato"
                                  : "candidatos"}
                              {a.curtidas_novas > 0 && (
                                <Selo variante="like">
                                  {a.curtidas_novas} {a.curtidas_novas === 1 ? "nova" : "novas"}
                                </Selo>
                              )}
                            </Link>
                            {a.matches > 0 && (
                              <span className="inline-flex items-center gap-1.5 text-label text-cerrado-text">
                                <MessageCircleHeart aria-hidden className="size-[18px]" />
                                {a.matches} {a.matches === 1 ? "match" : "matches"}
                              </span>
                            )}
                          </div>
                          <div className="border-t border-line pt-3">
                            <AcoesAnuncio
                              id={a.id}
                              tipo={a.tipo}
                              status={status}
                              podeRenovar={podeRenovar}
                              prazoDias={extra ? extra.prazo_dias : 30}
                              preenchida={Boolean(extra?.preenchida_em)}
                            />
                          </div>
                        </>
                      );
                    })()}
                  </li>
                );
              })}
            </ul>
              )}
            </>
          )}
          {/* a página de vagas (o link, o kit e o quadro para o site) fica em Página de vagas */}
          {mostrarPagina && vagasNoAr > 0 && (
            <p className="flex flex-wrap items-center gap-x-1.5 text-body-sm text-ink-muted">
              <Megaphone aria-hidden className="size-4 shrink-0" />
              Um link com todas as suas vagas abertas está em
              <Link href="/painel/links" className="text-label text-ink underline underline-offset-2">
                Página de vagas
              </Link>
            </p>
          )}
        </>
      )}
      {perfil?.tipo === "agencia" &&
        (perfil.verificado ? (
          <Aviso tipo="info" titulo="Agência verificada">
            Você publica até {LIMITES_CONTA.agenciaVerificada.porDia} vagas por dia. No ar, são até{" "}
            {LIMITES_CONTA.comum.noAr} de graça; para mais, até {LIMITES_CONTA.comPlano.agencia}, com um{" "}
            <Link href="/painel/planos" className="font-semibold underline underline-offset-2">
              plano
            </Link>
            . Agora: {noAr} no ar.
          </Aviso>
        ) : (
          <Aviso tipo="info" titulo="Agência aguardando verificação">
            A equipe do Publike está conferindo o CNPJ. Até lá, são {LIMITES_CONTA.comum.porDia} vagas novas por dia;
            depois, {LIMITES_CONTA.agenciaVerificada.porDia}. No ar, até {LIMITES_CONTA.comum.noAr} de graça; para
            mais, com um plano. Agora: {noAr} no ar.
          </Aviso>
        ))}
    </div>
  );
}

/** Agência: para qual empresa é a vaga (o cliente abre a ficha dele). */
function EmpresaDaVagaNaLista({ empresa, nome }: { empresa: EmpresaNaVaga; nome: Map<string, string> }) {
  const cliente = empresa.cliente ? nome.get(empresa.cliente) : null;
  return (
    <p className="-mt-1 flex flex-wrap items-center gap-x-1.5 text-body-sm">
      <Building2 aria-hidden className="size-4 shrink-0 text-ink-muted" />
      {cliente ? (
        <Link href={`/painel/clientes/${empresa.cliente}`} className="underline underline-offset-2">
          {cliente}
        </Link>
      ) : (
        <span>{empresa.contratante ?? (empresa.confidencial ? "Empresa confidencial" : "Empresa não informada")}</span>
      )}
      {cliente && empresa.confidencial && <span className="text-ink-muted">(confidencial na vaga)</span>}
    </p>
  );
}
