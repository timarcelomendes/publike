import { BellRing, Eye, FileText, Heart, Hourglass, MessagesSquare, Search, Star, Store, Wrench } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoVisaoGeral } from "@/components/painel/esqueleto";
import { Etapas, NumeroHoje, ParaFazerAgora, Saudacao, type Cartao } from "@/components/painel/hoje";
import { cartoesDaConta, conversaDoModo, nomes, soma, talvez } from "@/components/painel/cartoes-hoje";
import {
  andamento,
  cartoesDeQuemProcura,
  etapaDaCurtida,
  type EntrevistaMinha,
} from "@/components/painel/cartoes-de-quem-procura";
import { GradeDoPainel, type BlocoDoPainel } from "@/components/painel/grade-do-painel";
import { HojeContratar } from "@/components/painel/hoje-contratar";
import { ICONES_DO_PAINEL } from "@/components/painel/icones-do-painel";
import { ConviteNotificacoes } from "@/components/convite-notificacoes";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import type { Conexao } from "@/lib/conexoes";
import type { ConversaPessoa } from "@/lib/conversas";
import { esperaCurriculo, esperaResposta, type EtapaCandidato } from "@/lib/constantes";
import {
  contarMinhasSalvas,
  listarMeusAnuncios,
  listarMinhasCurtidas,
  listarMinhasEtapas,
  meuCurriculoNaVitrine,
  meuCurriculoVisivel,
  minhasProximasEntrevistas,
  obterMeuCurriculo,
  obterMeuPerfil,
} from "@/lib/dados";
import { formatarNumero, plural } from "@/lib/formato";
import { forcaDoCurriculo } from "@/lib/curriculo-forca";
import { vapidPublica } from "@/lib/servidor/ambiente";
import { contadoresDoPainel } from "@/lib/servidor/contadores-do-painel";
import { atividadesDoMenu, modoDaConta } from "@/lib/servidor/modo";
import { listarMeusCandidatos } from "@/lib/dados";
import { gruposDaConta, gruposDoModo, MODOS, outrasDaConta, type Contadores, type ModoPainel } from "@/lib/modo-painel";
import { minhasConexoes } from "@/lib/servidor/conexoes";
import { conversasPorPessoa } from "@/lib/servidor/conversas";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { Curriculo, MeuAnuncio, MeuPerfil, MinhaCurtida } from "@/lib/tipos";

// Hoje: a primeira página do painel, no modo da conta (ou no que a pessoa escolheu no
// menu). Em cima, o que pede a pessoa agora, em cartões com a ação no próprio cartão;
// embaixo, o andamento do modo. O banco não muda: tudo sai das leituras de sempre.
//   Contratar ... candidatos para responder, entrevistas, vagas e a agenda
//   Trabalhar ... a grade das seções (o "Para fazer agora" fica no alto das Candidaturas)
//   Serviços .... pedidos para responder, a vitrine e as avaliações

const DIA = 24 * 3600e3;

export default function Hoje() {
  return (
    <Suspense fallback={<EsqueletoVisaoGeral />}>
      <Conteudo />
    </Suspense>
  );
}

/** O convite das notificações no celular, pelo que a conta faz. */
const CONVITE_NOTIFICACOES: Record<string, { titulo: string; texto: string }> = {
  contratar: {
    titulo: "Saiba na hora quando alguém se candidatar",
    texto: "Candidatos, mensagens e entrevistas chegam no celular, mesmo com o Publike fechado.",
  },
  servicos: {
    titulo: "Saiba na hora quando pedirem seu serviço",
    texto: "Pedidos, mensagens e avaliações chegam no celular, mesmo com o Publike fechado.",
  },
  trabalhar: {
    titulo: "Saiba na hora quando responderem",
    texto: "Aceites, mensagens e entrevistas chegam no celular, mesmo com o Publike fechado.",
  },
};

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  const usuario = await exigirUsuario("/painel");
  const [perfil, modo, conversas, conexoes, atividades] = await Promise.all([
    obterMeuPerfil(),
    modoDaConta(),
    conversasPorPessoa(),
    minhasConexoes().catch(() => null),
    atividadesDoMenu(),
  ]);
  const agora = await agoraDaRequisicao();
  const suspensa = Boolean(perfil?.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > agora);

  let pagina;
  if (modo === "contratar" && perfil) {
    pagina = <HojeContratar usuario={usuario} perfil={perfil} conversas={conversas} conexoes={conexoes} agora={agora} />;
  } else if (modo === "servicos") {
    const anuncios = await talvez(listarMeusAnuncios(), "os anúncios");
    pagina = <HojeServicos perfil={perfil} anuncios={anuncios} conversas={conversas} agora={agora} />;
  } else {
    const [curtidas, etapas, curriculo, entrevistas, salvas, visivel, vitrine, contadores] = await Promise.all([
      talvez(listarMinhasCurtidas(), "as curtidas"),
      listarMinhasEtapas(),
      // { c: null } = ainda não tem currículo; null = não deu para ler
      talvez(
        obterMeuCurriculo().then((c) => ({ c })),
        "o currículo",
      ),
      minhasProximasEntrevistas(agora),
      contarMinhasSalvas(),
      meuCurriculoVisivel(),
      meuCurriculoNaVitrine(),
      // os mesmos números do menu (mensagens, visitas e os das outras atividades)
      contadoresDoPainel(),
    ]);
    pagina = (
      <HojeTrabalhar
        perfil={perfil}
        curtidas={curtidas}
        etapas={etapas}
        curriculo={curriculo}
        entrevistas={entrevistas}
        conversas={conversas}
        conexoes={conexoes}
        salvas={salvas}
        visivel={visivel}
        vitrine={vitrine}
        atividades={atividades}
        contadores={contadores}
        agora={agora}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {suspensa && (
        <Aviso tipo="alerta" titulo="Sua conta está suspensa">
          Seus anúncios estão fora do ar e não dá para publicar, curtir ou responder. Veja o motivo no e-mail que
          enviamos.
        </Aviso>
      )}
      {/* o convite das notificações no celular (só para quem ainda não ligou neste aparelho) */}
      {!suspensa && (
        <ConviteNotificacoes
          vapid={vapidPublica()}
          {...(CONVITE_NOTIFICACOES[modo] ?? CONVITE_NOTIFICACOES.trabalhar)}
        />
      )}
      {pagina}
      {/* quem faz mais de uma coisa: o Hoje é o da atividade principal; as outras, num quadro curto (o
          Painel de quem procura trabalho já mostra as seções delas na grade) */}
      {atividades.length > 1 && modo !== "trabalhar" && (
        <Suspense fallback={null}>
          <OutrasAtividades outras={atividades.filter((a) => a !== modo)} />
        </Suspense>
      )}
    </div>
  );
}

/** O que pede a pessoa nas outras atividades dela (o menu mostra todas; aqui, o resumo de cada uma). */
async function OutrasAtividades({ outras }: { outras: ModoPainel[] }) {
  const [anuncios, candidatos] = await Promise.all([
    outras.includes("servicos") ? listarMeusAnuncios().catch(() => []) : Promise.resolve([]),
    outras.includes("contratar") ? listarMeusCandidatos().catch(() => []) : Promise.resolve([]),
  ]);
  const linhas = outras.map((m) => {
    const nome = MODOS.find((x) => x.valor === m)?.nome ?? m;
    if (m === "contratar") {
      const n = (candidatos ?? []).filter(esperaResposta).length;
      return n
        ? {
            nome,
            texto: `${plural(n, "candidato espera", "candidatos esperam")} sua resposta`,
            href: "/painel/caixa?aba=responder",
            acao: "Responder",
          }
        : {
            nome,
            texto: "Nenhum candidato esperando resposta",
            href: "/painel/anuncios?tipo=vaga",
            acao: "Ver suas vagas",
          };
    }
    if (m === "servicos") {
      const n = anuncios.filter((a) => a.tipo === "servico").reduce((t, a) => t + (a.curtidas_novas ?? 0), 0);
      return n
        ? {
            nome,
            texto: `${plural(n, "pedido novo", "pedidos novos")}`,
            href: "/painel/anuncios?tipo=servico",
            acao: "Responder",
          }
        : { nome, texto: "Nenhum pedido novo", href: "/painel/servicos", acao: "Ver a vitrine" };
    }
    return {
      nome,
      texto: "Suas candidaturas e o currículo",
      href: "/painel/curtidas?tipo=vaga",
      acao: "Ver candidaturas",
    };
  });
  return (
    <section aria-labelledby="outras-atividades" className="flex flex-col gap-3">
      <h2 id="outras-atividades" className="text-h3">
        Suas outras atividades
      </h2>
      <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
        {linhas.map((l) => (
          <li key={l.nome} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block text-label">{l.nome}</span>
              <span className="block text-body-sm text-ink-muted">{l.texto}</span>
            </span>
            <Link href={l.href} className="text-label underline underline-offset-2 hover:text-terra-text">
              {l.acao}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ==================================================================== Trabalhar

/** O que tem em cada seção das outras atividades (na grade do painel de quem procura trabalho). */
const AJUDA_DAS_SECOES: Record<string, string> = {
  "/painel/anuncios?tipo=servico": "Quem pediu seus serviços",
  "/painel/servicos": "Seus serviços, fotos e preços",
  "/painel/avaliacoes": "O que dizem do seu trabalho",
  "/painel/anuncios?tipo=vaga": "As vagas que você publicou",
  "/painel/caixa": "Quem curtiu as suas vagas",
  "/painel/caixa?aba=entrevistas": "As entrevistas marcadas",
  "/painel/contratados": "Quem você contratou",
  "/talentos": "Quem procura trabalho perto",
  "/painel/links": "Para levar gente às suas vagas",
};

/**
 * O Painel de quem procura trabalho: a grade das seções, todas à vista, cada uma com o que tem lá. O
 * "Para fazer agora" fica no alto das Candidaturas (aqui, o número no bloco delas). No celular, a grade
 * faz o papel da linha do menu (o menu some nesta página: `gradeNoHoje` em MenuPainel). Quem faz mais de
 * uma coisa vê as seções das outras atividades embaixo, com o nome de cada uma.
 */
function HojeTrabalhar({
  perfil,
  curtidas,
  etapas,
  curriculo,
  entrevistas,
  conversas,
  conexoes,
  salvas,
  visivel,
  vitrine,
  atividades,
  contadores,
  agora,
}: {
  perfil: MeuPerfil | null;
  curtidas: MinhaCurtida[] | null;
  etapas: Map<string, { etapa: EtapaCandidato; atualizado_em: string }>;
  curriculo: { c: Curriculo | null } | null;
  entrevistas: EntrevistaMinha[];
  conversas: ConversaPessoa[] | null;
  conexoes: Conexao[] | null;
  salvas: number | null;
  /** o currículo aparece em Talentos para as empresas */
  visivel: boolean;
  /** e o resumo aparece na aba Talentos da busca */
  vitrine: boolean;
  /** o que a conta faz (Trabalhar primeiro) */
  atividades: ModoPainel[];
  contadores: Contadores;
  agora: number;
}) {
  const vagas = (curtidas ?? []).filter((c) => c.tipo === "vaga");
  const entrevistaDe = new Map(entrevistas.map((e) => [e.anuncio_id, e]));
  const semCurriculo = curriculo !== null && curriculo.c === null;
  // o "Para fazer agora" (no alto das Candidaturas): aqui, só quantos são
  const cartoes = cartoesDeQuemProcura({
    perfil,
    curtidas,
    etapas,
    curriculo,
    entrevistas,
    conversas,
    conexoes,
    agora,
  });

  // as candidaturas: as que andam primeiro, depois as que esperam, as encerradas por último
  const lista = vagas
    .map((c) => ({ c, a: andamento(c, etapaDaCurtida(c, etapas), entrevistaDe.get(c.anuncio_id)) }))
    .sort(
      (x, y) =>
        Number(x.a.fim) - Number(y.a.fim) ||
        y.a.feitas - x.a.feitas ||
        new Date(y.c.curtido_em).getTime() - new Date(x.c.curtido_em).getTime(),
    );
  const ativas = lista.filter((x) => !x.a.fim).length;
  const forca = curriculo?.c ? forcaDoCurriculo(curriculo.c) : null;
  // as conversas mais recentes com mensagem (no computador, ao lado das Candidaturas)
  const recentes = (conversas ?? [])
    .filter((c) => c.ultima_texto)
    .sort((a, b) => new Date(b.ultima_em ?? 0).getTime() - new Date(a.ultima_em ?? 0).getTime())
    .slice(0, 2);

  const deQuemProcura: BlocoDoPainel[] = [
    {
      href: "/painel/curtidas?tipo=vaga",
      nome: "Candidaturas",
      icone: Heart,
      largo: true,
      destaque: cartoes.length > 0,
      // o que fazer primeiro; o andamento aparece embaixo, nas barras de cada uma
      texto: cartoes.length
        ? plural(cartoes.length, "coisa para fazer agora", "coisas para fazer agora")
        : ativas
          ? `${formatarNumero(ativas)} em andamento`
          : vagas.length
            ? "Nenhuma em andamento"
            : "Curta as vagas que interessam e acompanhe cada uma aqui, da curtida à contratação",
      extra: lista.length > 0 && (
        <ul className="flex flex-col gap-3 border-t border-line pt-3">
          {lista.slice(0, 3).map(({ c, a }) => (
            <li key={c.anuncio_id} className="flex flex-col gap-1.5">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-body-sm font-semibold text-ink">{c.titulo}</span>
                <span
                  className={`text-body-sm ${
                    !a.fim && (a.feitas >= 2 || esperaCurriculo(c))
                      ? "font-semibold text-cerrado-text"
                      : "text-ink-muted"
                  }`}
                >
                  {a.texto}
                </span>
              </span>
              <span aria-hidden>
                <Etapas feitas={a.feitas} atual={a.atual} rotulo={a.texto} />
              </span>
            </li>
          ))}
          {lista.length > 3 && <li className="text-body-sm text-ink-muted">e mais {lista.length - 3}</li>}
        </ul>
      ),
    },
    {
      href: "/painel/conversas",
      nome: "Mensagens",
      icone: MessagesSquare,
      numero: contadores.mensagens,
      texto: "Conversas, matches e conexões",
      // no computador, o bloco fica ao lado das Candidaturas: as últimas conversas enchem a altura
      extra: recentes.length > 0 && (
        <ul className="hidden flex-col gap-2 border-t border-line pt-3 lg:flex">
          {recentes.map((c) => (
            <li key={c.outro_id} className="min-w-0 text-body-sm">
              <span className={`block truncate ${c.nao_lidas ? "font-semibold text-ink" : "text-ink"}`}>
                {c.outro_nome}
              </span>
              <span className="block truncate text-ink-muted">
                {c.ultima_minha ? "Você: " : ""}
                {c.ultima_texto}
              </span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      href: "/painel/visitas",
      nome: "Quem viu seu perfil",
      icone: Eye,
      numero: contadores.visitas,
      texto: "Quem abriu seu perfil e seu currículo",
    },
    {
      href: "/painel/seguindo",
      nome: "Avisos e seguindo",
      icone: BellRing,
      texto: "Avisos de vagas e quem você segue",
    },
    {
      href: "/perfil/curriculo",
      nome: "Currículo",
      icone: FileText,
      destaque: semCurriculo,
      texto: semCurriculo
        ? "Monte o seu: leva poucos minutos"
        : forca
          ? `${forca.pontos}% completo`
          : "O seu currículo",
      extra: forca && (
        <span className="mt-auto flex flex-col gap-2">
          <span aria-hidden className="flex h-2 overflow-hidden rounded-pill bg-surface-300">
            <span className={forca.pontos >= 80 ? "bg-cerrado" : "bg-ipe"} style={{ width: `${forca.pontos}%` }} />
          </span>
          <span className="text-body-sm text-ink-muted">
            {vitrine
              ? "Você aparece na aba Talentos"
              : visivel
                ? "Empresas da sua cidade acham você"
                : "As empresas ainda não acham você"}
          </span>
        </span>
      ),
    },
  ];

  // quem faz mais de uma coisa: as seções das outras atividades, com o nome de cada uma (como no menu)
  const jaNaGrade = new Set(["/painel", ...deQuemProcura.map((b) => b.href)]);
  const outrasAtividades = atividades
    .filter((m) => m !== "trabalhar")
    .map((m) => ({
      nome: MODOS.find((x) => x.valor === m)?.nome ?? m,
      blocos: gruposDoModo(m, perfil?.tipo ?? null)
        .flatMap((g) => g.secoes)
        .filter((s) => !jaNaGrade.has(s.href) && jaNaGrade.add(s.href))
        .map((s): BlocoDoPainel => {
          const n = s.contador ? (contadores[s.contador] ?? 0) : 0;
          const comoTexto = s.jeito === "texto";
          return {
            href: s.href,
            nome: s.nome,
            icone: ICONES_DO_PAINEL[s.icone],
            numero: comoTexto ? 0 : n,
            texto:
              comoTexto && n > 0 && s.sufixo ? `${formatarNumero(n)} ${s.sufixo}` : (AJUDA_DAS_SECOES[s.href] ?? ""),
          };
        }),
    }))
    .filter((g) => g.blocos.length > 0);
  const nomeDaAtividade = MODOS.find((x) => x.valor === "trabalhar")?.nome ?? "Trabalhar";

  return (
    <div className="flex flex-col gap-6">
      <Saudacao
        nome={perfil?.nome ?? null}
        agora={agora}
        pendencias={cartoes.length}
        acao={
          <BotaoLink href="/?tipo=vaga&ordem=combina" variante="primario" tamanho="sm">
            <Search aria-hidden />
            Vagas que combinam
          </BotaoLink>
        }
      />
      {curtidas === null && (
        <Aviso tipo="alerta" titulo="Parte da página não carregou">
          Suas candidaturas não apareceram agora. Tente de novo em instantes.
        </Aviso>
      )}
      <GradeDoPainel
        titulo="As seções do seu painel"
        grupos={[
          { nome: outrasAtividades.length ? nomeDaAtividade : null, blocos: deQuemProcura },
          ...outrasAtividades,
        ]}
        mais={[
          // as vagas salvas no Descobrir, para decidir depois
          ...(salvas
            ? [
                {
                  href: "/descobrir?aba=salvas",
                  nome: plural(salvas, "vaga salva para decidir", "vagas salvas para decidir"),
                },
              ]
            : []),
          ...outrasDaConta(atividades, gruposDaConta(atividades, perfil?.tipo ?? null)),
        ]}
      />
    </div>
  );
}

// ==================================================================== Serviços

function HojeServicos({
  perfil,
  anuncios,
  conversas,
  agora,
}: {
  perfil: MeuPerfil | null;
  anuncios: MeuAnuncio[] | null;
  conversas: ConversaPessoa[] | null;
  agora: number;
}) {
  const servicos = (anuncios ?? []).filter((a) => a.tipo === "servico");
  const noAr = servicos.filter((a) => a.status === "ativo" && new Date(a.expira_em).getTime() > agora);
  const comPedido = servicos.filter((a) => a.curtidas_novas > 0);
  const paraResponder = soma(servicos.map((a) => a.curtidas_novas));
  const linkDe = (lista: MeuAnuncio[]) =>
    lista.length === 1 ? `/painel/anuncio/${lista[0].id}` : "/painel/anuncios?tipo=servico";

  const cartoes: Cartao[] = [];
  if (paraResponder) {
    cartoes.push({
      icone: Wrench,
      tom: "urgente",
      quando: "Esperando você",
      titulo: `${plural(paraResponder, "pedido esperando", "pedidos esperando")} sua resposta`,
      texto: `Em ${nomes(comPedido.map((a) => a.titulo))}. Aceite para conversar e combinar o dia.`,
      href: linkDe(comPedido),
      acao: "Responder agora",
    });
  }
  cartoes.push(...cartoesDaConta(perfil, conversas, conversaDoModo.servicos));
  if (servicos.length === 0) {
    cartoes.push({
      icone: Store,
      quando: "Comece aqui",
      titulo: "Monte sua vitrine",
      texto: "Diga o que faz, onde atende e quanto cobra. Quem mora perto pede pelo Publike.",
      href: "/painel/servicos",
      acao: "Montar vitrine",
    });
  }
  const vencendo = noAr.filter((a) => new Date(a.expira_em).getTime() - agora < 5 * DIA);
  if (vencendo.length) {
    cartoes.push({
      icone: Hourglass,
      quando: "Em breve",
      titulo: `${plural(vencendo.length, "serviço sai", "serviços saem")} do ar`,
      texto: "Renove para continuar recebendo pedidos.",
      href: "/painel/anuncios?tipo=servico",
      acao: "Renovar",
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <Saudacao
        nome={perfil?.nome ?? null}
        agora={agora}
        pendencias={cartoes.length}
        acao={
          <BotaoLink href="/painel/servicos" variante="primario" tamanho="sm">
            <Store aria-hidden />
            {servicos.length ? "Editar vitrine" : "Montar vitrine"}
          </BotaoLink>
        }
      />
      <ParaFazerAgora itens={cartoes} vazio="Tudo em dia. Quando alguém pedir um serviço seu, aparece aqui." />

      <section aria-label="Números dos seus serviços" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <NumeroHoje
          nome="Na vitrine"
          valor={anuncios ? formatarNumero(noAr.length) : "–"}
          href="/painel/anuncios?tipo=servico"
        />
        <NumeroHoje
          nome="Pedidos"
          valor={anuncios ? formatarNumero(soma(servicos.map((a) => a.curtidas_total))) : "–"}
          ajuda="desde que publicou"
          href="/painel/anuncios?tipo=servico"
        />
        <NumeroHoje
          nome="Para responder"
          valor={anuncios ? formatarNumero(paraResponder) : "–"}
          href={linkDe(comPedido)}
        />
        <NumeroHoje
          nome="Aceitos"
          valor={anuncios ? formatarNumero(soma(servicos.map((a) => a.matches))) : "–"}
          ajuda="viraram conversa"
          href="/painel/conversas"
        />
      </section>

      {servicos.length > 0 && (
        <section aria-labelledby="seus-servicos" className="flex flex-col gap-3">
          <h2 id="seus-servicos" className="text-h3">
            Seus serviços
          </h2>
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
            {servicos.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/painel/anuncio/${a.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3.5 transition-colors hover:bg-surface-300 sm:px-5"
                >
                  <span className="text-label">{a.titulo}</span>
                  <span className="text-body-sm text-ink-muted">
                    {plural(a.curtidas_total, "pedido", "pedidos")}
                    {a.curtidas_novas > 0 && (
                      <strong className="text-terra-text"> · {a.curtidas_novas} para responder</strong>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="Atalhos dos serviços" className="grid gap-2 sm:grid-cols-2">
        <Atalho icone={Store} href="/painel/servicos" titulo="Sua vitrine: serviços, fotos e preços" />
        <Atalho icone={Star} href="/painel/avaliacoes" titulo="Avaliações que você recebeu" />
      </nav>
    </div>
  );
}

function Atalho({ icone: Icone, href, titulo }: { icone: typeof Search; href: string; titulo: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-3 rounded-md border border-line bg-surface-200 px-4 py-2.5 text-label transition-colors hover:border-line-strong"
    >
      <Icone aria-hidden className="size-5 shrink-0 text-ink-muted" />
      {titulo}
    </Link>
  );
}
