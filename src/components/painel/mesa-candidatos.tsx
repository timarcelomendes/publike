import { ArrowLeft, ChevronDown } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BotaoConectar } from "@/components/conexoes/botao-conectar";
import { FichaCandidato } from "@/components/painel/ficha-candidato";
import { FiltroVaga } from "@/components/painel/filtro-vaga";
import { ItemDaLista } from "@/components/painel/item-caixa";
import { OrdemDaCaixa } from "@/components/painel/ordem-caixa";
import { RegistrarVisitaPerfil } from "@/components/visitas/registrar-visita";
import { esperaResposta } from "@/lib/constantes";
import { primeiro } from "@/lib/formato";
import { anunciosComContatoDireto } from "@/lib/servidor/contato-direto";
import { estadosDeConexao } from "@/lib/servidor/conexoes";
import { empresasDosTrabalhos } from "@/lib/servidor/empresas";
import {
  ABA_ANTIGA,
  ABAS,
  abaDe,
  naAba,
  ORDENS,
  ordenar,
  type Aba,
  type ItemCaixa,
  type Ordem,
} from "@/lib/servidor/caixa";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { ExtrasDaFicha } from "@/components/painel/controles-ficha";
import { recursosPagos } from "@/lib/dados";
import { conversaCom } from "@/lib/servidor/conversas";
import { dailyConfigurado } from "@/lib/servidor/daily";
import { videosDaVaga } from "@/lib/servidor/entrevista-video";
import { propostasDaVaga } from "@/lib/servidor/proposta";
import { testesDaVaga } from "@/lib/servidor/testes";
import { UUID } from "@/lib/validacao";
import { DicaUmaVez } from "../ui/dica-uma-vez";

// A mesa de candidatos (claude/plano-fluxo-contratar.md, parte 1): a mesma tela no menu Candidatos (todas as vagas,
// com o filtro de vaga) e na aba Candidatos de cada vaga (já filtrada). A lista é uma rolagem só, com as etapas em
// seções que dizem o que fazer (Novos, Entrevista, Em análise; Contratados e Não seguiu fechados no fim), e a ficha
// de quem está aberto ao lado (no celular, a lista e a ficha viram duas telas). `?aba=` (ou `?etapa=`, da vaga)
// mostra só uma etapa, com o "Ver todas as etapas".

type Busca = Record<string, string | string[] | undefined>;

/** O que cada seção diz, embaixo do nome da etapa. */
const O_QUE_FAZER: Record<Aba, string> = {
  novos: "esperam a sua resposta",
  entrevista: "marque, confirme e decida",
  analise: "você está olhando",
  contratados: "fim do caminho",
  nao_seguiu: "dispensados e quem não seguiu",
};

/** A ordem das seções: o que pede uma ação primeiro; Contratados e Não seguiu começam fechados. */
const ORDEM_DAS_SECOES: Aba[] = ["novos", "entrevista", "analise", "contratados", "nao_seguiu"];
const FECHADAS: Aba[] = ["contratados", "nao_seguiu"];

/** Na Entrevista: o horário que já passou, o que vem, quem escolhe o horário e quem ainda não tem data. */
function grupoDaEntrevista(c: ItemCaixa, agora: number): "passou" | "marcada" | "sem_data" {
  if (!c.entrevista) return "sem_data";
  if (c.entrevista.situacao === "escolher") return "sem_data";
  return new Date(c.entrevista.quando).getTime() < agora ? "passou" : "marcada";
}
const GRUPOS_DA_ENTREVISTA = [
  { valor: "passou" as const, nome: "Já aconteceu: decida" },
  { valor: "marcada" as const, nome: "Marcadas" },
  { valor: "sem_data" as const, nome: "Escolhendo o horário ou sem data" },
];

export async function MesaDeCandidatos({
  itens,
  sp,
  agora,
  comIA,
  base,
  vagaFixa = null,
  acima,
  euId,
}: {
  /** quem age (a conta): para a conversa dentro da ficha */
  euId: string;
  itens: ItemCaixa[];
  sp: Busca;
  agora: number;
  comIA: boolean;
  /** a página da mesa: "/painel/caixa" ou "/painel/anuncio/<id>" */
  base: string;
  /** dentro da vaga: só os candidatos dela, sem o filtro de vaga */
  vagaFixa?: string | null;
  /** o que vai no alto, à direita do filtro (Triagem rápida, planilha) */
  acima?: ReactNode;
}) {
  // as vagas que têm candidato, para o filtro
  const vagas = new Map<string, { id: string; titulo: string; total: number }>();
  for (const c of itens) {
    const v = vagas.get(c.anuncio_id) ?? { id: c.anuncio_id, titulo: c.anuncio_titulo, total: 0 };
    v.total++;
    vagas.set(c.anuncio_id, v);
  }
  const pedidaVaga = primeiro(sp.vaga);
  const vaga = vagaFixa ?? (pedidaVaga && UUID.test(pedidaVaga) && vagas.has(pedidaVaga) ? pedidaVaga : null);
  const daVaga = vaga ? itens.filter((c) => c.anuncio_id === vaga) : itens;

  // ?aba= (Candidatos) ou ?etapa= (a vaga e os números do alto): uma etapa só
  const pedidaAba = primeiro(sp.aba) ?? primeiro(sp.etapa) ?? "";
  const ETAPA_ANTIGA: Record<string, Aba> = { ...ABA_ANTIGA, novo: "novos", contratado: "contratados" };
  const so: Aba | null = ABAS.some((a) => a.valor === pedidaAba)
    ? (pedidaAba as Aba)
    : (ETAPA_ANTIGA[pedidaAba] ?? null);
  const pedidaOrdem = primeiro(sp.ordem) ?? "";
  const ordem: Ordem = ORDENS.some((o) => o.valor === pedidaOrdem) ? (pedidaOrdem as Ordem) : "";
  const secoes = ORDEM_DAS_SECOES.filter((a) => !so || a === so).map((aba) => ({
    aba,
    lista: ordenar(aba, daVaga.filter(naAba[aba]), ordem),
  }));
  // a ordem de passar (anterior e próximo): a das seções abertas, de cima para baixo
  const emOrdem = secoes.flatMap((s) => s.lista);

  const pedido = primeiro(sp.c);
  const escolhido = Boolean(pedido && itens.some((c) => c.chave === pedido));
  const aberto: ItemCaixa | null = escolhido
    ? (itens.find((c) => c.chave === pedido) ?? null)
    : (emOrdem.find(esperaResposta) ?? emOrdem[0] ?? null);
  const posicao = aberto ? emOrdem.findIndex((c) => c.chave === aberto.chave) : -1;

  const href = (mudar: { aba?: Aba | null; c?: string | null }) => {
    const q = new URLSearchParams();
    const aba = mudar.aba !== undefined ? mudar.aba : so;
    if (aba) q.set(vagaFixa ? "etapa" : "aba", aba);
    if (vaga && !vagaFixa) q.set("vaga", vaga);
    if (ordem) q.set("ordem", ordem);
    if (mudar.c) q.set("c", mudar.c);
    const texto = q.toString();
    return texto ? `${base}?${texto}` : base;
  };
  const anterior = posicao > 0 ? href({ c: emOrdem[posicao - 1].chave }) : null;
  const proximo = posicao >= 0 && posicao < emOrdem.length - 1 ? href({ c: emOrdem[posicao + 1].chave }) : null;
  // depois de responder, abre o próximo que ainda espera (ou o anterior, se era o último)
  const seguinte = posicao >= 0 ? (emOrdem[posicao + 1] ?? emOrdem[posicao - 1] ?? null) : (emOrdem[0] ?? null);
  const depois = href({ c: seguinte && seguinte.chave !== aberto?.chave ? seguinte.chave : null });

  const [conexao, direto, empresas, extras] = aberto
    ? await Promise.all([
        estadosDeConexao([aberto.perfil_id]).then((m) => m.get(aberto.perfil_id) ?? null),
        anunciosComContatoDireto([aberto.anuncio_id]).then((s) => s.has(aberto.anuncio_id)),
        aberto.curriculo
          ? criarClienteServidor().then((s) => empresasDosTrabalhos(s, aberto.curriculo!.experiencias))
          : Promise.resolve({}),
        extrasDaFicha(aberto, itens, agora),
      ])
    : [null, false, {}, null];
  const listaDeVagas = [...vagas.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));

  return (
    <div className="flex flex-col gap-4">
      {(!vagaFixa && vagas.size > 1) || acima || so ? (
        // no celular, com alguém aberto, os filtros saem e a ficha sobe
        <div className={`flex flex-wrap items-center gap-2 ${escolhido ? "max-lg:hidden" : ""}`}>
          {!vagaFixa && vagas.size > 1 && (
            // poucas vagas: os botões à vista; muitas: a caixa de escolher
            <FiltroDeVaga
              vagas={listaDeVagas}
              vaga={vaga}
              total={itens.length}
              href={(v) => vagaHref(base, v, ordem)}
            />
          )}
          {so && (
            <Link
              href={href({ aba: null, c: aberto?.chave ?? null })}
              scroll={false}
              className="inline-flex min-h-10 items-center text-label text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              Ver todas as etapas
            </Link>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {emOrdem.length > 1 && <OrdemDaCaixa ordens={ORDENS} ordem={ordem} base={href({})} />}
            {acima}
          </div>
        </div>
      ) : null}

      {!escolhido && (
        <DicaUmaVez chave="publike_dica_mesa">
          toque no nome para abrir a ficha. Embaixo dela fica o próximo passo (Chamar para entrevista, Contratar,
          Dispensar), e tudo tem Desfazer. Quem espera a sua resposta vem primeiro.
        </DicaUmaVez>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)]">
        <div className={escolhido ? "hidden lg:block" : ""}>
          <div
            aria-label="Candidatos por etapa"
            role="region"
            className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface-200 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto"
          >
            {secoes.map(({ aba, lista }) => {
              const nome = ABAS.find((a) => a.valor === aba)?.nome ?? aba;
              const esperam = lista.filter(esperaResposta).length;
              // fechada: Contratados e Não seguiu, menos quando quem está aberto mora nela ou é a única pedida
              const aberta = !FECHADAS.includes(aba) || so === aba || (aberto ? abaDe(aberto) === aba : false);
              return (
                <details key={aba} open={aberta} className="group border-b border-line last:border-b-0">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 bg-surface-100 px-4 py-2 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-label">
                        {nome}
                        <span className="min-w-6 rounded-pill bg-surface-300 px-1.5 text-center text-caption leading-6 tabular-nums">
                          {lista.length}
                        </span>
                        {esperam > 0 && (
                          <span className="rounded-pill bg-terra-soft px-2 text-caption leading-6 font-semibold text-terra-text">
                            {esperam === 1 ? "1 espera você" : `${esperam} esperam você`}
                          </span>
                        )}
                      </span>
                      <span className="block text-body-sm text-ink-muted">{O_QUE_FAZER[aba]}</span>
                    </span>
                    <ChevronDown
                      aria-hidden
                      className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
                    />
                  </summary>
                  {lista.length === 0 ? (
                    <p className="px-4 py-3 text-body-sm text-ink-muted">{ABAS.find((a) => a.valor === aba)?.vazio}</p>
                  ) : aba === "entrevista" ? (
                    GRUPOS_DA_ENTREVISTA.map((g) => {
                      const doGrupo = lista.filter((c) => grupoDaEntrevista(c, agora) === g.valor);
                      if (!doGrupo.length) return null;
                      return (
                        <div key={g.valor}>
                          <p
                            className={`border-t border-line px-4 pt-2 pb-1 text-caption ${
                              g.valor === "passou" ? "text-terra-text" : "text-ink-muted"
                            }`}
                          >
                            {g.nome}
                          </p>
                          <ul className="flex flex-col divide-y divide-line">
                            {doGrupo.map((c) => (
                              <ItemDaLista
                                key={c.chave}
                                c={c}
                                agora={agora}
                                href={href({ c: c.chave })}
                                aberto={c === aberto}
                                comVaga={!vaga}
                              />
                            ))}
                          </ul>
                        </div>
                      );
                    })
                  ) : (
                    <ul className="flex flex-col divide-y divide-line border-t border-line">
                      {lista.map((c) => (
                        <ItemDaLista
                          key={c.chave}
                          c={c}
                          agora={agora}
                          href={href({ c: c.chave })}
                          aberto={c === aberto}
                          comVaga={!vaga}
                        />
                      ))}
                    </ul>
                  )}
                </details>
              );
            })}
          </div>
        </div>

        <div className={escolhido ? "flex flex-col gap-3" : "hidden lg:flex lg:flex-col lg:gap-3"}>
          {escolhido && (
            <Link
              href={href({ c: null })}
              scroll={false}
              className="inline-flex min-h-11 items-center gap-2 self-start text-label text-ink-muted hover:text-ink lg:hidden"
            >
              <ArrowLeft aria-hidden className="size-4" />
              Voltar à lista
            </Link>
          )}
          {aberto && (
            // a empresa abriu a candidatura: a pessoa fica sabendo (só quando a ficha aparece na tela)
            <RegistrarVisitaPerfil
              key={aberto.chave}
              perfilId={aberto.perfil_id}
              onde="candidatura"
              anuncioId={aberto.anuncio_id}
            />
          )}
          {aberto ? (
            <FichaCandidato
              c={aberto}
              empresas={empresas}
              direto={direto}
              agora={agora}
              anterior={anterior}
              proximo={proximo}
              depois={depois}
              comIA={comIA}
              base={base}
              extras={extras?.ficha ?? null}
              conversa={extras?.conversa ?? null}
              euId={euId}
              conectar={
                <BotaoConectar
                  key={aberto.perfil_id}
                  outroId={aberto.perfil_id}
                  outroNome={aberto.nome}
                  estado={conexao}
                  logado
                  voltar={href({ c: aberto.chave })}
                  para="talento"
                  jeito="cartao"
                />
              }
            />
          ) : (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-10 text-center text-body-sm text-ink-muted">
              Ninguém por aqui ainda. Quem se candidatar aparece na lista.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * O que a ficha de quem está aberto precisa além do item: a etapa, a entrevista, a vaga (quantas pessoas, quantos
 * contratados), a chamada pelo Publike, a entrevista gravada, os testes da vaga, a proposta e a conversa.
 */
async function extrasDaFicha(aberto: ItemCaixa, itens: ItemCaixa[], agora: number) {
  const [recursos, videos, testes, propostas, conversa] = await Promise.all([
    recursosPagos(),
    videosDaVaga(aberto.anuncio_id),
    testesDaVaga(aberto.anuncio_id),
    propostasDaVaga(aberto.anuncio_id),
    aberto.status === "match" ? conversaCom(aberto.perfil_id) : Promise.resolve(null),
  ]);
  const videoLiberado = Boolean(recursos?.video.liberado);
  const ficha: ExtrasDaFicha = {
    aba: abaDe(aberto),
    entrevista: aberto.entrevista,
    agora,
    vaga: {
      titulo: aberto.anuncio_titulo,
      noAr: aberto.vagaNoAr,
      preenchida: aberto.vagaPreenchida,
      quantas: aberto.vagaQuantas,
      contratados: itens.filter((c) => c.anuncio_id === aberto.anuncio_id && abaDe(c) === "contratados").length,
    },
    endereco: aberto.endereco,
    aoVivo: videoLiberado && dailyConfigurado(),
    video: { liberado: videoLiberado, atual: videos?.get(aberto.perfil_id) ?? null },
    testes: testes.map((t) => ({ id: t.modelo_id, titulo: t.titulo })),
    proposta: propostas?.get(aberto.perfil_id) ?? null,
  };
  return { ficha, conversa: conversa ? { conversaId: conversa.conversaId, mensagens: conversa.mensagens } : null };
}

function vagaHref(base: string, vaga: string | null, ordem: Ordem) {
  const q = new URLSearchParams();
  if (vaga) q.set("vaga", vaga);
  if (ordem) q.set("ordem", ordem);
  const texto = q.toString();
  return texto ? `${base}?${texto}` : base;
}

/** Até 6 vagas, os botões à vista; mais que isso, a caixa de escolher (agência e quem tem muitas vagas). */
function FiltroDeVaga({
  vagas,
  vaga,
  total,
  href,
}: {
  vagas: { id: string; titulo: string; total: number }[];
  vaga: string | null;
  total: number;
  href: (vaga: string | null) => string;
}) {
  if (vagas.length > 6) return <FiltroVaga compacto vagas={vagas} vaga={vaga} etapa={null} caminho="/painel/caixa" />;
  const chip = (ativo: boolean) =>
    `inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors ${
      ativo ? "border-ink bg-ink text-surface-100" : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
    }`;
  return (
    <nav aria-label="Vaga" className="flex flex-wrap gap-2">
      <Link href={href(null)} scroll={false} aria-current={!vaga ? "page" : undefined} className={chip(!vaga)}>
        Todas as vagas <span className={!vaga ? "text-surface-100/80" : "text-ink-muted"}>{total}</span>
      </Link>
      {vagas.map((v) => (
        <Link
          key={v.id}
          href={href(v.id)}
          scroll={false}
          aria-current={vaga === v.id ? "page" : undefined}
          className={chip(vaga === v.id)}
        >
          <span className="max-w-[14rem] truncate">{v.titulo}</span>
          <span className={vaga === v.id ? "text-surface-100/80" : "text-ink-muted"}>{v.total}</span>
        </Link>
      ))}
    </nav>
  );
}
