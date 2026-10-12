import {
  Briefcase,
  CalendarClock,
  CircleCheck,
  FileText,
  HandHelping,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  Plus,
  Search,
  Star,
  Store,
  UserRound,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { EditorProcuro } from "@/components/descobrir/extras";
import { EsqueletoVisaoGeral } from "@/components/painel/esqueleto";
import {
  Bloco,
  Lado,
  LinkDoBloco,
  ParaFazer,
  Sugestoes,
  Trilha,
  type ItemParaFazer,
  type Sugestao,
} from "@/components/painel/fluxo";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { etapaParaQuemCurtiu } from "@/lib/constantes";
import {
  contarMinhasSalvas,
  listarMeusAnuncios,
  listarMeusCandidatos,
  listarMinhasConversas,
  listarMinhasCurtidas,
  listarMinhasEtapas,
  obterMeuCurriculo,
  obterMeuPerfil,
  obterProcuro,
  perfilCompleto,
} from "@/lib/dados";
import { plural, tempoRelativo } from "@/lib/formato";
import { obterIntencao } from "@/lib/servidor/intencao";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { Curriculo, MeuAnuncio, MeuPerfil, MinhaCurtida } from "@/lib/tipos";

// Visão geral do painel: o que espera uma ação sua ("Para fazer agora") e os dois
// lados da conta, cada um com os seus fluxos em passos numerados:
//   O que você oferece: o seu trabalho, as vagas que publicou e os seus serviços.
//   O que você procura: as vagas que curtiu e os profissionais que chamou.
// Cada número leva à lista já filtrada. O lado que vem primeiro depende do que a
// pessoa disse que quer fazer no Publike (ou do tipo de conta). O banco não muda:
// tudo sai das leituras que as outras abas já usam.

const CINCO_DIAS = 5 * 24 * 3600 * 1000;

export default function VisaoGeral() {
  return (
    <Suspense fallback={<EsqueletoVisaoGeral />}>
      <Conteudo />
    </Suspense>
  );
}

/** Uma leitura que, se falhar, não derruba a visão geral (o número vira "–"). */
async function talvez<T>(leitura: Promise<T>, oQue: string): Promise<T | null> {
  try {
    return await leitura;
  } catch (e) {
    console.error(`Publike: visão geral sem ${oQue}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

const soma = (lista: number[]) => lista.reduce((total, n) => total + n, 0);

/** Quantos da lista passam no teste (null se a lista não carregou). */
function contar<T>(lista: T[] | null, teste: (x: T) => boolean) {
  return lista ? lista.filter(teste).length : null;
}

/** "Garçom", "Garçom e Cozinheira", "Garçom e mais 2" */
function nomes(lista: string[]) {
  const unicos = [...new Set(lista)];
  return unicos.length <= 2 ? unicos.join(" e ") : `${unicos[0]} e mais ${unicos.length - 1}`;
}

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel");
  const [perfil, intencao, anuncios, candidatos, curtidas, etapas, conversas, leituraCurriculo, procuro, salvas] =
    await Promise.all([
      obterMeuPerfil(),
      talvez(obterIntencao(), "a intenção"),
      talvez(listarMeusAnuncios(), "os anúncios"),
      listarMeusCandidatos(),
      talvez(listarMinhasCurtidas(), "as curtidas"),
      listarMinhasEtapas(),
      listarMinhasConversas(),
      // { c: null } = ainda não tem currículo; null = não deu para ler
      talvez(obterMeuCurriculo().then((c) => ({ c })), "o currículo"),
      obterProcuro(),
      contarMinhasSalvas(),
    ]);
  const agora = await agoraDaRequisicao();

  const pessoa = !perfil || perfil.tipo === "pessoa";
  const suspensa = Boolean(perfil?.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > agora);
  const noAr = (a: MeuAnuncio) => a.status === "ativo" && new Date(a.expira_em).getTime() > agora;

  // ------------------------------------------------------------ o que oferece
  const minhasVagas = anuncios?.filter((a) => a.tipo === "vaga") ?? null;
  const meusServicos = anuncios?.filter((a) => a.tipo === "servico") ?? null;
  const temVagas = (minhasVagas?.length ?? 0) > 0;
  const temServicos = (meusServicos?.length ?? 0) > 0;
  // candidatos de todas as vagas (os mesmos números da aba Candidatos)
  const candidatosPendentes = candidatos?.filter((c) => c.status === "pendente") ?? [];
  // pedidos dos serviços: cada serviço tem a sua lista de quem pediu
  const servicosComPedidoNovo = meusServicos?.filter((a) => a.curtidas_novas > 0) ?? [];
  const pedidosParaResponder = meusServicos ? soma(meusServicos.map((a) => a.curtidas_novas)) : null;
  const linkDosPedidos =
    meusServicos?.length === 1 ? `/painel/anuncio/${meusServicos[0].id}` : "/painel/anuncios?tipo=servico";
  const linkDosPedidosNovos =
    servicosComPedidoNovo.length === 1 ? `/painel/anuncio/${servicosComPedidoNovo[0].id}` : linkDosPedidos;

  // ------------------------------------------------------------ o que procura
  const vagasCurtidas = curtidas?.filter((c) => c.tipo === "vaga") ?? null;
  const servicosPedidos = curtidas?.filter((c) => c.tipo === "servico") ?? null;
  // a etapa que quem publicou marcou, com a mesma regra de "Minhas curtidas"
  const etapaDe = (c: MinhaCurtida) => etapaParaQuemCurtiu(c.tipo, c.status, etapas.get(c.anuncio_id)?.etapa);

  // ------------------------------------------------------------ contatos
  const novas = conversas ? soma(conversas.map((c) => c.nao_lidas)) : 0;
  const comNovas = conversas?.filter((c) => c.nao_lidas > 0) ?? [];
  const semOi = conversas?.filter((c) => !c.ultima_texto) ?? [];
  const linkDaConversa = (lista: { anuncio_id: string; outro_id: string }[]) =>
    lista.length === 1 ? `/painel/conversas/${lista[0].anuncio_id}/${lista[0].outro_id}` : "/painel/conversas";

  // ------------------------------------------------------------ para fazer agora
  const semCurriculo = leituraCurriculo !== null && leituraCurriculo.c === null;
  const procuraTrabalho = intencao === "trabalho" || (!intencao && pessoa) || (vagasCurtidas?.length ?? 0) > 0;
  const vencendo = anuncios?.filter((a) => noAr(a) && new Date(a.expira_em).getTime() - agora < CINCO_DIAS) ?? [];
  const fazer: ItemParaFazer[] = [];
  if (!perfilCompleto(perfil)) {
    fazer.push({
      icone: UserRound,
      texto: "Complete seu perfil",
      ajuda: "Com um WhatsApp ou e-mail você já pode publicar e curtir.",
      href: "/perfil",
    });
  }
  if (candidatosPendentes.length > 0) {
    fazer.push({
      icone: Users,
      texto: `${plural(candidatosPendentes.length, "candidato esperando", "candidatos esperando")} sua resposta`,
      ajuda: `Em ${nomes(candidatosPendentes.map((c) => c.anuncio_titulo))}`,
      href: "/painel/candidatos?situacao=responder",
    });
  }
  if (pedidosParaResponder) {
    fazer.push({
      icone: Wrench,
      texto: `${plural(pedidosParaResponder, "pedido de serviço esperando", "pedidos de serviço esperando")} sua resposta`,
      ajuda: `Em ${nomes(servicosComPedidoNovo.map((a) => a.titulo))}`,
      href: linkDosPedidosNovos,
    });
  }
  if (novas > 0) {
    fazer.push({
      icone: MessagesSquare,
      texto: plural(novas, "mensagem nova", "mensagens novas"),
      ajuda: `De ${nomes(comNovas.map((c) => c.outro_nome))}`,
      href: linkDaConversa(comNovas),
    });
  }
  if (pessoa && semCurriculo && procuraTrabalho) {
    fazer.push({
      icone: FileText,
      texto: "Monte seu currículo",
      ajuda: "Leva poucos minutos. Quem publicou a vaga vê quando você curte.",
      href: "/perfil/curriculo",
    });
  }
  if (vencendo.length > 0) {
    fazer.push({
      icone: CalendarClock,
      texto: `${plural(vencendo.length, "anúncio sai", "anúncios saem")} do ar em breve`,
      ajuda: "Renove para continuar recebendo interessados.",
      href: "/painel/anuncios",
    });
  }
  if (semOi.length > 0) {
    fazer.push({
      icone: MessageCircle,
      texto: `${plural(semOi.length, "match", "matches")} sem conversa ainda`,
      ajuda: `Mande um oi para ${nomes(semOi.map((c) => c.outro_nome))}`,
      href: linkDaConversa(semOi),
    });
  }

  // ------------------------------------------------------------ blocos de cada lado
  // Um fluxo aparece quando já tem movimento ou quando é o principal da conta;
  // os outros viram uma linha de sugestão no fim do lado.
  const vagaPrincipal = !pessoa || intencao === "contratar_pessoa";
  const servicoPrincipal = intencao === "oferecer_servico";
  const procurarVagaPrincipal = pessoa && (intencao === "trabalho" || !intencao);
  const pedirServicoPrincipal = intencao === "contratar_servico";
  const temVagasCurtidas = (vagasCurtidas?.length ?? 0) > 0;
  const temServicosPedidos = (servicosPedidos?.length ?? 0) > 0;

  const blocoVagas = (
    <Bloco
      key="vagas"
      id="ofereco-vagas"
      icone={Megaphone}
      titulo="Vagas que você publicou"
      texto="Quem curte a vaga vira candidato. Você decide quem aceitar: o aceite conecta vocês. Depois vêm a entrevista e a contratação."
      acao={
        <BotaoLink href="/publicar" tamanho="sm">
          <Plus aria-hidden />
          Publicar vaga
        </BotaoLink>
      }
    >
      <Trilha
        rotulo="Passos das vagas que você publicou"
        passos={[
          {
            nome: "No ar",
            numero: minhasVagas ? minhasVagas.filter(noAr).length : null,
            href: "/painel/anuncios?tipo=vaga",
            sempre: temVagas,
          },
          { nome: "Candidatos", numero: candidatos?.length ?? null, href: "/painel/candidatos" },
          {
            nome: "Para responder",
            numero: candidatos ? candidatosPendentes.length : null,
            href: "/painel/candidatos?situacao=responder",
            destaque: true,
          },
          {
            nome: "Entrevista",
            numero: contar(candidatos, (c) => c.etapa === "entrevista"),
            href: "/painel/candidatos?etapa=entrevista",
          },
          {
            nome: "Contratados",
            numero: contar(candidatos, (c) => c.etapa === "contratado"),
            href: "/painel/candidatos?etapa=contratado",
            final: true,
          },
        ]}
      />
    </Bloco>
  );

  const blocoServicos = (
    <Bloco
      key="servicos"
      id="ofereco-servicos"
      icone={Store}
      titulo="Seus serviços"
      texto="Quem precisa pede o serviço na sua vitrine. Você decide se aceita: o aceite conecta vocês para combinar o serviço."
      acao={
        <BotaoLink href="/painel/servicos" tamanho="sm">
          <Store aria-hidden />
          {temServicos ? "Editar vitrine" : "Montar vitrine"}
        </BotaoLink>
      }
    >
      <Trilha
        rotulo="Passos dos seus serviços"
        passos={[
          {
            nome: "Na vitrine",
            numero: meusServicos ? meusServicos.filter(noAr).length : null,
            href: "/painel/anuncios?tipo=servico",
            sempre: temServicos,
          },
          {
            nome: "Pedidos",
            numero: meusServicos ? soma(meusServicos.map((a) => a.curtidas_total)) : null,
            href: linkDosPedidos,
          },
          { nome: "Para responder", numero: pedidosParaResponder, href: linkDosPedidosNovos, destaque: true },
          {
            nome: "Aceitos",
            numero: meusServicos ? soma(meusServicos.map((a) => a.matches)) : null,
            href: "/painel/conversas",
            final: true,
          },
        ]}
      />
      {temServicos && (
        <div>
          <LinkDoBloco href="/painel/avaliacoes" icone={Star}>
            Avaliações que você recebeu
          </LinkDoBloco>
        </div>
      )}
    </Bloco>
  );

  const blocoVagasCurtidas = (
    <Bloco
      key="vagas-curtidas"
      id="procuro-vagas"
      icone={Briefcase}
      titulo="Vagas que você curtiu"
      texto="Você curte e quem publicou decide se aceita. Se aceitar, vocês se conectam e combinam a entrevista."
      acao={
        <BotaoLink href="/descobrir" tamanho="sm">
          <Search aria-hidden />
          Descobrir vagas
        </BotaoLink>
      }
    >
      <EditorProcuro inicial={procuro} comecarFechado />
      <Trilha
        rotulo="Passos das vagas que você curtiu"
        passos={[
          { nome: "Curtidas", numero: vagasCurtidas?.length ?? null, href: "/painel/curtidas?tipo=vaga" },
          {
            nome: "Aguardando aceite",
            numero: contar(vagasCurtidas, (c) => c.status === "pendente"),
            href: "/painel/curtidas?tipo=vaga&situacao=aguardando",
          },
          {
            nome: "Deu match",
            numero: contar(vagasCurtidas, (c) => c.status === "match"),
            href: "/painel/curtidas?tipo=vaga&situacao=match",
          },
          {
            nome: "Entrevista",
            numero: contar(vagasCurtidas, (c) => etapaDe(c) === "entrevista"),
            href: "/painel/curtidas?tipo=vaga&etapa=entrevista",
          },
          {
            nome: "Contratado",
            numero: contar(vagasCurtidas, (c) => etapaDe(c) === "contratado"),
            href: "/painel/curtidas?tipo=vaga&etapa=contratado",
            final: true,
          },
        ]}
      />
      {salvas ? (
        <div>
          <LinkDoBloco href="/descobrir?aba=salvas" icone={Star}>
            {plural(salvas, "vaga salva", "vagas salvas")} para decidir depois
          </LinkDoBloco>
        </div>
      ) : null}
    </Bloco>
  );

  const blocoServicosPedidos = (
    <Bloco
      key="servicos-pedidos"
      id="procuro-servicos"
      icone={Wrench}
      titulo="Profissionais que você chamou"
      texto="Você pede e o profissional decide se aceita. Se aceitar, vocês se conectam e combinam o dia."
      acao={
        <BotaoLink href="/?tipo=servico" tamanho="sm">
          <Search aria-hidden />
          Encontrar profissionais
        </BotaoLink>
      }
    >
      <Trilha
        rotulo="Passos dos serviços que você pediu"
        passos={[
          { nome: "Pedidos", numero: servicosPedidos?.length ?? null, href: "/painel/curtidas?tipo=servico" },
          {
            nome: "Aguardando aceite",
            numero: contar(servicosPedidos, (c) => c.status === "pendente"),
            href: "/painel/curtidas?tipo=servico&situacao=aguardando",
          },
          {
            nome: "Aceitaram",
            numero: contar(servicosPedidos, (c) => c.status === "match"),
            href: "/painel/curtidas?tipo=servico&situacao=match",
          },
          {
            nome: "Agendados",
            numero: contar(servicosPedidos, (c) => etapaDe(c) === "agendado"),
            href: "/painel/curtidas?tipo=servico&etapa=agendado",
          },
          {
            nome: "Concluídos",
            numero: contar(servicosPedidos, (c) => etapaDe(c) === "concluido"),
            href: "/painel/curtidas?tipo=servico&etapa=concluido",
            final: true,
          },
        ]}
      />
    </Bloco>
  );

  // O que você oferece: o seu trabalho (pessoa), os serviços e as vagas
  const blocosOfereco: ReactNode[] = [];
  const sugestoesOfereco: Sugestao[] = [];
  const mostrarServicos = temServicos || servicoPrincipal;
  const mostrarVagas = temVagas || vagaPrincipal;
  const servicos = mostrarServicos && blocoServicos;
  const vagas = mostrarVagas && blocoVagas;
  // "Seu trabalho" só para pessoa; primeiro vem o que a pessoa disse que quer fazer
  const trabalho = pessoa && (
    <BlocoSeuTrabalho key="trabalho" perfil={perfil} curriculo={leituraCurriculo} agora={agora} />
  );
  const ordemOfereco = !pessoa
    ? [vagas, servicos]
    : servicoPrincipal
      ? [servicos, trabalho, vagas]
      : intencao === "contratar_pessoa"
        ? [vagas, trabalho, servicos]
        : [trabalho, servicos, vagas];
  for (const b of ordemOfereco) if (b) blocosOfereco.push(b);
  if (!mostrarServicos) {
    sugestoesOfereco.push({
      icone: HandHelping,
      pergunta: pessoa ? "Faz bicos ou presta serviços?" : "Seu negócio presta serviços?",
      acao: "Monte sua vitrine grátis",
      href: "/painel/servicos",
    });
  }
  if (!mostrarVagas) {
    sugestoesOfereco.push({
      icone: Megaphone,
      pergunta: "Precisa contratar alguém?",
      acao: "Publique a vaga grátis",
      href: "/publicar",
    });
  }

  // O que você procura: as vagas curtidas (pessoa) e os profissionais chamados
  const blocosProcuro: ReactNode[] = [];
  const sugestoesProcuro: Sugestao[] = [];
  const mostrarVagasCurtidas = temVagasCurtidas || procurarVagaPrincipal;
  const mostrarServicosPedidos = temServicosPedidos || pedirServicoPrincipal;
  const ordemProcuro = pedirServicoPrincipal
    ? [mostrarServicosPedidos && blocoServicosPedidos, mostrarVagasCurtidas && blocoVagasCurtidas]
    : [mostrarVagasCurtidas && blocoVagasCurtidas, mostrarServicosPedidos && blocoServicosPedidos];
  for (const b of ordemProcuro) if (b) blocosProcuro.push(b);
  if (!mostrarVagasCurtidas && pessoa) {
    sugestoesProcuro.push({
      icone: Briefcase,
      pergunta: "Procurando trabalho?",
      acao: "Veja as vagas perto de você",
      href: "/?tipo=vaga",
    });
  }
  if (!mostrarServicosPedidos) {
    sugestoesProcuro.push({
      icone: Wrench,
      pergunta: "Precisa de um serviço?",
      acao: "Encontre profissionais perto de você",
      href: "/?tipo=servico",
    });
  }

  const ladoOfereco = (
    <Lado
      key="ofereco"
      id="ofereco"
      icone={HandHelping}
      titulo="O que você oferece"
      texto="O que você publicou ou mostra. Quem se interessa curte, e você decide se aceita: o aceite conecta vocês."
    >
      {blocosOfereco}
      <Sugestoes itens={sugestoesOfereco} />
    </Lado>
  );
  const ladoProcuro = (
    <Lado
      key="procuro"
      id="procuro"
      icone={Search}
      titulo="O que você procura"
      texto="O que você curtiu ou pediu. Quem publicou decide se aceita: só com o aceite vocês se conectam."
    >
      {blocosProcuro}
      <Sugestoes itens={sugestoesProcuro} />
    </Lado>
  );
  // quem procura trabalho ou um serviço vê primeiro o que procura; quem oferece ou contrata, o que oferece
  const procuraPrimeiro = intencao ? intencao === "trabalho" || intencao === "contratar_servico" : pessoa;
  const incompleto = !anuncios || !curtidas || (temVagas && !candidatos) || !conversas;

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        {suspensa && (
          <Aviso tipo="alerta" titulo="Sua conta está suspensa">
            Seus anúncios estão fora do ar e não dá para publicar, curtir ou editar. Veja o motivo no e-mail que
            enviamos.
          </Aviso>
        )}
        {incompleto && (
          <Aviso tipo="alerta" titulo="Parte dos números não carregou">
            Onde aparece “–”, tente de novo em instantes.
          </Aviso>
        )}
        <ParaFazer itens={fazer.slice(0, 5)} />
      </div>
      {procuraPrimeiro ? [ladoProcuro, ladoOfereco] : [ladoOfereco, ladoProcuro]}
      {conversas && conversas.length > 0 && (
        <section aria-labelledby="contatos" className="flex flex-col gap-3">
          <h2 id="contatos" className="text-h3">
            Em contato
          </h2>
          <div className="rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:max-w-md sm:p-5">
            <Trilha
              rotulo="Seus contatos"
              setas={false}
              passos={[
                { nome: "Matches", numero: conversas.length, href: "/painel/matches" },
                { nome: "Mensagens novas", numero: novas, href: "/painel/conversas", destaque: true },
              ]}
            />
          </div>
        </section>
      )}
    </div>
  );
}

/** O que quem curte uma vaga mostra de si: o que faz e o currículo. */
function BlocoSeuTrabalho({
  perfil,
  curriculo,
  agora,
}: {
  perfil: MeuPerfil | null;
  /** { c: null } = ainda não tem; null = não deu para ler */
  curriculo: { c: Curriculo | null } | null;
  agora: number;
}) {
  const servicos = perfil?.servicos ?? [];
  const link = "font-semibold text-ink underline underline-offset-2 hover:text-terra-text";
  return (
    <Bloco
      id="ofereco-trabalho"
      icone={UserRound}
      titulo="Seu trabalho"
      texto="É o que quem publicou a vaga vê quando você curte."
      acao={
        <BotaoLink href="/perfil" tamanho="sm">
          Editar perfil
        </BotaoLink>
      }
    >
      <dl className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3">
          <dt className="text-label">O que você faz</dt>
          <dd>
            {servicos.length > 0 ? (
              <ul aria-label="O que você faz" className="flex flex-wrap gap-1.5">
                {servicos.slice(0, 8).map((s) => (
                  <li key={s} className="rounded-pill bg-surface-300 px-2.5 py-1 text-body-sm">
                    {s}
                  </li>
                ))}
                {servicos.length > 8 && (
                  <li className="px-1 py-1 text-body-sm text-ink-muted">e mais {servicos.length - 8}</li>
                )}
              </ul>
            ) : (
              <p className="text-body-sm text-ink-muted">
                Ainda não disse.{" "}
                <Link href="/perfil" className={link}>
                  Dizer o que você faz
                </Link>
              </p>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-line bg-surface-100 p-3">
          <dt className="text-label">Currículo</dt>
          <dd className="flex flex-col gap-1 text-body-sm">
            {!curriculo ? (
              <span className="text-ink-muted">Não deu para ver agora.</span>
            ) : curriculo.c ? (
              <>
                <span className="flex items-center gap-1.5">
                  <CircleCheck aria-hidden className="size-4 shrink-0 text-cerrado-text" />
                  Preenchido · atualizado {tempoRelativo(curriculo.c.atualizado_em, agora)}
                </span>
                <Link href="/perfil/curriculo" className={`${link} self-start`}>
                  Ver ou editar
                </Link>
              </>
            ) : (
              <>
                <span className="text-ink-muted">Ainda não tem. Com ele, quem contrata conhece você melhor.</span>
                <Link href="/perfil/curriculo" className={`${link} self-start`}>
                  Montar currículo
                </Link>
              </>
            )}
          </dd>
        </div>
      </dl>
    </Bloco>
  );
}
