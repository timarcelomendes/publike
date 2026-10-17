import {
  Bell,
  CalendarClock,
  FileText,
  Hourglass,
  MessageCircle,
  MessagesSquare,
  PartyPopper,
  Search,
  Sparkles,
  Star,
  Store,
  UserRound,
  Wrench,
} from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { EsqueletoVisaoGeral } from "@/components/painel/esqueleto";
import { Etapas, NumeroHoje, ParaFazerAgora, Saudacao, type Cartao } from "@/components/painel/hoje";
import { PainelRecrutador } from "@/components/painel/recrutador";
import { SoComSupabase } from "@/components/so-com-supabase";
import { Aviso } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { MODO_DEMO } from "@/lib/config";
import { esperaCurriculo, esperaResposta, etapaParaQuemCurtiu, type EtapaCandidato } from "@/lib/constantes";
import {
  contarMinhasSalvas,
  listarMeusAnuncios,
  listarMeusCandidatos,
  listarMinhasConversas,
  listarMinhasCurtidas,
  listarMinhasEtapas,
  meuCurriculoVisivel,
  minhasProximasEntrevistas,
  obterMeuCurriculo,
  obterMeuPerfil,
  perfilCompleto,
  type Conversa,
} from "@/lib/dados";
import { formatarNumero, plural, tempoRelativo } from "@/lib/formato";
import { COOKIE_MODO, lerModo, modoPadrao } from "@/lib/modo-painel";
import { dataDaEntrevista } from "@/lib/recrutamento";
import { obterIntencao } from "@/lib/servidor/intencao";
import { exigirUsuario } from "@/lib/sessao";
import { agoraDaRequisicao } from "@/lib/tempo";
import type { Curriculo, MeuAnuncio, MeuPerfil, MinhaCurtida } from "@/lib/tipos";

// Hoje: a primeira página do painel, no modo da conta (ou no que a pessoa escolheu no
// menu). Em cima, o que pede a pessoa agora, em cartões com a ação no próprio cartão;
// embaixo, o andamento do modo. O banco não muda: tudo sai das leituras de sempre.
//   Contratar ... candidatos para responder, entrevistas, vagas e a agenda
//   Trabalhar ... aceites, entrevistas, cada candidatura com a etapa e o currículo
//   Serviços .... pedidos para responder, a vitrine e as avaliações

const DIA = 24 * 3600e3;

export default function Hoje() {
  return (
    <Suspense fallback={<EsqueletoVisaoGeral />}>
      <Conteudo />
    </Suspense>
  );
}

/** Uma leitura que, se falhar, não derruba a página (o número vira "–"). */
async function talvez<T>(leitura: Promise<T>, oQue: string): Promise<T | null> {
  try {
    return await leitura;
  } catch (e) {
    console.error(`Publike: Hoje sem ${oQue}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** "Garçom", "Garçom e Cozinheira", "Garçom e mais 2" */
function nomes(lista: string[]) {
  const unicos = [...new Set(lista)];
  return unicos.length <= 2 ? unicos.join(" e ") : `${unicos[0]} e mais ${unicos.length - 1}`;
}

const soma = (lista: number[]) => lista.reduce((total, n) => total + n, 0);

async function Conteudo() {
  if (MODO_DEMO) return <SoComSupabase />;
  await exigirUsuario("/painel");
  const [perfil, intencao, jar, conversas] = await Promise.all([
    obterMeuPerfil(),
    talvez(obterIntencao(), "a intenção"),
    cookies(),
    listarMinhasConversas(),
  ]);
  const agora = await agoraDaRequisicao();
  const modo = lerModo(jar.get(COOKIE_MODO)?.value) ?? modoPadrao(perfil?.tipo, intencao);
  const suspensa = Boolean(perfil?.suspenso_ate && new Date(perfil.suspenso_ate).getTime() > agora);

  let pagina;
  if (modo === "contratar" && perfil) {
    const [anuncios, candidatos] = await Promise.all([
      talvez(listarMeusAnuncios(), "os anúncios"),
      listarMeusCandidatos(),
    ]);
    pagina = (
      <PainelRecrutador
        nome={perfil.nome}
        autorId={perfil.id}
        anuncios={anuncios}
        candidatos={candidatos}
        agora={agora}
      />
    );
  } else if (modo === "servicos") {
    const anuncios = await talvez(listarMeusAnuncios(), "os anúncios");
    pagina = <HojeServicos perfil={perfil} anuncios={anuncios} conversas={conversas} agora={agora} />;
  } else {
    const [curtidas, etapas, curriculo, entrevistas, salvas, visivel] = await Promise.all([
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
    ]);
    pagina = (
      <HojeTrabalhar
        perfil={perfil}
        curtidas={curtidas}
        etapas={etapas}
        curriculo={curriculo}
        entrevistas={entrevistas}
        conversas={conversas}
        salvas={salvas}
        visivel={visivel}
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
      {pagina}
    </div>
  );
}

/** Os cartões que valem em todos os modos: perfil incompleto, mensagens novas e matches sem oi. */
function cartoesDaConta(
  perfil: MeuPerfil | null,
  conversas: Conversa[] | null,
  doModo: (c: Conversa) => boolean,
): Cartao[] {
  const daqui = (conversas ?? []).filter(doModo);
  const comNovas = daqui.filter((c) => c.nao_lidas > 0);
  const semOi = daqui.filter((c) => !c.ultima_texto);
  const linkDaConversa = (lista: Conversa[]) =>
    lista.length === 1 ? `/painel/conversas/${lista[0].anuncio_id}/${lista[0].outro_id}` : "/painel/conversas";
  const cartoes: Cartao[] = [];
  if (comNovas.length) {
    const novas = soma(comNovas.map((c) => c.nao_lidas));
    cartoes.push({
      icone: MessagesSquare,
      quando: "Mensagens",
      titulo: plural(novas, "mensagem nova", "mensagens novas"),
      texto: `De ${nomes(comNovas.map((c) => c.outro_nome))}`,
      href: linkDaConversa(comNovas),
      acao: "Ler e responder",
    });
  }
  if (semOi.length) {
    cartoes.push({
      icone: MessageCircle,
      quando: "Conexão nova",
      titulo: `${plural(semOi.length, "match", "matches")} sem conversa ainda`,
      texto: `Mande um oi para ${nomes(semOi.map((c) => c.outro_nome))}`,
      href: linkDaConversa(semOi),
      acao: "Mandar um oi",
    });
  }
  if (!perfilCompleto(perfil)) {
    cartoes.push({
      icone: UserRound,
      quando: "Perfil",
      titulo: "Complete seu perfil",
      texto: "Com um WhatsApp ou e-mail você já pode publicar e curtir.",
      href: "/perfil",
      acao: "Completar",
    });
  }
  return cartoes;
}

// ==================================================================== Trabalhar

type EntrevistaMinha = Awaited<ReturnType<typeof minhasProximasEntrevistas>>[number];

/** O que falta no currículo, na ordem que mais ajuda a combinar com as vagas. */
function forcaDoCurriculo(c: Curriculo | null) {
  const itens: { feito: boolean; dica: string }[] = [
    { feito: Boolean(c?.experiencias.length), dica: "Conte onde já trabalhou: é o que quem contrata lê primeiro." },
    { feito: Boolean(c?.disponibilidade.length), dica: "Diga os horários que pode: o % de match usa isso." },
    { feito: Boolean(c?.escolaridade), dica: "Coloque a escolaridade: muitas vagas pedem." },
    { feito: Boolean(c?.cursos.length), dica: "Liste cursos e certificados: contam no % de match." },
    { feito: Boolean(c?.arquivo), dica: "Anexe um PDF, se tiver: quem contrata pode baixar." },
  ];
  const feitos = itens.filter((i) => i.feito).length;
  return {
    pontos: c ? Math.round((100 * (feitos + 1)) / (itens.length + 1)) : 0,
    dica: itens.find((i) => !i.feito)?.dica ?? null,
  };
}

/** Onde está cada candidatura, em 4 passos: curtiu, aceito, entrevista, contratado. */
function andamento(c: MinhaCurtida, etapa: EtapaCandidato | null, entrevista: EntrevistaMinha | undefined) {
  if (c.status === "dispensada") return { feitas: 1, atual: false, texto: "Não foi dessa vez", fim: true };
  if (c.status === "desfeito") return { feitas: 1, atual: false, texto: "Match desfeito", fim: true };
  if (etapa === "nao_seguiu") return { feitas: 2, atual: false, texto: "Encerrado", fim: true };
  if (etapa === "contratado") return { feitas: 4, atual: false, texto: "Contratado! Parabéns", fim: false };
  if (entrevista || etapa === "entrevista")
    return {
      feitas: 2,
      atual: true,
      texto: entrevista ? `Entrevista ${dataDaEntrevista(entrevista.quando)}` : "Em entrevista",
      fim: false,
    };
  if (c.status === "match") return { feitas: 2, atual: true, texto: "Deu match: combinem a entrevista", fim: false };
  if (esperaCurriculo(c)) return { feitas: 1, atual: true, texto: "Aceitou você: falta o currículo", fim: false };
  return {
    feitas: 1,
    atual: true,
    texto: etapa === "analise" ? `${c.autor_nome} está analisando` : `Esperando ${c.autor_nome} responder`,
    fim: false,
  };
}

function HojeTrabalhar({
  perfil,
  curtidas,
  etapas,
  curriculo,
  entrevistas,
  conversas,
  salvas,
  visivel,
  agora,
}: {
  perfil: MeuPerfil | null;
  curtidas: MinhaCurtida[] | null;
  etapas: Map<string, { etapa: EtapaCandidato; atualizado_em: string }>;
  curriculo: { c: Curriculo | null } | null;
  entrevistas: EntrevistaMinha[];
  conversas: Conversa[] | null;
  salvas: number | null;
  /** o currículo aparece em Talentos para as empresas */
  visivel: boolean;
  agora: number;
}) {
  const vagas = (curtidas ?? []).filter((c) => c.tipo === "vaga");
  const etapaDe = (c: MinhaCurtida) => etapaParaQuemCurtiu(c.tipo, c.status, etapas.get(c.anuncio_id)?.etapa);
  const aceitas = vagas.filter(esperaCurriculo);
  const tituloDe = new Map(vagas.map((v) => [v.anuncio_id, v]));
  const entrevistaDe = new Map(entrevistas.map((e) => [e.anuncio_id, e]));
  const semCurriculo = curriculo !== null && curriculo.c === null;

  const cartoes: Cartao[] = [];
  if (aceitas.length) {
    cartoes.push({
      icone: PartyPopper,
      tom: "bom",
      quando: "Boa notícia",
      titulo: aceitas.length === 1 ? `${aceitas[0].autor_nome} aceitou você` : `${aceitas.length} vagas aceitaram você`,
      texto: `Em ${nomes(aceitas.map((c) => c.titulo))}. Mande o currículo e o match sai na hora.`,
      href:
        aceitas.length === 1
          ? `/perfil/curriculo?next=${encodeURIComponent(`/anuncio/${aceitas[0].anuncio_id}`)}`
          : "/perfil/curriculo",
      acao: "Mandar meu currículo",
    });
  }
  const paraConfirmar = entrevistas.filter((e) => e.situacao === "marcada");
  for (const e of entrevistas.filter((x) => new Date(x.quando).getTime() <= agora + 3 * DIA).slice(0, 2)) {
    const v = tituloDe.get(e.anuncio_id);
    const confirmar = e.situacao === "marcada";
    cartoes.push({
      icone: CalendarClock,
      tom: confirmar ? "urgente" : "normal",
      quando: dataDaEntrevista(e.quando),
      titulo: `Entrevista${v ? ` para ${v.titulo}` : ""}`,
      texto: confirmar
        ? `${v?.autor_nome ?? "Quem publicou"} marcou: confirme que vai ou peça outro horário.`
        : e.situacao === "remarcar"
          ? "Você pediu outro horário: espere o novo dia."
          : "Confirmada. Chegue uns minutos antes.",
      href: `/anuncio/${e.anuncio_id}`,
      acao: confirmar ? "Confirmar" : "Ver detalhes",
    });
  }
  if (paraConfirmar.length > 2) {
    cartoes.push({
      icone: CalendarClock,
      titulo: `${paraConfirmar.length} entrevistas para confirmar`,
      href: "/painel/curtidas?tipo=vaga&etapa=entrevista",
      acao: "Ver",
    });
  }
  cartoes.push(...cartoesDaConta(perfil, conversas, (c) => c.papel === "curti" && c.anuncio_tipo === "vaga"));
  if (semCurriculo && aceitas.length === 0) {
    cartoes.push({
      icone: FileText,
      quando: "Currículo",
      titulo: "Monte seu currículo",
      texto: "Leva poucos minutos e mostra o seu % de match em cada vaga.",
      href: "/perfil/curriculo",
      acao: "Montar agora",
    });
  }
  const vencendo = vagas.filter(
    (c) =>
      esperaResposta(c) &&
      c.anuncio_status === "ativo" &&
      new Date(c.expira_em).getTime() - agora < 3 * DIA &&
      new Date(c.expira_em).getTime() > agora,
  );
  if (vencendo.length) {
    cartoes.push({
      icone: Hourglass,
      quando: "Em breve",
      titulo: `${plural(vencendo.length, "vaga que você curtiu sai", "vagas que você curtiu saem")} do ar`,
      texto: `${nomes(vencendo.map((c) => c.titulo))}. Mande uma mensagem pelo anúncio, se tiver.`,
      href: "/painel/curtidas?tipo=vaga&situacao=aguardando",
      acao: "Ver as vagas",
    });
  }

  // as candidaturas: as que andam primeiro, depois as que esperam, as encerradas por último
  const lista = vagas
    .map((c) => ({ c, a: andamento(c, etapaDe(c), entrevistaDe.get(c.anuncio_id)) }))
    .sort(
      (x, y) =>
        Number(x.a.fim) - Number(y.a.fim) ||
        y.a.feitas - x.a.feitas ||
        new Date(y.c.curtido_em).getTime() - new Date(x.c.curtido_em).getTime(),
    );
  const ativas = lista.filter((x) => !x.a.fim).length;
  const forca = curriculo ? forcaDoCurriculo(curriculo.c) : null;

  return (
    <div className="flex flex-col gap-8">
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
      <ParaFazerAgora
        itens={cartoes}
        vazio="Tudo em dia. Quando alguém aceitar você ou marcar uma entrevista, aparece aqui."
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="candidaturas" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="candidaturas" className="text-h3">
              Suas candidaturas
              {ativas > 0 && <span className="text-ink-muted"> · {ativas} em andamento</span>}
            </h2>
            {vagas.length > 0 && (
              <Link
                href="/painel/curtidas?tipo=vaga"
                className="text-label text-ink-muted underline underline-offset-2 hover:text-ink"
              >
                Ver todas
              </Link>
            )}
          </div>
          {vagas.length === 0 ? (
            <div className="flex flex-col items-start gap-3 rounded-lg border border-line bg-surface-200 p-5">
              <p className="text-body text-ink">Você ainda não curtiu nenhuma vaga.</p>
              <p className="text-body-sm text-ink-muted">
                Curta as que interessam: quem publicou vê seu perfil e decide se aceita. Aqui você acompanha cada uma,
                da curtida à contratação.
              </p>
              <BotaoLink href="/descobrir" tamanho="sm">
                <Sparkles aria-hidden />
                Descobrir vagas
              </BotaoLink>
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-200">
              {lista.slice(0, 6).map(({ c, a }) => (
                <li key={c.anuncio_id}>
                  <Link
                    href={`/anuncio/${c.anuncio_id}`}
                    className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-surface-300 sm:px-5"
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-label">{c.titulo}</span>
                      <span className="text-body-sm text-ink-muted">
                        {c.autor_nome} · {c.bairro} · curtiu {tempoRelativo(c.curtido_em, agora)}
                      </span>
                    </span>
                    <Etapas feitas={a.feitas} atual={a.atual} rotulo={a.texto} />
                    <span
                      className={`text-body-sm ${
                        a.fim
                          ? "text-ink-muted"
                          : a.feitas >= 2 || esperaCurriculo(c)
                            ? "font-semibold text-cerrado-text"
                            : "text-ink"
                      }`}
                    >
                      {a.texto}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section
            aria-labelledby="seu-curriculo"
            className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
          >
            <h2 id="seu-curriculo" className="text-h3">
              Seu currículo
            </h2>
            {!forca ? (
              <p className="text-body-sm text-ink-muted">Não deu para ver agora.</p>
            ) : (
              <>
                <p className="flex items-baseline gap-2">
                  <span className="font-display text-h2 leading-none tabular-nums">{forca.pontos}%</span>
                  <span className="text-body-sm text-ink-muted">completo</span>
                </p>
                <span aria-hidden className="flex h-2 overflow-hidden rounded-pill bg-surface-300">
                  <span
                    className={forca.pontos >= 80 ? "bg-cerrado" : "bg-ipe"}
                    style={{ width: `${forca.pontos}%` }}
                  />
                </span>
                <p className="text-body-sm text-ink-muted">
                  {forca.dica ??
                    (curriculo?.c ? `Completo. Atualizado ${tempoRelativo(curriculo.c.atualizado_em, agora)}.` : "")}
                </p>
                <Link
                  href="/perfil/curriculo"
                  className="self-start text-label underline underline-offset-2 hover:text-terra-text"
                >
                  {curriculo?.c ? "Melhorar o currículo" : "Montar o currículo"}
                </Link>
                {curriculo?.c && (
                  <p className="border-t border-line pt-3 text-body-sm text-ink-muted">
                    {visivel ? (
                      "Empresas com vagas na sua cidade podem achar seu currículo e convidar você."
                    ) : (
                      <>
                        Quer ser convidado para vagas?{" "}
                        <Link href="/perfil/curriculo#talentos-titulo" className="font-semibold text-ink underline">
                          Deixe as empresas encontrarem você
                        </Link>
                        .
                      </>
                    )}
                  </p>
                )}
              </>
            )}
          </section>

          <nav aria-label="Atalhos de quem procura trabalho" className="flex flex-col gap-2">
            <Atalho icone={Search} href="/?tipo=vaga&ordem=combina" titulo="Vagas que combinam com você" />
            <Atalho icone={Bell} href="/painel/seguindo" titulo="Avisos de vagas e quem você segue" />
            {salvas ? (
              <Atalho
                icone={Star}
                href="/descobrir?aba=salvas"
                titulo={`${plural(salvas, "vaga salva", "vagas salvas")} para decidir`}
              />
            ) : null}
          </nav>
        </aside>
      </div>
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
  conversas: Conversa[] | null;
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
  cartoes.push(...cartoesDaConta(perfil, conversas, (c) => c.papel === "publiquei" && c.anuncio_tipo === "servico"));
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
