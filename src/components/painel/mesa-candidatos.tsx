import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { BotaoConectar } from "@/components/conexoes/botao-conectar";
import { FichaCandidato } from "@/components/painel/ficha-candidato";
import { ItemDaLista } from "@/components/painel/item-caixa";
import { OrdemDaCaixa } from "@/components/painel/ordem-caixa";
import { AbasLeves } from "@/components/painel/segmentos";
import { SeletorDeLinks } from "@/components/painel/seletor-de-links";
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
import { feitasDasRegras } from "@/lib/servidor/regras-tela";
import { DicaUmaVez } from "../ui/dica-uma-vez";

// A mesa de candidatos (claude/plano-fluxo-contratar.md, parte 1): a mesma tela no menu Candidatos (todas as vagas,
// com o filtro de vaga) e na aba Candidatos de cada vaga (já filtrada). As etapas ficam numa linha no alto, na ordem
// do caminho (Novos → Em análise → Entrevista → Contratados, e Não seguiu à parte), com quantos tem em cada uma; a
// etapa escolhida (`?aba=`, ou `?etapa=` na vaga) lista os candidatos embaixo, um por linha, e a ficha de quem está
// aberto fica ao lado (no celular, a lista e a ficha viram duas telas). Sem etapa pedida, abre na que pede ação.

type Busca = Record<string, string | string[] | undefined>;

/** O que cada seção diz, embaixo do nome da etapa. */
const O_QUE_FAZER: Record<Aba, string> = {
  novos: "esperam a sua resposta",
  entrevista: "marque, confirme e decida",
  analise: "você está olhando",
  contratados: "fim do caminho",
  nao_seguiu: "dispensados e quem não seguiu",
};

/** As etapas no alto, na ordem do caminho; Não seguiu fica à parte, no fim. */
const CAMINHO: Aba[] = ["novos", "analise", "entrevista", "contratados"];

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
  const porEtapa = Object.fromEntries(
    ABAS.map((a) => [a.valor, ordenar(a.valor, daVaga.filter(naAba[a.valor]), ordem)]),
  ) as Record<Aba, ItemCaixa[]>;
  const pedido = primeiro(sp.c);
  const escolhido = Boolean(pedido && itens.some((c) => c.chave === pedido));
  const daPessoa = escolhido ? (itens.find((c) => c.chave === pedido) ?? null) : null;
  // a etapa da lista: a pedida; senão a de quem foi aberto; senão a que pede ação (quem espera, a entrevista que
  // já passou), e por fim a primeira com alguém
  const passou = porEtapa.entrevista.some((c) => grupoDaEntrevista(c, agora) === "passou");
  const atual: Aba =
    so ??
    (daPessoa ? abaDe(daPessoa) : null) ??
    (porEtapa.novos.length
      ? "novos"
      : passou
        ? "entrevista"
        : ((["analise", "entrevista", "contratados", "nao_seguiu"] as Aba[]).find((a) => porEtapa[a].length) ??
          "novos"));
  // a ordem de passar (anterior e próximo): a da etapa aberta
  const emOrdem = porEtapa[atual];
  const aberto: ItemCaixa | null = escolhido
    ? (itens.find((c) => c.chave === pedido) ?? null)
    : (emOrdem.find(esperaResposta) ?? emOrdem[0] ?? null);
  const posicao = aberto ? emOrdem.findIndex((c) => c.chave === aberto.chave) : -1;

  const href = (mudar: { aba?: Aba | null; c?: string | null }) => {
    const q = new URLSearchParams();
    const aba = mudar.aba !== undefined ? mudar.aba : atual;
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
      {(!vagaFixa && vagas.size > 1) || acima || emOrdem.length > 1 ? (
        // no celular, com alguém aberto, os filtros saem e a ficha sobe
        <div className={`flex flex-wrap items-center gap-2 ${escolhido ? "max-lg:hidden" : ""}`}>
          {!vagaFixa && vagas.size > 1 && (
            // poucas vagas: abas de texto; muitas: a lista que abre
            <FiltroDeVaga
              vagas={listaDeVagas}
              vaga={vaga}
              total={itens.length}
              href={(v) => vagaHref(base, v, ordem)}
            />
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

      <EtapasNoAlto
        porEtapa={porEtapa}
        atual={atual}
        href={(aba) => href({ aba, c: null })}
        esconderNoCelular={escolhido}
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className={escolhido ? "hidden lg:block" : ""}>
          <div
            aria-label={`Candidatos em ${ABAS.find((a) => a.valor === atual)?.nome ?? atual}`}
            role="region"
            className="flex flex-col overflow-hidden rounded-lg border border-line bg-surface-200 lg:max-h-[calc(100dvh-13rem)] lg:overflow-y-auto"
          >
            {emOrdem.length === 0 ? (
              <p className="px-4 py-6 text-body-sm text-ink-muted">{ABAS.find((a) => a.valor === atual)?.vazio}</p>
            ) : atual === "entrevista" ? (
              GRUPOS_DA_ENTREVISTA.map((g) => {
                const doGrupo = emOrdem.filter((c) => grupoDaEntrevista(c, agora) === g.valor);
                if (!doGrupo.length) return null;
                return (
                  <div key={g.valor} className="border-b border-line last:border-b-0">
                    <p
                      className={`px-4 pt-2.5 pb-1 text-caption ${
                        g.valor === "passou" ? "font-semibold text-terra-text" : "text-ink-muted"
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
              <ul className="flex flex-col divide-y divide-line">
                {emOrdem.map((c) => (
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
  const [recursos, videos, testes, propostas, conversa, regras] = await Promise.all([
    recursosPagos(),
    videosDaVaga(aberto.anuncio_id),
    testesDaVaga(aberto.anuncio_id),
    propostasDaVaga(aberto.anuncio_id),
    aberto.status === "match" ? conversaCom(aberto.perfil_id) : Promise.resolve(null),
    feitasDasRegras(aberto.anuncio_id, aberto.perfil_id),
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
    regras,
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

/**
 * Até 4 vagas, abas de texto (o mesmo jeito leve dos filtros de Vagas); mais que isso, uma lista que abre (agência e
 * quem tem muitas vagas). A ordem escolhida vai junto.
 */
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
  if (vagas.length > 4)
    return (
      <SeletorDeLinks
        rotulo="Vaga"
        atual={href(vaga)}
        opcoes={[
          { nome: `Todas as vagas (${total})`, href: href(null) },
          ...vagas.map((v) => ({ nome: `${v.titulo} (${v.total})`, href: href(v.id) })),
        ]}
      />
    );
  return (
    <AbasLeves
      rotulo="Vaga"
      opcoes={[
        { nome: "Todas as vagas", numero: total, href: href(null), ativo: !vaga },
        ...vagas.map((v) => ({ nome: v.titulo, numero: v.total, href: href(v.id), ativo: vaga === v.id })),
      ]}
    />
  );
}

/**
 * As etapas numa linha no alto, na ordem do caminho, com quantos tem em cada uma (e quantos esperam você em Novos);
 * a escolhida fica marcada e lista os candidatos embaixo. Não seguiu fica à parte, depois de um traço. No celular, a
 * linha rola de lado dentro dela mesma.
 */
function EtapasNoAlto({
  porEtapa,
  atual,
  href,
  esconderNoCelular,
}: {
  porEtapa: Record<Aba, ItemCaixa[]>;
  atual: Aba;
  href: (aba: Aba) => string;
  esconderNoCelular: boolean;
}) {
  const item = (aba: Aba) => {
    const nome = ABAS.find((a) => a.valor === aba)?.nome ?? aba;
    const lista = porEtapa[aba];
    const esperam = lista.filter(esperaResposta).length;
    const ativa = aba === atual;
    return (
      <Link
        href={href(aba)}
        scroll={false}
        aria-current={ativa ? "page" : undefined}
        className={`flex min-h-16 min-w-[8.5rem] shrink-0 snap-start flex-col justify-center gap-0.5 rounded-md px-3.5 py-2 transition-colors lg:min-w-0 lg:flex-1 ${
          ativa ? "bg-ink text-surface-100" : "hover:bg-surface-300"
        }`}
      >
        <span className="flex items-baseline gap-2">
          <span className="font-display text-h3 tabular-nums">{lista.length}</span>
          <span className="text-label">{nome}</span>
        </span>
        <span className={`text-caption ${ativa ? "text-surface-100/80" : "text-ink-muted"}`}>
          {esperam > 0 ? (
            <span className={ativa ? "font-semibold" : "font-semibold text-terra-text"}>
              {esperam === 1 ? "1 espera você" : `${esperam} esperam você`}
            </span>
          ) : (
            O_QUE_FAZER[aba]
          )}
        </span>
      </Link>
    );
  };
  return (
    <nav aria-label="Etapas" className={esconderNoCelular ? "max-lg:hidden" : ""}>
      <div className="flex snap-x items-stretch gap-1 overflow-x-auto rounded-lg border border-line bg-surface-200 p-1.5 [scrollbar-width:thin]">
        {CAMINHO.map((aba, i) => (
          <div key={aba} className="flex shrink-0 items-center gap-1 lg:min-w-0 lg:flex-1">
            {i > 0 && <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-muted" />}
            {item(aba)}
          </div>
        ))}
        <span aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-line" />
        <div className="flex shrink-0 lg:min-w-0 lg:flex-1">{item("nao_seguiu")}</div>
      </div>
    </nav>
  );
}
