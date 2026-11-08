import {
  CalendarClock,
  Clock,
  FileCheck2,
  Hourglass,
  Inbox,
  Megaphone,
  MessageCircleReply,
  RefreshCw,
  Send,
  ShieldCheck,
  UserSearch,
  UsersRound,
  UserRoundX,
  Wallet,
} from "lucide-react";
import { hojeEmBrasilia, situacaoDaColocacao } from "@/lib/colocacoes";
import { abaDaEtapa, esperaResposta, STATUS_ANUNCIO } from "@/lib/constantes";
import { respostaDeQuemPublica } from "@/lib/dados";
import { ateQuando, formatarMoeda, plural } from "@/lib/formato";
import { dataDaEntrevista, SITUACOES_ENTREVISTA } from "@/lib/recrutamento";
import { comoResponde } from "@/lib/resposta";
import { colocacoesDasVagas } from "@/lib/servidor/colocacoes";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { MeuAnuncio, StatusAnuncio } from "@/lib/tipos";
import type { ConversaPessoa } from "@/lib/conversas";
import { caminhoDaConta, type Caminho } from "@/lib/servidor/caminho";
import { ComecePorAqui, type PrimeiroPasso } from "./caminho-hoje";
import { ParaFazerAgora, Saudacao, type Cartao } from "./hoje";
import { Agora, type ItemAgora } from "./agora";
import { pedidosDaAgencia, resumoDosPedidos } from "@/lib/servidor/pedidos-do-cliente";
import { indicadosDasVagas } from "@/lib/servidor/indicacao";
import { documentosPendentesDaConta } from "@/lib/servidor/documentos-admissao";
import { NumerosDoHoje, type NumeroDoHoje } from "./numeros-hoje";
import { ConviteNotificacoes } from "@/components/convite-notificacoes";
import { vapidPublica } from "@/lib/servidor/ambiente";
import { TabelaDasVagas, type GrupoDeVagas, type LinhaDaVaga } from "./tabela-vagas";

// Hoje, no modo Contratar (comércio, empresa e agência), pelo caminho da vaga:
//   agência ............ Clientes → Vagas → Candidatos → Para o cliente → Contratados
//   comércio e empresa . Vagas → Candidatos → Entrevistas → Contratados
// No topo, um resumo e as ações principais; a faixa com o número de cada passo e o passo
// que pede você; o que fazer agora (com a ação no cartão); os clientes (agência) ou as
// vagas; ao lado, os links para mandar, a agenda e a equipe. Conta nova: "Comece por aqui".

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
  if (!vagas.length)
    return {
      visitas: new Map<string, number>(),
      entrevistas: [] as EntrevistaPainel[],
      passadas: [] as EntrevistaPainel[],
    };
  const supabase = await criarClienteServidor();
  const [{ data: visitas }, { data: entrevistas }, { data: passadas }] = await Promise.all([
    supabase.from("anuncio_visitas").select("anuncio_id, total").in("anuncio_id", vagas),
    supabase
      .from("entrevistas")
      .select("id, anuncio_id, perfil_id, quando, situacao")
      .in("anuncio_id", vagas)
      .in("situacao", ["marcada", "confirmada", "remarcar"])
      .gte("quando", new Date(agora - 2 * 3600e3).toISOString())
      .order("quando")
      .limit(50),
    // as que já aconteceram (30 dias): quem foi entrevistado e espera a decisão
    supabase
      .from("entrevistas")
      .select("id, anuncio_id, perfil_id, quando, situacao")
      .in("anuncio_id", vagas)
      .in("situacao", ["marcada", "confirmada"])
      .lt("quando", new Date(agora).toISOString())
      .gte("quando", new Date(agora - 30 * 864e5).toISOString())
      .limit(200),
  ]);
  return {
    visitas: new Map((visitas ?? []).map((v) => [v.anuncio_id, v.total])),
    entrevistas: (entrevistas ?? []) as EntrevistaPainel[],
    passadas: (passadas ?? []) as EntrevistaPainel[],
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
  perfilPronto = true,
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
  /** as conversas da conta (as mensagens novas entram no Agora pelos extras; a lista fica no menu Mensagens) */
  conversas?: ConversaPessoa[] | null;
  /** o perfil já tem o que precisa (agência: o CNPJ; empresa: foto ou descrição) */
  perfilPronto?: boolean;
}) {
  const agencia = typeof clientes === "number";
  const vagas = (anuncios ?? []).filter((a) => a.tipo === "vaga");
  const todos = candidatos ?? [];
  const noAr = vagas.filter((a) => a.status === "ativo" && new Date(a.expira_em).getTime() > agora);
  const [{ visitas, entrevistas, passadas }, respostas, colocacoes, caminho, documentos, pedidosAg] = await Promise.all([
    dadosExtras(
      vagas.map((v) => v.id),
      agora,
    ),
    respostaDeQuemPublica([autorId]).catch(() => new Map()),
    // agência: as colocações (garantias e taxas a receber)
    agencia ? colocacoesDasVagas().then((m) => [...m.values()]) : Promise.resolve([]),
    caminhoDaConta(),
    // os documentos da admissão de quem começa (parte 4; sem a migração, nada)
    documentosPendentesDaConta().catch(() => []),
    // agência: os prazos dos finalistas cumpridos em 90 dias, somando os clientes (sem a migração, nada)
    // e os pedidos com o prazo dos finalistas de cada vaga
    agencia ? pedidosDaAgencia().catch(() => null) : Promise.resolve(null),
  ]);
  const noPrazo = pedidosAg?.noPrazo ?? null;
  // agência: o prazo dos finalistas de cada vaga ligada a um pedido ainda sem finalistas ("Finalistas até")
  const prazoDaVaga = new Map<string, string>();
  for (const p of pedidosAg?.pedidos ?? []) {
    if (p.vaga && p.finalistas_ate && !p.finalistas_em && (p.situacao === "recebido" || p.situacao === "em_selecao")) {
      prazoDaVaga.set(p.vaga.id, p.finalistas_ate);
    }
  }
  const resposta = respostas.get(autorId) ?? null;
  const nomeDe = new Map(todos.map((c) => [c.perfil_id, c.nome]));
  const tituloDe = new Map(vagas.map((v) => [v.id, v.titulo]));

  const pendentes = todos.filter(esperaResposta);
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

  // quem já foi entrevistado e espera a decisão (um item do Agora)
  const naEntrevista = new Set(
    todos.filter((c) => c.etapa === "entrevista" && c.status === "match").map((c) => `${c.anuncio_id}:${c.perfil_id}`),
  );
  const paraDecidir = new Set(
    passadas
      .filter((e) => naEntrevista.has(`${e.anuncio_id}:${e.perfil_id}`))
      .map((e) => `${e.anuncio_id}:${e.perfil_id}`),
  ).size;

  const cartoes: ItemAgora[] = [];
  // agência: os pedidos de vaga dos clientes (migração 20270307120000; sem ela, nada)
  const pedidos = agencia ? await resumoDosPedidos().catch(() => null) : null;
  if (pedidos?.novos) {
    cartoes.push({
      icone: Inbox,
      tom: "urgente",
      quando: "Agora",
      titulo: plural(pedidos.novos, "pedido de vaga novo dos clientes", "pedidos de vaga novos dos clientes"),
      texto: "Aceite com o prazo dos finalistas ou recuse com o motivo: o cliente vê pelo link dele.",
      href: "/painel/pedidos",
      acao: "Responder o pedido",
    });
  }
  if (pendentes.length) {
    // por vaga: "Atendente: 4. Caixa: 2." e há quanto tempo espera o mais antigo
    const porVaga = new Map<string, number>();
    for (const c of pendentes) porVaga.set(c.anuncio_id, (porVaga.get(c.anuncio_id) ?? 0) + 1);
    const maisAntigo = Math.min(...pendentes.map((c) => new Date(c.curtido_em).getTime()));
    const dias = Math.floor((agora - maisAntigo) / DIA);
    cartoes.push({
      icone: Clock,
      tom: "urgente",
      principal: true,
      quando: "Agora",
      titulo: `${plural(pendentes.length, "candidato espera", "candidatos esperam")} a sua resposta`,
      texto: `${[...porVaga]
        .slice(0, 3)
        .map(([id, n]) => `${tituloDe.get(id) ?? "Vaga"}: ${n}`)
        .join(". ")}.${dias >= 1 ? ` O mais antigo curtiu há ${plural(dias, "dia", "dias")}.` : ""}`,
      href: "/painel/caixa/triagem",
      acao: "Decidir agora",
      // quem espera há mais tempo primeiro: as iniciais no cartão escuro
      pessoas: [...pendentes]
        .sort((a, b) => Date.parse(a.curtido_em) - Date.parse(b.curtido_em))
        .slice(0, 3)
        .map((c) => c.nome.split(" ")[0]),
    });
  }
  // os documentos da admissão de quem começa em até 3 dias (ou já começou): o que falta, ou baixar para o contador
  const hojeBr = hojeEmBrasilia(agora);
  const diasAte = (dia: string) => Math.round((Date.parse(`${dia}T12:00:00Z`) - Date.parse(`${hojeBr}T12:00:00Z`)) / DIA);
  const quandoComeca = (dia: string) => {
    const d = diasAte(dia);
    return d < 0 ? "Já começou" : d === 0 ? "Hoje" : d === 1 ? "Amanhã" : `Em ${d} dias`;
  };
  const docsPerto = documentos.filter((d) => d.total > 0 && diasAte(d.inicio) <= 3);
  if (docsPerto.length) {
    const d = docsPerto[0];
    const faltam = (x: (typeof documentos)[number]) => x.total - x.enviados - x.levar;
    cartoes.push({
      icone: FileCheck2,
      quando: quandoComeca(d.inicio),
      titulo:
        docsPerto.length === 1
          ? `Documentos de ${d.nome}: ${d.enviados + d.levar} de ${d.total}`
          : `Documentos de ${docsPerto.length} contratados`,
      texto:
        docsPerto.length === 1
          ? faltam(d) > 0
            ? `${d.vaga} · falta ${plural(faltam(d), "item", "itens")}. ${d.nome} recebe o lembrete 2 dias antes.`
            : `${d.vaga} · a lista está completa: baixe para o contador.`
          : docsPerto
              .slice(0, 3)
              .map((x) => `${x.nome} ${x.enviados + x.levar} de ${x.total}`)
              .join(" · "),
      href: `/painel/anuncio/${d.anuncioId}/quadro?candidato=${d.perfilId}`,
      acao: "Ver os documentos",
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
        "/painel/caixa?aba=entrevista",
      ),
      acao: "Ver no quadro",
    });
  }
  if (paraDecidir > 0) {
    cartoes.push({
      icone: Hourglass,
      quando: "Hoje",
      titulo: `${plural(paraDecidir, "entrevistado espera", "entrevistados esperam")} a sua decisão`,
      texto: "Leve para Contratado, faça a proposta ou dê o retorno: a pessoa fica sabendo.",
      href: "/painel/caixa?aba=entrevista",
      acao: "Decidir",
    });
  }
  if (remarcar.length) {
    cartoes.push({
      icone: RefreshCw,
      quando: "Agora",
      titulo: `${plural(remarcar.length, "candidato pediu", "candidatos pediram")} outro horário`,
      texto: "Abra o cartão e marque um novo dia: a pessoa recebe o aviso.",
      href: quadroDe(
        remarcar.map((x) => x.anuncio_id),
        "/painel/caixa?aba=entrevista",
      ),
      acao: "Remarcar",
    });
  }
  if (semData.length) {
    cartoes.push({
      icone: CalendarClock,
      quando: "Hoje",
      titulo: `${plural(semData.length, "candidato", "candidatos")} em Entrevista sem data marcada`,
      texto: "Marque dia e hora: o candidato recebe o aviso e confirma pelo Publike.",
      href: quadroDe(
        semData.map((c) => c.anuncio_id),
        "/painel/caixa?aba=entrevista",
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
      quando: "Na semana",
      titulo: `${plural(paradas.length, "vaga", "vagas")} sem candidatos`,
      texto: "Mande o link no WhatsApp, peça indicação a quem já trabalha com você ou revise o título, o salário e o horário.",
      href: "/painel/links",
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
      quando: "Agora",
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
      quando: "Na semana",
      titulo: `${formatarMoeda(aReceber.reduce((s, c) => s + (c.taxa ?? 0), 0))} em taxas a receber`,
      texto: `${plural(aReceber.length, "colocação", "colocações")} sem o pagamento marcado. Marque na colocação quando receber.`,
      href: "/painel/clientes",
      acao: "Ver os clientes",
    });
  }
  // agência: os finalistas (prontos para mandar, o cliente abriu e não respondeu, o cliente respondeu)
  const finalistasNoPrazo: ItemAgora[] = [];
  const textoDoPrazo = (dia: string) => {
    const d = diasAte(dia);
    return d < 0
      ? "o prazo do cliente venceu"
      : d === 0
        ? "o prazo do cliente vence hoje"
        : d === 1
          ? "o prazo do cliente vence amanhã"
          : d <= 6
            ? `o prazo do cliente vence em ${d} dias`
            : `o prazo do cliente é ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  };
  const nomeDoCliente = new Map(caminho.listaClientes.map((c) => [c.id, c.nome]));
  const paraQuem = (v: Caminho["vagas"][number]) =>
    (v.clienteId ? nomeDoCliente.get(v.clienteId) : null) ?? "o cliente";
  if (agencia) {
    const comProntos = caminho.vagas.filter(
      (v) => v.prontos.length > 0 && (v.anuncio.status === "ativo" || v.anuncio.status === "pausado"),
    );
    for (const v of comProntos.slice(0, 2)) {
      const nomes = v.prontos.slice(0, 2).map((c) => c.nome.split(" ")[0]);
      // com o prazo do cliente perto (até 2 dias), vai para o alto do "Para fazer", antes dos pedidos novos
      const prazo = prazoDaVaga.get(v.anuncio.id);
      const perto = prazo !== undefined && diasAte(prazo) <= 2;
      (perto ? finalistasNoPrazo : cartoes).push({
        icone: Send,
        tom: perto ? "urgente" : undefined,
        quando: perto ? "Agora" : "Hoje",
        titulo: `Mandar ${v.prontos.length === 1 ? "o finalista" : `${v.prontos.length} finalistas`} de ${v.anuncio.titulo} para ${paraQuem(v)}`,
        texto: `${perto ? `${textoDoPrazo(prazo)[0].toUpperCase()}${textoDoPrazo(prazo).slice(1)}. ` : ""}${nomes.join(" e ")}${v.prontos.length > 2 ? " e mais" : ""} ${v.prontos.length === 1 ? "deu" : "deram"} match. O cliente abre sem conta, vê o currículo e o seu parecer, e responde por ali.`,
        href: `/painel/anuncio/${v.anuncio.id}/finalistas`,
        acao: v.link ? "Pôr na lista" : "Montar o link",
        pessoas: v.prontos.slice(0, 3).map((c) => c.nome.split(" ")[0]),
      });
    }
    const respondeu = caminho.vagas.filter((v) =>
      v.finalistas.some((f) => f.decidido_em && agora - Date.parse(f.decidido_em) < 7 * DIA),
    );
    for (const v of respondeu.slice(0, 2)) {
      const n = v.finalistas.filter((f) => f.decidido_em && agora - Date.parse(f.decidido_em) < 7 * DIA).length;
      cartoes.push({
        icone: MessageCircleReply,
        tom: "bom",
        quando: "Agora",
        titulo: `${paraQuem(v)} respondeu sobre ${plural(n, "finalista", "finalistas")} de ${v.anuncio.titulo}`,
        texto: "Veja quem ele quer entrevistar e leve a pessoa para Entrevista no quadro.",
        href: `/painel/anuncio/${v.anuncio.id}/finalistas`,
        acao: "Ver as respostas",
      });
    }
    const semResposta = caminho.vagas.filter(
      (v) =>
        v.link?.aberto_em &&
        agora - Date.parse(v.link.aberto_em) > DIA &&
        v.finalistas.length > 0 &&
        v.finalistas.every((f) => !f.decisao),
    );
    if (semResposta.length) {
      const v = semResposta[0];
      cartoes.push({
        icone: Hourglass,
        quando: "Hoje",
        titulo: `${paraQuem(v)} abriu os finalistas e ainda não respondeu`,
        texto: `${v.anuncio.titulo}${semResposta.length > 1 ? ` e mais ${plural(semResposta.length - 1, "vaga", "vagas")}` : ""}. Um lembrete no WhatsApp costuma resolver.`,
        href: `/painel/anuncio/${v.anuncio.id}/finalistas`,
        acao: "Ver o link",
      });
    }
  }
  // vaga no ar sem salário (quem procura filtra por ele)
  const semSalario = noAr.filter((a) => a.pagamento_valor == null);
  if (semSalario.length) {
    cartoes.push({
      icone: Wallet,
      quando: "Na semana",
      titulo:
        semSalario.length === 1 ? `${semSalario[0].titulo} está sem salário` : `${semSalario.length} vagas sem salário`,
      texto: "Vaga com salário recebe mais curtidas: quem procura filtra por ele.",
      href: semSalario.length === 1 ? `/painel/anuncio/${semSalario[0].id}/editar` : "/painel/anuncios?tipo=vaga",
      acao: "Completar",
    });
  }
  if (pedidos && (pedidos.atrasados || pedidos.perto)) {
    cartoes.push({
      icone: CalendarClock,
      tom: pedidos.atrasados ? "urgente" : "normal",
      quando: pedidos.atrasados ? "Atrasado" : "Até 2 dias",
      titulo: pedidos.atrasados
        ? `${plural(pedidos.atrasados, "pedido passou", "pedidos passaram")} do prazo dos finalistas`
        : `${plural(pedidos.perto, "prazo de finalistas vence", "prazos de finalistas vencem")} em até 2 dias`,
      texto: "O cliente vê o prazo no link dele. Mande os finalistas ou combine uma data nova.",
      href: "/painel/pedidos",
      acao: "Ver os pedidos",
    });
  }
  // a semana (antes num bloco ao lado, agora na mesma lista): as entrevistas depois dos próximos 2 dias e o
  // primeiro dia de quem foi contratado (o que já não entrou pelos documentos)
  const diaDaSemana = (ms: number) => {
    const t = new Intl.DateTimeFormat("pt-BR", { weekday: "short", day: "numeric", timeZone: "America/Sao_Paulo" })
      .format(ms)
      .replace(".", "");
    return t.charAt(0).toUpperCase() + t.slice(1);
  };
  const maisAdiante = semana.filter((e) => new Date(e.quando).getTime() > agora + 2 * DIA);
  if (maisAdiante.length) {
    const e = maisAdiante[0];
    cartoes.push({
      icone: CalendarClock,
      quando: diaDaSemana(Date.parse(e.quando)),
      titulo:
        maisAdiante.length === 1
          ? `Entrevista com ${primeiroNome(e.perfil_id) || "o candidato"}`
          : `${maisAdiante.length} entrevistas nesta semana`,
      texto:
        maisAdiante.length === 1
          ? `${tituloDe.get(e.anuncio_id) ?? "Vaga"} · ${dataDaEntrevista(e.quando)}`
          : maisAdiante
              .slice(0, 3)
              .map((x) => `${primeiroNome(x.perfil_id)} ${dataDaEntrevista(x.quando)}`)
              .join(" · "),
      href: quadroDe(
        maisAdiante.map((x) => x.anuncio_id),
        "/painel/caixa?aba=entrevista",
      ),
      acao: "Ver no quadro",
    });
  }
  const jaNoAgora = new Set(docsPerto.map((d) => `${d.anuncioId}:${d.perfilId}`));
  for (const d of documentos
    .filter((d) => diasAte(d.inicio) >= 0 && diasAte(d.inicio) <= 7 && !jaNoAgora.has(`${d.anuncioId}:${d.perfilId}`))
    .slice(0, 2)) {
    cartoes.push({
      icone: FileCheck2,
      tom: "bom",
      quando: diasAte(d.inicio) === 0 ? "Hoje" : diaDaSemana(Date.parse(`${d.inicio}T12:00:00Z`)),
      titulo: `Primeiro dia de ${d.nome}`,
      texto: d.total > 0 ? `${d.vaga} · ${d.enviados + d.levar} de ${d.total} documentos` : d.vaga,
      href: `/painel/anuncio/${d.anuncioId}/quadro?candidato=${d.perfilId}`,
      acao: d.total > 0 ? "Ver os documentos" : "Ver",
    });
  }
  cartoes.push(...extras);
  // os finalistas com o prazo do cliente perto vêm primeiro (o cartão escuro)
  cartoes.unshift(...finalistasNoPrazo);

  // a vaga sem cliente (agência) ou todas (empresa); e quantos chegaram por indicação (parte 3)
  const listaDeVagas = agencia
    ? vagas.filter((v) => !caminho.vagas.find((c) => c.anuncio.id === v.id)?.clienteId)
    : vagas;
  const porIndicacao = await indicadosDasVagas(vagas.map((v) => v.id)).catch(
    () => new Map<string, { indicados: number }>(),
  );

  // ------------------------------------------------------------ conta nova
  const divulgou = todos.length > 0;
  const primeiros: PrimeiroPasso[] = [
    {
      titulo: agencia ? "Perfil da agência com CNPJ" : "Perfil da empresa",
      texto: agencia
        ? "A equipe confere o CNPJ e a agência ganha o selo de verificada."
        : "Logo e uma linha sobre a empresa: quem procura confia mais.",
      feito: perfilPronto,
      acao: { nome: "Completar", href: "/perfil" },
    },
    ...(agencia
      ? [
          {
            titulo: "Cadastrar o primeiro cliente",
            texto: "Digite o CNPJ: o nome e o endereço vêm da Receita. Contato e anotações ficam só com você.",
            feito: caminho.clientes > 0,
            acao: { nome: "Adicionar cliente", href: "/painel/clientes/novo" },
          },
        ]
      : []),
    {
      titulo: agencia ? "Publicar a vaga do cliente" : "Publicar a primeira vaga",
      texto: agencia
        ? "Escolha o cliente e o nome e o endereço já entram na vaga. Dá para deixar o nome do cliente em sigilo."
        : "Grátis, sem limite de candidatos. Quem mora perto vê primeiro.",
      feito: vagas.length > 0,
      acao: { nome: "Publicar vaga", href: "/publicar" },
    },
    {
      titulo: "Divulgar o link da vaga",
      texto: "Mande no WhatsApp e nos grupos do bairro. Quem curtir chega na sua caixa de candidatos.",
      feito: divulgou,
    },
    {
      titulo: "Responder quem curtiu",
      texto: "Aceite ou dispense com um toque. Aceitou, o contato aparece para os dois.",
      feito: divulgou && pendentes.length < todos.length,
    },
    ...(agencia
      ? [
          {
            titulo: "Mandar os finalistas ao cliente",
            texto:
              "Um link sem conta: o cliente vê o currículo e o seu parecer e responde “Quero entrevistar”. O contato fica com você.",
            feito: caminho.vagas.some((v) => v.link),
          },
        ]
      : []),
  ];
  const contaNova = vagas.length === 0;

  const resumo = contaNova
    ? agencia
      ? "Seu painel segue o caminho de cada vaga: do cliente ao contratado."
      : "Seu painel segue o caminho de cada vaga: da publicação ao contratado."
    : // quem espera você já está na faixa do caminho e no "Para fazer agora": o resumo não repete
      `${plural(noAr.length, "vaga no ar", "vagas no ar")}${agencia && caminho.clientes ? ` para ${plural(caminho.clientes, "cliente", "clientes")}` : ""}.`;

  // ------------------------------------------------------------ Seus números (o painel novo, 08/11/2026)
  const DIAS = 14;
  const chaves = Array.from({ length: DIAS }, (_, i) => hojeEmBrasilia(agora - (DIAS - 1 - i) * DIA));
  const porDia = new Map<string, number>();
  for (const c of todos) {
    const d = hojeEmBrasilia(Date.parse(c.curtido_em));
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
  }
  const diasAntes = new Set(Array.from({ length: DIAS }, (_, i) => hojeEmBrasilia(agora - (DIAS + i) * DIA)));
  const antes = [...porDia].filter(([d]) => diasAntes.has(d)).reduce((t, [, n]) => t + n, 0);
  const diaMes = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  const mes = hojeBr.slice(0, 7);
  const nomeDoMes = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" }).format(agora);
  const horas = resposta?.horas ?? null;
  const responde = resposta ? comoResponde(resposta) : null;
  const numeroResposta: NumeroDoHoje = {
    nome: horas !== null ? "Você responde em" : "Você responde",
    periodo: "90 dias",
    valor:
      horas !== null
        ? horas < 1
          ? "< 1 h"
          : horas < 48
            ? `${Math.round(horas)} h`
            : `${Math.round(horas / 24)} dias`
        : resposta
          ? `${Math.round(resposta.taxa * 100)}%`
          : "–",
    situacao: responde
      ? {
          texto: responde.bom && horas !== null && horas < 24 ? "Rápido: menos de 1 dia" : responde.texto,
          bom: responde.bom,
        }
      : undefined,
    sub: responde ? undefined : "Aparece com as primeiras respostas",
    largo: true,
  };
  const contratadosNoMes = todos.filter(
    (c) => abaDaEtapa(c) === "contratados" && c.etapa_em && hojeEmBrasilia(Date.parse(c.etapa_em)).slice(0, 7) === mes,
  );
  const prazos = noPrazo
    ? [...noPrazo.values()].reduce((a, x) => ({ ok: a.ok + x.noPrazo, total: a.total + x.total }), { ok: 0, total: 0 })
    : null;
  const numeros: NumeroDoHoje[] = agencia
    ? [
        prazos && prazos.total > 0
          ? {
              nome: "Prazos cumpridos",
              periodo: "90 dias",
              valor: `${prazos.ok} de ${prazos.total}`,
              parte: prazos.ok / prazos.total,
              sub: "pedidos com os finalistas no prazo",
            }
          : { nome: "Prazos cumpridos", periodo: "90 dias", valor: "–", sub: "Aparece com o primeiro pedido com prazo" },
        {
          nome: "Colocações",
          periodo: nomeDoMes,
          valor: String(colocacoes.filter((c) => c.inicio.slice(0, 7) === mes).length),
          sub: `em ${nomeDoMes}`,
        },
        numeroResposta,
      ]
    : [
        {
          nome: "Visitas nas vagas",
          periodo: "no ar",
          valor: noAr.reduce((t, v) => t + (visitas.get(v.id) ?? 0), 0).toLocaleString("pt-BR"),
          sub: "nas vagas no ar",
        },
        {
          nome: "Contratados",
          periodo: nomeDoMes,
          valor: String(contratadosNoMes.length),
          sub: contratadosNoMes.length
            ? contratadosNoMes
                .slice(0, 2)
                .map((c) => c.nome.split(" ")[0])
                .join(" e ")
            : `em ${nomeDoMes}`,
        },
        numeroResposta,
      ];

  // ------------------------------------------------------------ Suas vagas (na agência, Seus clientes)
  const linha = (v: MeuAnuncio): LinhaDaVaga | null => {
    const daVaga = todos.filter((c) => c.anuncio_id === v.id);
    const naEtapa = (aba: ReturnType<typeof abaDaEtapa>) => daVaga.filter((c) => abaDaEtapa(c) === aba).length;
    const status = v.status as StatusAnuncio;
    const ativa = status === "ativo" && new Date(v.expira_em).getTime() > agora;
    // a tabela mostra as vagas no ar e as que ainda têm gente em análise ou entrevista
    if (!ativa && status !== "pausado" && naEtapa("analise") + naEtapa("entrevista") === 0) return null;
    const noCaminho = caminho.vagas.find((c) => c.anuncio.id === v.id);
    const vistas = visitas.get(v.id) ?? 0;
    const indicados = porIndicacao.get(v.id)?.indicados ?? 0;
    const diasNoArAgora = Math.floor((agora - Date.parse(v.criado_em)) / DIA);
    const parada = ativa && daVaga.length === 0 && diasNoArAgora > 7;
    const ate = ateQuando(v.expira_em);
    const meta = [
      noCaminho?.prontos.length
        ? `${noCaminho.prontos.length} ${noCaminho.prontos.length === 1 ? "pronto" : "prontos"} para o cliente`
        : null,
      noCaminho?.finalistas.length ? `${noCaminho.finalistas.length} com o cliente` : null,
      prazoDaVaga.has(v.id) ? textoDoPrazo(prazoDaVaga.get(v.id) as string).replace("o prazo do cliente ", "prazo ") : null,
      parada
        ? `Parada há ${diasNoArAgora} dias`
        : ativa
          ? ate.charAt(0).toUpperCase() + ate.slice(1)
          : (STATUS_ANUNCIO[status]?.nome ?? status),
      ativa && !parada && vistas ? plural(vistas, "visita", "visitas") : null,
      indicados ? `${indicados} por indicação` : null,
    ]
      .filter(Boolean)
      .slice(0, 3)
      .join(" · ");
    return {
      id: v.id,
      titulo: v.titulo,
      href: `/painel/anuncio/${v.id}/quadro`,
      meta,
      novos: naEtapa("novos"),
      esperam: daVaga.filter((c) => abaDaEtapa(c) === "novos" && esperaResposta(c)).length,
      analise: naEtapa("analise"),
      entrevista: naEtapa("entrevista"),
      contratados: naEtapa("contratados"),
    };
  };
  const linhas = (l: MeuAnuncio[]) => l.map(linha).filter((x): x is LinhaDaVaga => x !== null);
  const grupos: GrupoDeVagas[] = (
    agencia
      ? [
          ...caminho.listaClientes.map((c) => ({
            cliente: { nome: c.nome, bairro: c.bairro, href: `/painel/clientes/${c.id}` },
            vagas: linhas(caminho.vagas.filter((x) => x.clienteId === c.id).map((x) => x.anuncio)),
          })),
          { cliente: null, vagas: linhas(listaDeVagas) },
        ]
      : [{ vagas: linhas(listaDeVagas) }]
  ).filter((g) => g.vagas.length > 0);

  return (
    <div className="flex flex-col gap-8 sm:gap-10">
      <Saudacao
        nome={nome}
        agora={agora}
        pendencias={cartoes.length}
        resumo={contaNova ? resumo : undefined}
        boasVindas={contaNova}
      />

      {contaNova ? (
        <>
          <ComecePorAqui passos={primeiros} />
          <ParaFazerAgora
            lista
            titulo="Enquanto isso"
            vazio=""
            itens={[
              {
                icone: UserSearch,
                titulo: "Veja quem tem currículo perto",
                texto: "Na aba Talentos, convide quem combina, mesmo antes de publicar.",
                href: "/talentos",
                acao: "Ver talentos",
              },
              ...(agencia
                ? [
                    {
                      icone: UsersRound,
                      titulo: "Chame a sua equipe",
                      texto: "Cada recrutador entra com o próprio celular e age pela agência.",
                      href: "/painel/equipe",
                      acao: "Convidar",
                    },
                  ]
                : []),
            ]}
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-6">
            <div className="flex min-w-0 flex-col gap-4">
              <Agora
                itens={cartoes}
                vazio="Tudo em dia: ninguém esperando por você agora. Quando alguém curtir uma vaga, aparece aqui."
              />
              {/* no celular, o convite das notificações vem aqui; no computador, é uma linha no fim do menu */}
              <div className="lg:hidden">
                <ConviteNotificacoes
                  vapid={vapidPublica()}
                  titulo="Saiba na hora quando alguém se candidatar"
                  texto="Candidatos, mensagens e entrevistas chegam no celular, mesmo com o Publike fechado."
                />
              </div>
            </div>
            <NumerosDoHoje
              candidatos={{ dias: chaves.map((d) => ({ dia: diaMes(d), n: porDia.get(d) ?? 0 })), antes }}
              numeros={numeros}
            />
          </div>
          {grupos.length > 0 && (
            <TabelaDasVagas
              titulo={agencia ? "Seus clientes" : "Suas vagas"}
              grupos={grupos}
              link={
                agencia
                  ? { href: "/painel/clientes", texto: "Ver todos os clientes" }
                  : { href: "/painel/anuncios?tipo=vaga", texto: "Gerenciar vagas" }
              }
            />
          )}
        </>
      )}
    </div>
  );
}
