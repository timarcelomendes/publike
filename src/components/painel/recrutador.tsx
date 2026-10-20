import {
  Building2,
  CalendarClock,
  ChevronRight,
  Clock,
  Hourglass,
  Link2,
  Megaphone,
  MessageCircleReply,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserRoundX,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Selo, Vazio } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { hojeEmBrasilia, situacaoDaColocacao } from "@/lib/colocacoes";
import { esperaResposta, STATUS_ANUNCIO } from "@/lib/constantes";
import { obterAnuncio, respostaDeQuemPublica } from "@/lib/dados";
import { ateQuando, formatarMoeda, formatarNumero, plural } from "@/lib/formato";
import { dataDaEntrevista, SITUACOES_ENTREVISTA } from "@/lib/recrutamento";
import { comoResponde } from "@/lib/resposta";
import type { Saude } from "@/lib/saude-vaga";
import { colocacoesDasVagas } from "@/lib/servidor/colocacoes";
import { saudeDasVagas } from "@/lib/servidor/saude";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { MeuAnuncio, StatusAnuncio } from "@/lib/tipos";
import { NumeroHoje, ParaFazerAgora, Saudacao, type Cartao } from "./hoje";
import { NivelDaSaude } from "./saude-vaga";

// Hoje, no modo Contratar (comércio, empresa e agência): o que pede você agora em
// cartões com a ação no próprio cartão, os números da semana (com o tempo de resposta
// que aparece nas suas vagas), cada vaga com o funil e o que pede atenção, e a agenda.

type Candidato = {
  anuncio_id: string;
  perfil_id: string;
  nome: string;
  status: string;
  curtido_em: string;
  etapa: string;
  etapa_em: string | null;
  /** aceito, esperando o currículo (não espera mais resposta sua) */
  aceita_em?: string | null;
};

const DIA = 24 * 3600e3;

async function dadosExtras(vagas: string[], agora: number) {
  if (!vagas.length) return { visitas: new Map<string, number>(), entrevistas: [] as EntrevistaPainel[] };
  const supabase = await criarClienteServidor();
  const [{ data: visitas }, { data: entrevistas }] = await Promise.all([
    supabase.from("anuncio_visitas").select("anuncio_id, total").in("anuncio_id", vagas),
    supabase
      .from("entrevistas")
      .select("id, anuncio_id, perfil_id, quando, situacao")
      .in("anuncio_id", vagas)
      .in("situacao", ["marcada", "confirmada", "remarcar"])
      .gte("quando", new Date(agora - 2 * 3600e3).toISOString())
      .order("quando")
      .limit(50),
  ]);
  return {
    visitas: new Map((visitas ?? []).map((v) => [v.anuncio_id, v.total])),
    entrevistas: (entrevistas ?? []) as EntrevistaPainel[],
  };
}

type EntrevistaPainel = { id: string; anuncio_id: string; perfil_id: string; quando: string; situacao: string };

export async function PainelRecrutador({
  nome,
  autorId,
  anuncios,
  candidatos,
  agora,
  clientes = null,
  extras = [],
}: {
  nome: string;
  autorId: string;
  anuncios: MeuAnuncio[] | null;
  candidatos: Candidato[] | null;
  agora: number;
  /** agência: quantos clientes estão na lista (null: não é agência) */
  clientes?: number | null;
  /** outros "para fazer agora" da conta (as conexões: pedidos e mensagens novas) */
  extras?: Cartao[];
}) {
  const vagas = (anuncios ?? []).filter((a) => a.tipo === "vaga");
  const servicos = (anuncios ?? []).filter((a) => a.tipo === "servico");
  const todos = candidatos ?? [];
  const noAr = vagas.filter((a) => a.status === "ativo" && new Date(a.expira_em).getTime() > agora);
  const [{ visitas, entrevistas }, respostas, completas, colocacoes] = await Promise.all([
    dadosExtras(
      vagas.map((v) => v.id),
      agora,
    ),
    respostaDeQuemPublica([autorId]).catch(() => new Map()),
    Promise.all(noAr.map((v) => obterAnuncio(v.id).catch(() => null))),
    // agência: as colocações (garantias e taxas a receber)
    typeof clientes === "number" ? colocacoesDasVagas().then((m) => [...m.values()]) : Promise.resolve([]),
  ]);
  // a saúde das vagas no ar: a mesma do quadro de cada vaga
  const saudes = await saudeDasVagas(
    completas.filter((a): a is NonNullable<typeof a> => a !== null),
    todos,
    agora,
  ).catch(() => new Map<string, Saude>());
  const resposta = respostas.get(autorId) ?? null;
  const nomeDe = new Map(todos.map((c) => [c.perfil_id, c.nome]));
  const tituloDe = new Map(vagas.map((v) => [v.id, v.titulo]));

  const ultimos7 = todos.filter((c) => agora - new Date(c.curtido_em).getTime() < 7 * DIA).length;
  const pendentes = todos.filter(esperaResposta);
  const antigos = pendentes.filter((c) => agora - new Date(c.curtido_em).getTime() > 2 * DIA);
  const contratados = todos.filter((c) => c.etapa === "contratado" && c.status === "match");
  const dias = contratados
    .filter((c) => c.etapa_em)
    .map((c) => (new Date(c.etapa_em as string).getTime() - new Date(c.curtido_em).getTime()) / DIA);
  const tempoMedio = dias.length ? Math.max(0, Math.round(dias.reduce((a, b) => a + b, 0) / dias.length)) : null;
  const semana = entrevistas.filter((e) => new Date(e.quando).getTime() <= agora + 7 * DIA);

  // ------------------------------------------------------------ para fazer agora
  const proximas = entrevistas.filter((e) => new Date(e.quando).getTime() <= agora + 2 * DIA);
  const remarcar = entrevistas.filter((e) => e.situacao === "remarcar");
  const comEntrevista = new Set(entrevistas.map((e) => `${e.anuncio_id}:${e.perfil_id}`));
  const semData = todos.filter(
    (c) => c.etapa === "entrevista" && c.status === "match" && !comEntrevista.has(`${c.anuncio_id}:${c.perfil_id}`),
  );
  const diasNoAr = (a: MeuAnuncio) => Math.ceil((new Date(a.expira_em).getTime() - agora) / DIA);
  const vencendo = vagas.filter((a) => a.status === "ativo" && diasNoAr(a) <= 5 && diasNoAr(a) >= 0);
  const paradas = noAr.filter((a) => a.curtidas_total === 0 && agora - new Date(a.criado_em).getTime() > 7 * DIA);
  const quadroDe = (ids: string[], seVarias: string) => {
    const unicos = [...new Set(ids)];
    return unicos.length === 1 ? `/painel/anuncio/${unicos[0]}/quadro` : seVarias;
  };
  const primeiroNome = (id: string) => (nomeDe.get(id) ?? "").split(" ")[0];

  const cartoes: Cartao[] = [];
  if (pendentes.length) {
    cartoes.push({
      icone: Clock,
      tom: "urgente",
      quando: antigos.length ? "Mais urgente" : "Esperando você",
      titulo: `${plural(pendentes.length, "candidato esperando", "candidatos esperando")} sua resposta`,
      texto: antigos.length
        ? `${plural(antigos.length, "espera", "esperam")} há mais de 2 dias. Responder em até 1 dia mostra o selo verde nas suas vagas.`
        : "Aceite quem interessa ou dispense com um toque: a pessoa recebe o aviso.",
      href: "/painel/caixa?aba=responder",
      acao: "Responder agora",
    });
  }
  if (proximas.length) {
    const e = proximas[0];
    cartoes.push({
      icone: CalendarClock,
      quando: dataDaEntrevista(e.quando),
      titulo:
        proximas.length === 1
          ? `Entrevista com ${primeiroNome(e.perfil_id) || "o candidato"}`
          : `${proximas.length} entrevistas nos próximos 2 dias`,
      texto:
        proximas.length === 1
          ? `${tituloDe.get(e.anuncio_id) ?? "Vaga"} · ${(SITUACOES_ENTREVISTA[e.situacao] ?? SITUACOES_ENTREVISTA.marcada).nome.toLowerCase()}`
          : proximas
              .slice(0, 3)
              .map((x) => `${primeiroNome(x.perfil_id)} ${dataDaEntrevista(x.quando)}`)
              .join(" · "),
      href: quadroDe(
        proximas.map((x) => x.anuncio_id),
        "/painel/candidatos?etapa=entrevista",
      ),
      acao: "Ver no quadro",
    });
  }
  if (remarcar.length) {
    cartoes.push({
      icone: RefreshCw,
      quando: "Pedido de outro horário",
      titulo: `${plural(remarcar.length, "candidato pediu", "candidatos pediram")} outro horário`,
      texto: "Abra o cartão e marque um novo dia: a pessoa recebe o aviso.",
      href: quadroDe(
        remarcar.map((x) => x.anuncio_id),
        "/painel/candidatos?etapa=entrevista",
      ),
      acao: "Remarcar",
    });
  }
  if (semData.length) {
    cartoes.push({
      icone: CalendarClock,
      quando: "Sem data",
      titulo: `${plural(semData.length, "candidato", "candidatos")} em Entrevista sem data marcada`,
      texto: "Marque dia e hora: o candidato recebe o aviso e confirma pelo Publike.",
      href: quadroDe(
        semData.map((c) => c.anuncio_id),
        "/painel/candidatos?etapa=entrevista",
      ),
      acao: "Marcar a data",
    });
  }
  if (vencendo.length) {
    const d = Math.min(...vencendo.map(diasNoAr));
    cartoes.push({
      icone: Hourglass,
      quando: d <= 0 ? "Hoje" : d === 1 ? "Amanhã" : `Em ${d} dias`,
      titulo: vencendo.length === 1 ? `${vencendo[0].titulo} sai do ar` : `${vencendo.length} vagas saem do ar`,
      texto: "Renove para continuar recebendo candidatos, ou marque como preenchida se já contratou.",
      href: "/painel/anuncios?tipo=vaga",
      acao: "Renovar",
    });
  }
  if (paradas.length) {
    cartoes.push({
      icone: Megaphone,
      quando: "Uma semana sem curtidas",
      titulo: `${plural(paradas.length, "vaga", "vagas")} sem candidatos`,
      texto:
        "Divulgue o link da sua página de vagas no WhatsApp e no Instagram, ou revise o título, o salário e o horário.",
      href: "/painel/anuncios?tipo=vaga#pagina-de-vagas",
      acao: "Divulgar",
    });
  }

  // agência: reposição (saiu dentro da garantia, no último mês), garantia acabando e taxas a receber
  const hoje = hojeEmBrasilia(agora);
  const comSituacao = colocacoes.map((c) => ({ c, s: situacaoDaColocacao(c, hoje) }));
  const umMesAtras = hojeEmBrasilia(agora - 30 * DIA);
  const reposicoes = comSituacao.filter(({ c, s }) => s.tipo === "reposicao" && (c.saiu_em ?? "") >= umMesAtras);
  const acabando = comSituacao.filter(({ s }) => s.tipo === "garantia" && s.faltam <= 7);
  const aReceber = colocacoes.filter((c) => !c.paga && (c.taxa ?? 0) > 0);
  const naColocacao = (c: { anuncio_id: string; perfil_id: string }) =>
    `/painel/anuncio/${c.anuncio_id}/quadro?candidato=${c.perfil_id}`;
  if (reposicoes.length) {
    const { c } = reposicoes[0];
    cartoes.push({
      icone: UserRoundX,
      tom: "urgente",
      quando: "Reposição",
      titulo:
        reposicoes.length === 1
          ? `${primeiroNome(c.perfil_id) || "Um contratado"} saiu dentro da garantia`
          : `${reposicoes.length} contratados saíram dentro da garantia`,
      texto: "Reponha para o cliente: chame outro finalista ou publique a vaga de novo.",
      href: reposicoes.length === 1 ? naColocacao(c) : "/painel/clientes",
      acao: "Ver",
    });
  }
  if (acabando.length) {
    const prox = acabando.reduce((a, b) =>
      a.s.tipo === "garantia" && b.s.tipo === "garantia" && b.s.faltam < a.s.faltam ? b : a,
    );
    const faltam = prox.s.tipo === "garantia" ? prox.s.faltam : 0;
    cartoes.push({
      icone: ShieldCheck,
      quando: faltam === 0 ? "Hoje" : faltam === 1 ? "Amanhã" : `Em ${faltam} dias`,
      titulo:
        acabando.length === 1
          ? `A garantia de ${primeiroNome(prox.c.perfil_id) || "um contratado"} acaba`
          : `${acabando.length} garantias acabam nesta semana`,
      texto: "Bom momento para falar com o cliente e confirmar que deu tudo certo.",
      href: acabando.length === 1 ? naColocacao(prox.c) : "/painel/clientes",
      acao: "Ver",
    });
  }
  if (aReceber.length) {
    cartoes.push({
      icone: Wallet,
      quando: "A receber",
      titulo: `${formatarMoeda(aReceber.reduce((s, c) => s + (c.taxa ?? 0), 0))} em taxas a receber`,
      texto: `${plural(aReceber.length, "colocação", "colocações")} sem o pagamento marcado. Marque na colocação quando receber.`,
      href: "/painel/clientes",
      acao: "Ver os clientes",
    });
  }
  cartoes.push(...extras);

  const responde = resposta ? comoResponde(resposta) : null;

  return (
    <div className="flex flex-col gap-8">
      <Saudacao
        nome={nome}
        agora={agora}
        pendencias={cartoes.length}
        acao={
          <BotaoLink href="/publicar" variante="primario" tamanho="sm">
            <Plus aria-hidden />
            Publicar vaga
          </BotaoLink>
        }
      />

      {vagas.length === 0 ? (
        <Vazio
          icone={Megaphone}
          titulo="Publique a primeira vaga"
          acao={<BotaoLink href="/publicar">Publicar vaga grátis</BotaoLink>}
        >
          Grátis, sem limite de candidatos. Quem mora perto vê primeiro, e você acompanha tudo aqui: candidatos, % de
          match, entrevistas e contratações.
        </Vazio>
      ) : (
        <>
          <ParaFazerAgora
            itens={cartoes}
            vazio="Tudo em dia: ninguém esperando por você agora. Quando alguém curtir uma vaga, aparece aqui."
          />

          <section aria-label="Números do recrutamento" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <NumeroHoje
              nome="Tempo de resposta"
              valor={responde && resposta?.horas != null ? prazoCurto(resposta.horas) : "–"}
              selo={responde?.bom ? "Selo ativo" : undefined}
              ajuda={responde ? responde.texto : "Aparece com 5 curtidas: quanto antes responder, melhor"}
            />
            <NumeroHoje
              nome="Candidatos novos"
              valor={formatarNumero(ultimos7)}
              ajuda={`nos últimos 7 dias · ${formatarNumero(todos.length)} no total`}
              href="/painel/candidatos"
            />
            <NumeroHoje
              nome="Entrevistas"
              valor={formatarNumero(semana.length)}
              ajuda="nos próximos 7 dias"
              href="/painel/candidatos?etapa=entrevista"
            />
            <NumeroHoje
              nome="Contratados"
              valor={formatarNumero(contratados.length)}
              ajuda={
                tempoMedio === null
                  ? "Da curtida ao sim: –"
                  : `Em média ${plural(tempoMedio, "dia", "dias")} da curtida ao sim`
              }
              href="/painel/candidatos?etapa=contratado"
            />
          </section>

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section aria-labelledby="suas-vagas" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="suas-vagas" className="text-h3">
                  Suas vagas
                </h2>
                <Link
                  href="/painel/anuncios?tipo=vaga"
                  className="text-label text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  Gerenciar vagas
                </Link>
              </div>
              <ul className="flex flex-col gap-3">
                {vagas.map((v) => {
                  const daVaga = todos.filter((c) => c.anuncio_id === v.id);
                  const status = v.status as StatusAnuncio;
                  const responder = daVaga.filter(esperaResposta).length;
                  const entrevista = daVaga.filter((c) => c.etapa === "entrevista" && c.status === "match").length;
                  const contratado = daVaga.filter((c) => c.etapa === "contratado" && c.status === "match").length;
                  const total = Math.max(daVaga.length, 1);
                  const ativa = status === "ativo";
                  const saude = ativa ? saudes.get(v.id) : undefined;
                  const atencao = saude && saude.nivel !== "boa" ? (saude.faltando[0]?.dica ?? null) : null;
                  return (
                    <li key={v.id}>
                      <Link
                        href={`/painel/anuncio/${v.id}/quadro`}
                        className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card transition-colors hover:border-line-strong sm:p-5"
                      >
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-display text-h3">{v.titulo}</span>
                          <Selo variante={ativa ? "match" : "contorno"}>{STATUS_ANUNCIO[status]?.nome ?? status}</Selo>
                          <span className="text-body-sm text-ink-muted">
                            {ativa ? `${ateQuando(v.expira_em)} · ` : ""}
                            {plural(visitas.get(v.id) ?? 0, "visita", "visitas")} ·{" "}
                            {plural(daVaga.length, "candidato", "candidatos")}
                          </span>
                          {saude && (
                            <span className="ml-auto">
                              <NivelDaSaude s={saude} />
                            </span>
                          )}
                        </span>
                        {daVaga.length > 0 && (
                          <span aria-hidden className="flex h-2.5 overflow-hidden rounded-pill bg-surface-300">
                            <span className="bg-terra" style={{ width: `${(100 * responder) / total}%` }} />
                            <span className="bg-ipe" style={{ width: `${(100 * entrevista) / total}%` }} />
                            <span className="bg-cerrado" style={{ width: `${(100 * contratado) / total}%` }} />
                          </span>
                        )}
                        <span className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-ink-muted">
                          <span>
                            <strong className={responder ? "text-terra-text" : "text-ink"}>{responder}</strong> para
                            responder
                          </span>
                          <span>
                            <strong className="text-ink">{entrevista}</strong> em entrevista
                          </span>
                          <span>
                            <strong className="text-ink">{contratado}</strong>{" "}
                            {contratado === 1 ? "contratado" : "contratados"}
                          </span>
                          <span className="ml-auto inline-flex items-center gap-0.5 font-semibold text-ink">
                            Abrir o quadro
                            <ChevronRight aria-hidden className="size-4" />
                          </span>
                        </span>
                        {atencao && <span className="text-body-sm text-terra-text">{atencao}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>

            <aside className="flex flex-col gap-4">
              <section
                aria-labelledby="agenda"
                className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
              >
                <h2 id="agenda" className="text-h3">
                  Agenda da semana
                </h2>
                {semana.length === 0 ? (
                  <p className="text-body-sm text-ink-muted">
                    Nenhuma entrevista marcada. No quadro da vaga, leve o candidato para Entrevista e marque o dia.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {semana.slice(0, 6).map((e) => {
                      const s = SITUACOES_ENTREVISTA[e.situacao] ?? SITUACOES_ENTREVISTA.marcada;
                      return (
                        <li key={e.id}>
                          <Link
                            href={`/painel/anuncio/${e.anuncio_id}/quadro`}
                            className="flex flex-col gap-1 rounded-md p-1 hover:bg-surface-300"
                          >
                            <span className="text-label tabular-nums">{dataDaEntrevista(e.quando)}</span>
                            <span className="text-body-sm">
                              <span className="font-semibold">{nomeDe.get(e.perfil_id) ?? "Candidato"}</span>
                              <span className="text-ink-muted"> · {tituloDe.get(e.anuncio_id)}</span>
                            </span>
                            <Selo variante={s.tom} className="self-start">
                              {s.nome}
                            </Selo>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section aria-labelledby="selo" className="flex flex-col gap-2 rounded-lg bg-surface-300 p-4 sm:p-5">
                <h2 id="selo" className="text-h3">
                  Seu selo na busca
                </h2>
                {responde ? (
                  <>
                    <p
                      className={`flex items-center gap-2 text-label ${responde.bom ? "text-cerrado-text" : "text-ink"}`}
                    >
                      <MessageCircleReply aria-hidden className="size-4 shrink-0" />
                      {responde.texto}
                    </p>
                    <span aria-hidden className="flex h-2 overflow-hidden rounded-pill bg-line">
                      <span
                        className={responde.bom ? "bg-cerrado" : "bg-ipe"}
                        style={{ width: `${Math.round(100 * (resposta?.taxa ?? 0))}%` }}
                      />
                    </span>
                    <p className="text-body-sm text-ink-muted">
                      Quem procura vê isso no cartão das suas vagas.
                      {pendentes.length > 0 && " Responda quem espera para manter o selo."}
                    </p>
                  </>
                ) : (
                  <p className="text-body-sm text-ink-muted">
                    Com 5 curtidas nas suas vagas, quem procura passa a ver quanto você costuma responder. Responder em
                    até 1 dia dá o selo verde.
                  </p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      <section aria-label="Mais" className="grid gap-3 sm:grid-cols-3">
        <Atalho
          icone={Link2}
          href="/painel/anuncios?tipo=vaga#pagina-de-vagas"
          titulo="Sua página de vagas"
          texto="O link com todas as vagas e o código para o site da empresa."
        />
        <Atalho
          icone={Users}
          href="/painel/candidatos"
          titulo="Todos os candidatos"
          texto="De todas as vagas juntas, com busca e planilha."
        />
        {clientes !== null ? (
          <Atalho
            icone={Building2}
            href="/painel/clientes"
            titulo="Seus clientes"
            texto={
              clientes > 0
                ? `${plural(clientes, "cliente", "clientes")}, com as vagas, os candidatos e a planilha de cada um.`
                : "Cadastre as empresas para quem você seleciona: ao publicar, é só escolher."
            }
          />
        ) : servicos.length ? (
          <Atalho
            icone={Store}
            href="/painel/anuncios?tipo=servico"
            titulo="Seus serviços"
            texto={`${plural(servicos.length, "serviço", "serviços")} na vitrine.`}
          />
        ) : (
          <Atalho
            icone={Search}
            href="/painel/curtidas"
            titulo="O que você curtiu"
            texto="Serviços e vagas que você pediu ou curtiu."
          />
        )}
      </section>
    </div>
  );
}

/** "no mesmo dia", "1 dia", "3 dias" (o valor grande do tempo de resposta). */
function prazoCurto(horas: number) {
  if (horas < 24) return "No dia";
  const dias = Math.round(horas / 24);
  return dias <= 1 ? "1 dia" : `${dias} dias`;
}

function Atalho({
  icone: Icone,
  href,
  titulo,
  texto,
}: {
  icone: LucideIcon;
  href: string;
  titulo: string;
  texto: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-full items-start gap-3 rounded-lg border border-line bg-surface-200 p-4 transition-colors hover:border-line-strong"
    >
      <Icone aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-muted" />
      <span className="min-w-0">
        <span className="block text-label">{titulo}</span>
        <span className="block text-body-sm text-ink-muted">{texto}</span>
      </span>
    </Link>
  );
}
