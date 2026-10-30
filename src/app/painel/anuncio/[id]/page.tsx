import { ArrowLeft, ChevronDown, Download, FileText, Heart, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RespostasDoCandidato } from "@/components/painel/respostas-candidato";
import { perguntasDoBanco, type Respostas } from "@/lib/vaga-extra";
import { QuadroIndicar } from "@/components/anuncio/indicar";
import { BotaoConversar } from "@/components/botao-conversar";
import { BotoesContato } from "@/components/contato";
import { linkDoMatch, mensagemComLink } from "@/lib/link-do-match";
import { CurriculoResumo } from "@/components/curriculo-resumo";
import { BotaoBloquear, DesfazerMatch } from "@/components/desfazer-match";
import { AcoesInteressado } from "@/components/painel/acoes";
import { EtapaDoCandidato } from "@/components/painel/etapa-candidato";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { CabecalhoDaVaga, OrdemPeloCopiloto, VistaDosCandidatos } from "@/components/painel/cabecalho-da-vaga";
import { LinhaDoCliente } from "@/components/painel/linha-do-cliente";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Avatar, Selo, Vazio } from "@/components/ui/basicos";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import {
  abaDaEtapa,
  ETAPAS_CANDIDATO,
  esperaCurriculo,
  esperaResposta,
  etapaQueVale,
  etapasDoTipo,
  motivoParaOutro,
  nomeMotivoDesfazer,
  STATUS_ANUNCIO,
  type EtapaCandidato,
} from "@/lib/constantes";
import {
  listarCurriculosDosInteressados,
  listarDesfeitosDoAnuncio,
  listarEtapasDosCandidatos,
  listarInteressados,
  listarMeusBloqueios,
  listarRespostasDosCandidatos,
  obterAnuncio,
} from "@/lib/dados";
import { formatarLugar, formatarMesAno, rotuloConta, tempoRelativo } from "@/lib/formato";
import { minhasContratacoesPublicas } from "@/lib/dados-social";
import { ordemDoCopiloto } from "@/lib/servidor/copiloto";
import { empresasDosTrabalhos } from "@/lib/servidor/empresas";
import { saudeDasVagas } from "@/lib/servidor/saude";
import { exigirUsuario } from "@/lib/sessao";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { CurriculoDoInteressado, StatusAnuncio } from "@/lib/tipos";
import { SeloVerificado } from "@/components/selo-verificado";

type AbaDaEtapa = ReturnType<typeof abaDaEtapa>;

/** As etapas da vaga, com os nomes de Candidatos. */
const ETAPAS_DA_VAGA: { valor: AbaDaEtapa; nome: string }[] = [
  { valor: "novos", nome: "Novos" },
  { valor: "analise", nome: "Em análise" },
  { valor: "entrevista", nome: "Entrevista" },
  { valor: "contratados", nome: "Contratados" },
  { valor: "nao_seguiu", nome: "Não seguiu" },
];

export default function Interessados({ params, searchParams }: PageProps<"/painel/anuncio/[id]">) {
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
  params: PageProps<"/painel/anuncio/[id]">["params"];
  searchParams: PageProps<"/painel/anuncio/[id]">["searchParams"];
}) {
  if (MODO_DEMO) return <SoComSupabase />;
  const { id } = await params;
  const sp = await searchParams;
  const pedida = sp.etapa;
  const filtro = typeof pedida === "string" && pedida in ETAPAS_CANDIDATO ? (pedida as EtapaCandidato) : null;
  const usuario = await exigirUsuario(`/painel/anuncio/${id}`);
  const anuncio = await obterAnuncio(id);
  if (!anuncio || anuncio.autor_id !== usuario.id) notFound();
  const servico = anuncio.tipo === "servico";
  const perguntas = servico ? [] : perguntasDoBanco(anuncio.perguntas);
  const [todos, curriculos, desfeitos, etapas, bloqueios, publicas, respostas] = await Promise.all([
    listarInteressados(id),
    servico ? Promise.resolve(new Map<string, CurriculoDoInteressado>()) : listarCurriculosDosInteressados(id),
    listarDesfeitosDoAnuncio(id),
    listarEtapasDosCandidatos(id),
    listarMeusBloqueios(),
    minhasContratacoesPublicas(),
    perguntas.length ? listarRespostasDosCandidatos([id]) : Promise.resolve(new Map<string, Respostas>()),
  ]);
  // Cada interessado tem uma etapa (só quem publicou anota; quem curtiu vê a etapa); dá
  // para filtrar por ela. Esperando resposta, etapa adiante de "Em análise" não vale.
  const etapaDe = (p: { perfil_id: string; status: string }): EtapaCandidato =>
    etapaQueVale(anuncio.tipo, p.status, etapas.get(p.perfil_id)?.etapa ?? "novo");
  const contagem = new Map<EtapaCandidato, number>();
  for (const p of todos) contagem.set(etapaDe(p), (contagem.get(etapaDe(p)) ?? 0) + 1);
  // vaga: as mesmas etapas de Candidatos e do quadro (Novos, Em análise, Entrevista, Contratados, Não seguiu;
  // claude/plano-painel-simples.md, parte 3); ?etapa=novo e =contratado (links antigos) valem também
  const ETAPA_ANTIGA: Record<string, AbaDaEtapa> = { novo: "novos", contratado: "contratados" };
  const abaDe = (p: { perfil_id: string; status: string }) => abaDaEtapa({ status: p.status, etapa: etapaDe(p) });
  const pedidaNaVaga =
    typeof pedida === "string" ? (ETAPAS_DA_VAGA.find((e) => e.valor === pedida)?.valor ?? ETAPA_ANTIGA[pedida]) : null;
  const filtroVaga = servico ? null : (pedidaNaVaga ?? null);
  const naEtapa = new Map<AbaDaEtapa, number>();
  for (const p of todos) naEtapa.set(abaDe(p), (naEtapa.get(abaDe(p)) ?? 0) + 1);
  const filtrados = servico
    ? filtro
      ? todos.filter((p) => etapaDe(p) === filtro)
      : todos
    : filtroVaga
      ? todos.filter((p) => abaDe(p) === filtroVaga)
      : todos;
  const agora = await agoraDaRequisicao();
  // "Ordenar pelo Copiloto" (a vaga já lida) e a saúde da vaga, para a etiqueta no alto
  const [posicoes, saude] = servico
    ? [null, null]
    : await Promise.all([
        ordemDoCopiloto(id),
        saudeDasVagas(
          [anuncio],
          todos.map((p) => ({ anuncio_id: id, status: p.status, aceita_em: p.aceita_em, curtido_em: p.curtido_em })),
          agora,
        ).then((m) => m.get(id) ?? null),
      ]);
  const peloCopiloto = Boolean(posicoes) && sp.ordem === "copiloto";
  const posicao = (p: { perfil_id: string }) => (peloCopiloto ? (posicoes?.get(p.perfil_id) ?? null) : null);
  const interessados = peloCopiloto
    ? [...filtrados].sort((a, b) => (posicao(a) ?? Infinity) - (posicao(b) ?? Infinity))
    : filtrados;
  const esperam = todos.filter(esperaResposta).length;
  const linkDaEtapa = (e: AbaDaEtapa | null, ordem = peloCopiloto) => {
    const q = new URLSearchParams();
    if (e) q.set("etapa", e);
    if (ordem) q.set("ordem", "copiloto");
    const t = q.toString();
    return `/painel/anuncio/${id}${t ? `?${t}` : ""}`;
  };
  const hoje = new Date(agora).toISOString().slice(0, 7);
  const status = anuncio.status as StatusAnuncio;
  // as empresas dos currículos com conta no Publike: o logo e o link
  const empresas = curriculos.size
    ? await empresasDosTrabalhos(
        await criarClienteServidor(),
        [...curriculos.values()].flatMap((c) => c.experiencias),
      )
    : {};

  return (
    <div className="flex flex-col gap-6">
      {servico ? (
        <div>
          <Link
            href="/painel/anuncios"
            className="inline-flex min-h-11 items-center gap-2 text-label text-ink-muted hover:text-ink"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Meus anúncios
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Selo variante={status === "ativo" ? "match" : "contorno"}>{STATUS_ANUNCIO[status]?.nome ?? status}</Selo>
          </div>
          <h2 className="mt-2 text-h2">{anuncio.titulo}</h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            <Link href={`/anuncio/${anuncio.id}`} className="underline">
              Ver anúncio
            </Link>{" "}
            ·{" "}
            <Link href="/painel/servicos" className="underline">
              Editar
            </Link>
          </p>
        </div>
      ) : (
        <>
          <CabecalhoDaVaga
            anuncio={anuncio}
            aba="candidatos"
            resumo={[
              `${todos.length} ${todos.length === 1 ? "candidato" : "candidatos"}`,
              esperam ? `${esperam} ${esperam === 1 ? "espera" : "esperam"} você` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            saude={saude}
            nota={
              anuncio.autor_tipo === "agencia" ? (
                <LinhaDoCliente anuncioId={anuncio.id} confidencial={anuncio.contratante_confidencial} />
              ) : null
            }
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <VistaDosCandidatos id={anuncio.id} atual="lista" />
            {posicoes && <OrdemPeloCopiloto ativo={peloCopiloto} href={linkDaEtapa(filtroVaga, !peloCopiloto)} />}
          </div>
        </>
      )}

      {(status === "em_analise" || status === "removido") && (
        <Aviso tipo="alerta" titulo="Este anúncio está com a moderação">
          Enquanto isso, não dá para {servico ? "aceitar pedidos" : "aceitar candidatos"} e os contatos ficam escondidos.
        </Aviso>
      )}

      {todos.length > 0 && (
        <div className="flex flex-col gap-3">
          {!servico ? (
            <nav aria-label="Etapas" className="sem-barra -mx-4 flex gap-2 overflow-x-auto px-4 py-0.5 sm:mx-0 sm:px-0">
              {[null, ...ETAPAS_DA_VAGA.map((e) => e.valor)].map((e) => {
                const ativo = filtroVaga === e;
                const total = e ? (naEtapa.get(e) ?? 0) : todos.length;
                return (
                  <Link
                    key={e ?? "todos"}
                    href={linkDaEtapa(e)}
                    aria-current={ativo ? "page" : undefined}
                    scroll={false}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label whitespace-nowrap transition-colors ${
                      ativo
                        ? "border-ink bg-ink text-surface-100"
                        : "border-line bg-surface-300 text-ink hover:border-line-strong"
                    } ${!ativo && e && !total ? "text-ink-muted" : ""}`}
                  >
                    {e ? ETAPAS_DA_VAGA.find((x) => x.valor === e)?.nome : "Todos"}
                    {total > 0 && <span className={ativo ? "text-surface-100/80" : "text-ink-muted"}>{total}</span>}
                  </Link>
                );
              })}
            </nav>
          ) : (
            <nav aria-label="Filtrar por etapa" className="flex flex-wrap gap-2">
              {[null, ...etapasDoTipo(anuncio.tipo)].map((e) => {
                const ativo = filtro === e;
                const total = e ? (contagem.get(e) ?? 0) : todos.length;
                return (
                  <Link
                    key={e ?? "todos"}
                    href={e ? `/painel/anuncio/${anuncio.id}?etapa=${e}` : `/painel/anuncio/${anuncio.id}`}
                    aria-current={ativo ? "page" : undefined}
                    scroll={false}
                    className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
                      ativo
                        ? "border-ink bg-ink text-surface-100"
                        : "border-line bg-surface-300 text-ink hover:border-line-strong"
                    }`}
                  >
                    {e ? ETAPAS_CANDIDATO[e].nome : "Todos"}
                    <span className={ativo ? "text-surface-100/80" : "text-ink-muted"}>{total}</span>
                  </Link>
                );
              })}
            </nav>
          )}
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-muted">
            <span>
              {servico ? "Quem pediu" : "Quem curtiu"} vê a etapa e recebe um aviso quando ela muda. A anotação é só
              sua.
            </span>
            {!servico && (
              <a
                href={`/painel/anuncio/${anuncio.id}/planilha`}
                className="inline-flex min-h-10 items-center gap-1.5 text-label text-ink underline underline-offset-2"
              >
                <Download aria-hidden className="size-4" />
                Baixar planilha
              </a>
            )}
          </p>
        </div>
      )}

      {todos.length > 0 && interessados.length === 0 ? (
        <p className="text-body text-ink-muted">Ninguém nesta etapa.</p>
      ) : interessados.length === 0 ? (
        <Vazio icone={Heart} titulo={servico ? "Ninguém pediu ainda" : "Ninguém curtiu ainda"}>
          {servico
            ? "Quando alguém quiser contratar você, chega um aviso e a pessoa aparece aqui. Fotos de trabalhos e preço ajudam a ser escolhido."
            : "Quando alguém curtir, você recebe um aviso e a pessoa aparece aqui. Compartilhar o anúncio no WhatsApp ajuda a chegar em mais gente."}
        </Vazio>
      ) : null}
      {status === "ativo" && interessados.length < 3 && todos.length === interessados.length && (
        <QuadroIndicar
          url={`${SITE_URL}/anuncio/${anuncio.id}`}
          titulo={anuncio.titulo}
          lugar={formatarLugar(anuncio.bairro, anuncio.cidade)}
          vaga={!servico}
          proprio
        />
      )}
      {interessados.length > 0 && (
        <>
          <p className="text-body text-ink-muted">
            {servico
              ? "Quem quer contratar você. Você decide se aceita: o aceite conecta vocês, e a conversa e o WhatsApp aparecem para os dois."
              : "Você decide quem aceitar. Aceitar conecta vocês: a conversa e o WhatsApp aparecem para os dois."}
          </p>
          <ul className="flex flex-col gap-4">
            {interessados.map((p) => {
              const primeiroNome = p.nome.split(" ")[0];
              const curriculo = curriculos.get(p.perfil_id);
              // vaga que pede currículo: o match espera a pessoa preencher
              const semCurriculo = !servico && anuncio.pede_curriculo && !curriculo ? primeiroNome : null;
              const desfeito = p.status === "desfeito" ? desfeitos.get(p.perfil_id) : undefined;
              return (
                <li
                  key={p.perfil_id}
                  // o aviso "currículo recebido" abre a lista já neste candidato
                  id={`candidato-${p.perfil_id}`}
                  className={`flex scroll-mt-24 flex-col gap-3 rounded-lg border bg-surface-200 p-4 shadow-card sm:p-5 ${
                    p.status === "match" ? "border-cerrado" : "border-line"
                  } ${p.status === "dispensada" || p.status === "desfeito" ? "opacity-70" : ""}`}
                >
                  <div className="flex gap-3">
                    <Avatar nome={p.nome} foto={p.foto} tamanho={56} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 font-display text-h3">
                        <Link href={`/perfil/${p.perfil_id}`} className="truncate underline-offset-2 hover:underline">
                          {p.nome}
                        </Link>
                        {p.verificado && <SeloVerificado agencia={p.tipo === "agencia"} />}
                      </p>
                      {posicao(p) != null && (
                        <p className="flex items-center gap-1 text-label text-terra-text">
                          <Sparkles aria-hidden className="size-4" />
                          {posicao(p)}º na triagem
                        </p>
                      )}
                      <p className="text-body-sm text-ink-muted">
                        {rotuloConta(p.tipo)} · {formatarLugar(p.bairro, p.cidade)} · no Publike desde{" "}
                        {formatarMesAno(p.membro_desde)}
                      </p>
                      <p className="text-body-sm text-ink-muted">
                        {servico ? "Pediu" : "Curtiu"} {tempoRelativo(p.curtido_em, agora)}
                      </p>
                    </div>
                    {p.status === "match" && <Selo variante="match">Deu match</Selo>}
                    {esperaCurriculo(p) && semCurriculo && <Selo>Esperando currículo</Selo>}
                    {p.status === "dispensada" && (
                      <Selo variante="contorno">{servico ? "Recusado" : "Dispensado"}</Selo>
                    )}
                    {p.status === "desfeito" && <Selo variante="contorno">Match desfeito</Selo>}
                  </div>
                  {p.mensagem && (
                    <blockquote className="rounded-md bg-surface-300 p-3 text-body-sm">“{p.mensagem}”</blockquote>
                  )}
                  <RespostasDoCandidato perguntas={perguntas} respostas={respostas.get(`${id}:${p.perfil_id}`)} />
                  {p.servicos.length > 0 && (
                    <div className="flex flex-wrap gap-1.5" aria-label="O que faz">
                      {p.servicos.map((s) => (
                        <Selo key={s} variante="contorno">
                          {s}
                        </Selo>
                      ))}
                    </div>
                  )}
                  {p.sobre && <p className="line-clamp-3 text-body-sm text-ink-muted">{p.sobre}</p>}
                  {!servico &&
                    (curriculo ? (
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
                          <CurriculoResumo
                            curriculo={curriculo}
                            linkPdf={curriculo.link_pdf}
                            hoje={hoje}
                            empresas={empresas}
                          />
                        </div>
                      </details>
                    ) : (
                      anuncio.pede_curriculo &&
                      p.status !== "pendente" && (
                        <p className="flex items-center gap-2 text-body-sm text-ink-muted">
                          <FileText aria-hidden className="size-4 shrink-0" />
                          {primeiroNome} ainda não preencheu o currículo.
                        </p>
                      )
                    ))}
                  {
                    <EtapaDoCandidato
                      tipo={anuncio.tipo}
                      status={p.status}
                      anuncioId={anuncio.id}
                      perfilId={p.perfil_id}
                      etapa={etapaDe(p)}
                      nota={etapas.get(p.perfil_id)?.nota ?? null}
                      publico={{
                        okEmpresa: publicas.get(`${anuncio.id}:${p.perfil_id}`)?.ok_empresa ?? false,
                        okPessoa: publicas.get(`${anuncio.id}:${p.perfil_id}`)?.ok_pessoa ?? false,
                        nome: p.nome,
                      }}
                    />
                  }
                  <div className="border-t border-line pt-3">
                    {p.status === "desfeito" ? (
                      <div className="flex flex-col gap-2">
                        <p className="text-body-sm text-ink-muted">
                          {desfeito?.porMim
                            ? `Você desfez o match. Motivo: ${nomeMotivoDesfazer(desfeito.motivo).toLowerCase()}.`
                            : `${primeiroNome} desfez o match. Motivo: ${motivoParaOutro(desfeito?.motivo)}.`}{" "}
                          {bloqueios.get(p.perfil_id)?.ele
                            ? `${primeiroNome} preferiu não negociar de novo.`
                            : "Se quiserem, dá para dar match de novo."}
                        </p>
                        {!bloqueios.get(p.perfil_id)?.ele && (
                          <AcoesInteressado
                            anuncioId={anuncio.id}
                            perfilId={p.perfil_id}
                            status="desfeito"
                            servico={servico}
                            semCurriculo={semCurriculo}
                          />
                        )}
                        <BotaoBloquear
                          outroId={p.perfil_id}
                          outroNome={p.nome}
                          bloqueado={Boolean(bloqueios.get(p.perfil_id)?.eu)}
                        />
                      </div>
                    ) : p.status === "match" ? (
                      <div className="flex flex-col gap-2">
                        <BotaoConversar outroId={p.perfil_id} />
                        <BotoesContato
                          whatsapp={p.whatsapp}
                          email={p.email}
                          // o link: o pedido ou a curtida aceita (para a pessoa) ou, no contato direto, o anúncio
                          mensagem={mensagemComLink(
                            servico
                              ? `Olá, ${primeiroNome}! Aceitei seu pedido para “${anuncio.titulo}” no Publike. Vamos combinar?`
                              : `Olá, ${primeiroNome}! Vi que você curtiu “${anuncio.titulo}” no Publike. Vamos conversar?`,
                            linkDoMatch({
                              anuncioId: anuncio.id,
                              perfilId: p.perfil_id,
                              para: "quem_curtiu",
                              direto: Boolean(anuncio.contato_direto),
                              servico,
                            }),
                          )}
                        />
                        <DesfazerMatch
                          anuncioId={anuncio.id}
                          perfilId={p.perfil_id}
                          outroNome={p.nome}
                          autorDaVaga={!servico}
                        />
                      </div>
                    ) : (
                      <AcoesInteressado
                        anuncioId={anuncio.id}
                        perfilId={p.perfil_id}
                        status={p.status}
                        servico={servico}
                        semCurriculo={semCurriculo}
                        aceita={esperaCurriculo(p)}
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
