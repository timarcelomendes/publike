import { Building2, ChevronRight, Eye, Heart, Megaphone, MessageCircleHeart, Plus, Store } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { AcoesAnuncio } from "@/components/painel/acoes";
import { FiltroCliente } from "@/components/painel/filtro-cliente";
import { PaginaDeVagas } from "@/components/painel/pagina-de-vagas";
import { Segmentos } from "@/components/painel/segmentos";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { esperaResposta, LIMITES_CONTA, STATUS_ANUNCIO } from "@/lib/constantes";
import { listarMeusAnuncios, listarMeusCandidatos, obterMeuPerfil } from "@/lib/dados";
import { ateQuando, formatarLugar, primeiro, rotuloModalidade, semPrazo, tempoRelativo } from "@/lib/formato";
import { empresasDasVagas, listarMeusClientes, type EmpresaNaVaga } from "@/lib/servidor/clientes";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { StatusAnuncio, TipoAnuncio } from "@/lib/tipos";

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

type Candidatos = NonNullable<Awaited<ReturnType<typeof listarMeusCandidatos>>>;

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
  const [anuncios, perfil, candidatos, extras, daAgencia] = await Promise.all([
    listarMeusAnuncios(),
    obterMeuPerfil(),
    listarMeusCandidatos(),
    // o prazo escolhido e a marcação de preenchida de cada vaga
    criarClienteServidor().then((c) =>
      c.from("anuncios").select("id, prazo_dias, preenchida_em").eq("autor_id", usuario.id).eq("tipo", "vaga"),
    ),
    // agência: os clientes e para quem é cada vaga
    obterMeuPerfil().then((p) =>
      p?.tipo === "agencia" ? Promise.all([listarMeusClientes(), empresasDasVagas(usuario.id)]) : null,
    ),
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
  const lista = situacao ? doTipo.filter((a) => naSituacao(a, situacao)) : doTipo;
  // quem só publicou vagas (o comum em empresa, comércio e agência) vê "Minhas vagas", como na aba
  const { titulo, texto } = TITULOS[tipo ?? (servicos === 0 ? "vaga" : "todos")];
  // o link de cada chip troca só o seu filtro e mantém o outro
  const filtro = (mudar: { tipo?: TipoAnuncio | null; situacao?: Situacao | null; cliente?: string | null }) => {
    const q = new URLSearchParams();
    const t = mudar.tipo !== undefined ? mudar.tipo : tipo;
    const s = mudar.situacao !== undefined ? mudar.situacao : situacao;
    const c = mudar.cliente !== undefined ? mudar.cliente : cliente;
    if (t) q.set("tipo", t);
    if (s) q.set("situacao", s);
    if (c) q.set("cliente", c);
    const texto = q.toString();
    return `/painel/anuncios${texto ? `?${texto}` : ""}`;
  };
  // empresa, comércio e agência põem as vagas no site; quem é pessoa só tem o link
  const contaPublica = perfil ? perfil.tipo !== "pessoa" : false;
  const vagasNoAr = anuncios.filter((a) => a.tipo === "vaga" && a.status === "ativo").length;
  const mostrarPagina = perfil && tipo !== "servico" && (contaPublica || vagas > 0);

  return (
    <div className="flex flex-col gap-4">
      {suspensa && (
        <Aviso tipo="alerta" titulo="Sua conta está suspensa">
          Seus anúncios estão fora do ar e não dá para publicar, curtir ou editar. Veja o motivo no e-mail que enviamos.
        </Aviso>
      )}
      {primeiro(sp.excluido) === "1" && <Aviso tipo="sucesso" titulo="Anúncio excluído." />}
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <h2 className="text-h2">{titulo}</h2>
              <p className="mt-1 text-body text-ink-muted">{texto}</p>
            </div>
            {tipo === "servico" ? (
              <BotaoLink href="/painel/servicos" tamanho="sm">
                <Store aria-hidden />
                Editar vitrine
              </BotaoLink>
            ) : (
              <BotaoLink href={cliente ? `/publicar?cliente=${cliente}` : "/publicar"} tamanho="sm">
                <Plus aria-hidden />
                Publicar vaga
              </BotaoLink>
            )}
          </div>
          {/* os filtros numa faixa só: a situação (uma escolha, sem ×), o tipo (só para quem tem
              vagas e serviços) e, na agência, o cliente (com o logo; muitos clientes: a lista) */}
          {(doTipo.length > 1 || situacao || (vagas > 0 && servicos > 0) || clientesComVagas.length > 1 || cliente) && (
            <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3">
              {(doTipo.length > 1 || situacao) && (
                <Segmentos
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
                <Segmentos
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
              {(clientesComVagas.length > 1 || cliente) &&
                tipo !== "servico" &&
                (clientesComVagas.length <= 6 ? (
                  <Segmentos
                    rotulo="Filtrar pelo cliente"
                    opcoes={[
                      { nome: "Todos os clientes", href: filtro({ cliente: null }), ativo: !cliente },
                      ...clientesComVagas.map((c) => ({
                        nome: c.nome,
                        numero: c.total,
                        href: filtro({ cliente: c.id }),
                        ativo: cliente === c.id,
                        avatar: { nome: c.nome },
                      })),
                    ]}
                  />
                ) : (
                  <FiltroCliente
                    clientes={clientesComVagas}
                    cliente={cliente}
                    caminho="/painel/anuncios"
                    manter={{ tipo, situacao }}
                  />
                ))}
            </div>
          )}
          {lista.length === 0 && cliente ? (
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
            <ul aria-label="Lista de anúncios" className="flex flex-col gap-4">
              {lista.map((a) => {
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
                      {status === "ativo" ? `no ar ${ateQuando(a.expira_em)}` : (STATUS_ANUNCIO[status]?.ajuda ?? "")}
                    </p>
                    {a.tipo === "vaga" && candidatos ? (
                      <div className="flex flex-col gap-2">
                        <FunilDaVaga
                          id={a.id}
                          candidatos={candidatos.filter((c) => c.anuncio_id === a.id)}
                          novas={a.curtidas_novas}
                        />
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <BotaoLink href={`/painel/anuncio/${a.id}/quadro`} tamanho="sm">
                            Abrir a vaga
                            <ChevronRight aria-hidden />
                          </BotaoLink>
                          <Link
                            href={`/anuncio/${a.id}`}
                            className="inline-flex min-h-10 items-center gap-1.5 text-body-sm text-ink-muted underline-offset-2 hover:text-ink hover:underline"
                          >
                            <Eye aria-hidden className="size-4" />
                            Ver como o candidato vê
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <Link href={`/painel/anuncio/${a.id}`} className={classesBotao("secundario", "sm")}>
                          <Heart aria-hidden className="text-like" fill={a.curtidas_total ? "currentColor" : "none"} />
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
                    )}
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
                  </li>
                );
              })}
            </ul>
          )}
          {/* primeiro as vagas; o link e o quadro para o site vêm depois */}
          {mostrarPagina && (
            <PaginaDeVagas
              perfilId={perfil.id}
              nome={perfil.nome}
              site={SITE_URL}
              noAr={vagasNoAr}
              comQuadro={contaPublica}
            />
          )}
        </>
      )}
      {perfil?.tipo === "agencia" &&
        (perfil.verificado ? (
          <Aviso tipo="info" titulo="Agência verificada">
            Você pode ter até {LIMITES_CONTA.agenciaVerificada.noAr} vagas no ar e publicar até{" "}
            {LIMITES_CONTA.agenciaVerificada.porDia} por dia. Agora: {noAr} no ar.
          </Aviso>
        ) : (
          <Aviso tipo="info" titulo="Agência aguardando verificação">
            A equipe do Publike está conferindo o CNPJ. Até lá, vale o limite de todas as contas:{" "}
            {LIMITES_CONTA.comum.noAr} vagas no ar e {LIMITES_CONTA.comum.porDia} por dia. Depois, até{" "}
            {LIMITES_CONTA.agenciaVerificada.noAr} no ar e {LIMITES_CONTA.agenciaVerificada.porDia} por dia. Agora:{" "}
            {noAr} no ar.
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

/**
 * A contratação de uma vaga, em números: candidatos → para responder → em análise →
 * entrevista → contratados. Todo número abre a vaga (o quadro, com as colunas por etapa).
 */
function FunilDaVaga({ id, candidatos, novas }: { id: string; candidatos: Candidatos; novas: number }) {
  const conta = (f: (c: Candidatos[number]) => boolean) => candidatos.filter(f).length;
  const vaga = `/painel/anuncio/${id}/quadro`;
  const passos = [
    { nome: "Candidatos", numero: candidatos.length, href: vaga },
    { nome: "Novos", numero: conta(esperaResposta), href: vaga, destaque: true },
    { nome: "Em análise", numero: conta((c) => c.etapa === "analise"), href: vaga },
    { nome: "Entrevista", numero: conta((c) => c.etapa === "entrevista"), href: vaga },
    { nome: "Contratados", numero: conta((c) => c.etapa === "contratado"), href: vaga, final: true },
  ];
  return (
    <ol aria-label="Contratação desta vaga" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {passos.map((p) => {
        const tem = p.numero > 0;
        const cor = !tem
          ? "text-ink-muted"
          : p.destaque
            ? "text-terra-text"
            : p.final
              ? "text-cerrado-text"
              : "text-ink";
        const caixa = `flex h-full min-h-16 flex-col justify-center rounded-md border px-3 py-2 ${
          tem && p.destaque ? "border-transparent bg-terra-soft" : "border-line bg-surface-100"
        }`;
        const miolo = (
          <>
            <span className={`flex items-center gap-1.5 font-display text-h3 leading-none ${cor}`}>
              {p.numero}
              {p.nome === "Candidatos" && novas > 0 && (
                <Selo variante="like">
                  {novas} {novas === 1 ? "nova" : "novas"}
                </Selo>
              )}
            </span>
            <span className={`mt-1 text-body-sm leading-tight ${tem ? "text-ink" : "text-ink-muted"}`}>{p.nome}</span>
          </>
        );
        return (
          <li key={p.nome}>
            {tem || p.nome === "Candidatos" ? (
              <Link href={p.href} className={`${caixa} transition-colors hover:border-line-strong`}>
                {miolo}
              </Link>
            ) : (
              <div className={caixa}>{miolo}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
