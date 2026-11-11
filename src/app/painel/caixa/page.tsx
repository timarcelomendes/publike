import { Download, List, Users, Zap } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CabecalhoDaPagina } from "@/components/painel/cabecalho-da-pagina";
import { QuadroDeTodas } from "@/components/painel/candidatos/quadro-de-todas";
import {
  AgendaDasEntrevistas,
  CandidatosPeloPedido,
  cartoesDeTodas,
  chaveDaSemana,
  LegendaDasSiglas,
  lerSemana,
  MapaDosCandidatos,
  TrocaDeVisaoDosCandidatos,
} from "@/components/painel/candidatos/visoes";
import { EsqueletoLista } from "@/components/painel/esqueleto";
import { SeletorDeLinks } from "@/components/painel/seletor-de-links";
import { PreviaPaga } from "@/components/painel/vagas/visoes";
import { MesaDeCandidatos } from "@/components/painel/mesa-candidatos";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso, Vazio } from "@/components/ui/basicos";
import { BotaoLink, classesBotao } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { abaDaEtapa, esperaResposta } from "@/lib/constantes";
import { ajudaDaIADisponivel, obterAnuncio } from "@/lib/dados";
import { primeiro } from "@/lib/formato";
import { montarCaixa } from "@/lib/servidor/caixa";
import { acessoAsVisoes } from "@/lib/servidor/visoes";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import { UUID } from "@/lib/validacao";
import {
  COOKIE_VISAO_CANDIDATOS,
  lerVisaoDosCandidatos,
  VISOES_PAGAS_CANDIDATOS,
  type VisaoDosCandidatos,
} from "@/lib/visoes-dos-candidatos";

export const metadata: Metadata = { title: "Candidatos" };

// Candidatos, numa página só (claude/plano-painel-simples.md, parte 2): as etapas no alto (Novos, Em análise,
// Entrevista, Contratados, Não seguiu), a lista à esquerda e a ficha de quem está aberto à direita, com a
// decisão e os atalhos de teclado. Vaga, Ordem, Lista, Planilha e Triagem rápida em cima. No celular, a lista e a
// ficha viram duas telas. As mensagens novas ficam nas Mensagens; a antiga "Lista e planilha" e a página de
// Contratados (fora da agência) trazem para cá.

export default function CaixaDeEntrada({ searchParams }: PageProps<"/painel/caixa">) {
  return (
    <Suspense fallback={<EsqueletoLista />}>
      <Conteudo searchParams={searchParams} />
    </Suspense>
  );
}

async function Conteudo({ searchParams }: { searchParams: PageProps<"/painel/caixa">["searchParams"] }) {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel/caixa");
  const sp = await searchParams;
  // a antiga aba "Mensagens novas": as conversas ficam nas Mensagens
  if (primeiro(sp.aba) === "mensagens") redirect("/painel/conversas");
  const agora = await agoraDaRequisicao();
  const [itens, comIA, acesso] = await Promise.all([montarCaixa(agora), ajudaDaIADisponivel(), acessoAsVisoes()]);

  // o aviso da curtida de um serviço (a Caixa é só das vagas) abre o próprio anúncio
  const pedidoDoAviso = primeiro(sp.c);
  if (pedidoDoAviso && itens && !itens.some((c) => c.chave === pedidoDoAviso)) {
    const anuncioId = pedidoDoAviso.split(":")[0];
    const anuncio = UUID.test(anuncioId) ? await obterAnuncio(anuncioId) : null;
    if (anuncio && anuncio.tipo === "servico" && anuncio.autor_id === usuario.id)
      redirect(`/painel/anuncio/${anuncioId}`);
  }

  if (!itens) {
    return (
      <div className="flex flex-col gap-6">
        <CabecalhoDaPagina titulo="Candidatos" />
        <Aviso tipo="alerta" titulo="Não deu para carregar os candidatos agora">
          Tente de novo em instantes. Enquanto isso, cada vaga mostra quem curtiu em Vagas.
        </Aviso>
      </div>
    );
  }
  if (itens.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <CabecalhoDaPagina titulo="Candidatos" descricao="Quem curtir as suas vagas, de todas as vagas, numa tela só." />
        <Vazio
          icone={Users}
          titulo="Ninguém curtiu suas vagas ainda"
          acao={<BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>}
        >
          Quem curtir qualquer vaga sua chega aqui, numa caixa de entrada só: você aceita ou dispensa com um toque, marca
          a entrevista e conversa, tudo na ficha da pessoa.
        </Vazio>
      </div>
    );
  }

  const paraResponder = itens.filter(esperaResposta).length;
  const pedidaVaga = primeiro(sp.vaga);
  const vaga =
    pedidaVaga && UUID.test(pedidaVaga) && itens.some((c) => c.anuncio_id === pedidaVaga) ? pedidaVaga : null;
  const planilha = `/painel/candidatos/planilha${vaga ? `?vaga=${vaga}` : ""}`;
  // a lista de todos, com os detalhes de cada um (saiu do menu em 11/11/2026: fica aqui, ao lado da planilha)
  const lista = `/painel/candidatos${vaga ? `?vaga=${vaga}` : ""}`;

  // a visão (11/11/2026, claude/plano-visoes-dos-candidatos.md): a pedida (?visao=); um endereço da Mesa (a ficha
  // aberta, a etapa, a ordem) fica na Mesa; senão, a última escolhida (cookie). As pagas sem a migração: a Mesa.
  const daMesa = Object.keys(sp).some((k) => !["vaga", "visao", "semana"].includes(k));
  const pedidaVisao = lerVisaoDosCandidatos(
    primeiro(sp.visao) ?? (daMesa ? "mesa" : (await cookies()).get(COOKIE_VISAO_CANDIDATOS)?.value),
  );
  const visao: VisaoDosCandidatos =
    !acesso.disponivel && VISOES_PAGAS_CANDIDATOS.includes(pedidaVisao) ? "mesa" : pedidaVisao;
  const hrefDaVisao = (v: VisaoDosCandidatos, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ visao: v, ...(vaga ? { vaga } : {}), ...extra });
    return `/painel/caixa?${q}`;
  };

  // as vagas com candidato, para o filtro das outras visões (a Mesa tem o dela)
  const vagas = new Map<string, { id: string; titulo: string; total: number; cidade: string | null; bairro: string | null }>();
  for (const c of itens) {
    const v = vagas.get(c.anuncio_id) ?? {
      id: c.anuncio_id,
      titulo: c.anuncio_titulo,
      total: 0,
      cidade: c.vagaCidade,
      bairro: c.vagaBairro,
    };
    v.total++;
    vagas.set(c.anuncio_id, v);
  }
  const listaDeVagas = [...vagas.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
  const daVaga = vaga ? itens.filter((c) => c.anuncio_id === vaga) : itens;
  // o Mapa é de uma vaga só: a escolhida ou a que tem mais gente
  const vagaDoMapa =
    (vaga ? vagas.get(vaga) : null) ??
    [...vagas.values()].filter((v) => v.cidade).sort((a, b) => b.total - a.total)[0] ??
    null;
  const filtroDeVaga = (todas: boolean, atual: string | null) =>
    vagas.size > 1 ? (
      <SeletorDeLinks
        rotulo="Vaga"
        atual={`/painel/caixa?visao=${visao}${atual ? `&vaga=${atual}` : ""}`}
        opcoes={[
          ...(todas ? [{ nome: "Todas as vagas", href: `/painel/caixa?visao=${visao}` }] : []),
          ...listaDeVagas.map((v) => ({ nome: `${v.titulo} (${v.total})`, href: `/painel/caixa?visao=${visao}&vaga=${v.id}` })),
        ]}
      />
    ) : null;

  const DESCRICAO: Record<VisaoDosCandidatos, string> = {
    mesa: "Todos os candidatos, pelo que fazer agora. Abra a ficha, decida e siga para o próximo.",
    prioridade: "Quem pede você agora, de todas as vagas: responder, as entrevistas de hoje e amanhã, decidir e quem parou.",
    quadro: "Todas as vagas num quadro só. Arraste o cartão (ou use “Mover para”) para mudar a etapa.",
    mapa: "Onde moram os candidatos de cada vaga: quem mora perto falta menos e fica mais.",
    agenda: "As entrevistas da semana, de todas as vagas, com quem confirmou e quem pediu para remarcar.",
  };

  return (
    <div className="flex flex-col gap-6">
      {/* as ações da página na linha do título, à direita e menores (no celular, "Um por um" e os ícones): o caminho
          das etapas sobe e a lista aparece mais cedo */}
      <CabecalhoDaPagina
        titulo="Candidatos"
        descricao={DESCRICAO[visao]}
        esconderTextoNoCelular={Boolean(primeiro(sp.c))}
        acoes={
          <>
            {paraResponder > 0 && (
              <BotaoLink
                href={`/painel/caixa/triagem${vaga ? `?vaga=${vaga}` : ""}`}
                variante="primario"
                tamanho="sm"
                aria-label={`Decidir um por um (${paraResponder})`}
              >
                <Zap aria-hidden />
                <span aria-hidden>
                  <span className="sm:hidden">Um por um</span>
                  <span className="hidden sm:inline">Decidir um por um</span> ({paraResponder})
                </span>
              </BotaoLink>
            )}
            <Link
              href={lista}
              aria-label="Ver todos em lista"
              title="Todos os candidatos numa lista, com os detalhes de cada um"
              className={classesBotao("secundario", "sm", "min-w-10 px-2.5 sm:px-3.5")}
            >
              <List aria-hidden />
              <span aria-hidden className="hidden sm:inline">
                Lista
              </span>
            </Link>
            <a
              href={planilha}
              aria-label="Baixar planilha"
              title="Baixar planilha"
              className={classesBotao("secundario", "sm", "min-w-10 px-2.5 sm:px-3.5")}
            >
              <Download aria-hidden />
              <span aria-hidden className="hidden sm:inline">
                Planilha
              </span>
            </a>
          </>
        }
      >
        <div className={primeiro(sp.c) ? "max-lg:hidden" : ""}>
          <TrocaDeVisaoDosCandidatos
            visao={visao}
            href={(v) => hrefDaVisao(v)}
            pagas={!acesso.disponivel ? null : acesso.liberado ? "livres" : "trancadas"}
          />
        </div>
      </CabecalhoDaPagina>

      {visao === "mesa" ? (
        <MesaDeCandidatos itens={itens} sp={sp} agora={agora} comIA={comIA} base="/painel/caixa" euId={usuario.id} />
      ) : visao === "prioridade" ? (
        <>
          {filtroDeVaga(true, vaga)}
          <CandidatosPeloPedido itens={daVaga} agora={agora} comIA={comIA} vaga={vaga} />
        </>
      ) : visao === "quadro" ? (
        <PreviaPaga
          nome="Quadro"
          titulo="Quadro de todas as vagas, com os seus candidatos"
          texto="As quatro etapas em colunas, com os candidatos de todas as vagas juntos: arraste para mudar a etapa sem abrir vaga por vaga. O quadro de cada vaga continua grátis."
          acesso={acesso}
        >
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              {filtroDeVaga(true, vaga)}
              {!vaga && <LegendaDasSiglas itens={itens} />}
            </div>
            <QuadroDeTodas cartoes={cartoesDeTodas(daVaga, agora)} fichaBase="/painel/caixa?c=" />
          </div>
        </PreviaPaga>
      ) : visao === "mapa" ? (
        <PreviaPaga
          nome="Mapa"
          titulo="Mapa de onde moram os seus candidatos"
          texto="Os candidatos de cada vaga por região, com a distância até a vaga: quem mora perto falta menos e fica mais. Nunca a casa da pessoa."
          acesso={acesso}
        >
          {vagaDoMapa?.cidade ? (
            <div className="flex flex-col gap-3">
              {filtroDeVaga(false, vagaDoMapa.id)}
              <MapaDosCandidatos
                itens={itens.filter((c) => c.anuncio_id === vagaDoMapa.id && abaDaEtapa(c) !== "nao_seguiu")}
                vaga={{ titulo: vagaDoMapa.titulo, cidade: vagaDoMapa.cidade, bairro: vagaDoMapa.bairro }}
                agora={agora}
              />
            </div>
          ) : (
            <p className="text-body text-ink-muted">Nenhuma vaga com candidato tem o lugar de trabalho para medir.</p>
          )}
        </PreviaPaga>
      ) : (
        <PreviaPaga
          nome="Agenda"
          artigo="a"
          titulo="Agenda das entrevistas, de todas as vagas"
          texto="A semana inteira num lugar só: quem confirmou, quem ainda não, quem pediu para remarcar e as que já foram e pedem a sua decisão."
          acesso={acesso}
        >
          <div className="flex flex-col gap-3">
            {filtroDeVaga(true, vaga)}
            <AgendaDasEntrevistas
              itens={daVaga}
              agora={agora}
              semana={lerSemana(primeiro(sp.semana), agora)}
              href={(s) => hrefDaVisao("agenda", { semana: chaveDaSemana(s) })}
            />
          </div>
        </PreviaPaga>
      )}
    </div>
  );
}
