import {
  Building2,
  CalendarClock,
  ChevronRight,
  Clock,
  Hourglass,
  ImageUp,
  Megaphone,
  MessageCircleReply,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  UserSearch,
  UsersRound,
  UserRoundX,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Selo } from "@/components/ui/basicos";
import { BotaoLink } from "@/components/ui/botao";
import { hojeEmBrasilia, situacaoDaColocacao } from "@/lib/colocacoes";
import { esperaResposta, STATUS_ANUNCIO } from "@/lib/constantes";
import { obterAnuncio, respostaDeQuemPublica } from "@/lib/dados";
import { ateQuando, formatarMoeda, plural } from "@/lib/formato";
import { dataDaEntrevista, SITUACOES_ENTREVISTA } from "@/lib/recrutamento";
import { comoResponde } from "@/lib/resposta";
import type { Saude } from "@/lib/saude-vaga";
import { colocacoesDasVagas } from "@/lib/servidor/colocacoes";
import { saudeDasVagas } from "@/lib/servidor/saude";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { MeuAnuncio, StatusAnuncio } from "@/lib/tipos";
import type { ConversaPessoa } from "@/lib/conversas";
import { SITE_URL } from "@/lib/config";
import { caminhoDaConta, type Caminho } from "@/lib/servidor/caminho";
import { equipeDaConta } from "@/lib/servidor/equipe";
import { ComecePorAqui, FaixaDoCaminho, SeusClientes, type Passo, type PrimeiroPasso } from "./caminho-hoje";
import { ParaFazerAgora, Saudacao, type Cartao } from "./hoje";
import { LinksParaMandar, type LinkParaMandar } from "./links-para-mandar";
import { EsperandoResposta, MensagensRecentes, TalentosDaVaga } from "./hoje-extras";
import { NivelDaSaude } from "./saude-vaga";

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
  conversas = null,
  fotoDaVaga = false,
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
  /** as conversas da conta (as mais recentes aparecem ao lado das vagas) */
  conversas?: ConversaPessoa[] | null;
  /** a leitura da arte da vaga está ligada: o atalho "Publicar pela foto" */
  fotoDaVaga?: boolean;
  /** o perfil já tem o que precisa (agência: o CNPJ; empresa: foto ou descrição) */
  perfilPronto?: boolean;
}) {
  const agencia = typeof clientes === "number";
  const vagas = (anuncios ?? []).filter((a) => a.tipo === "vaga");
  const todos = candidatos ?? [];
  const noAr = vagas.filter((a) => a.status === "ativo" && new Date(a.expira_em).getTime() > agora);
  const [{ visitas, entrevistas }, respostas, completas, colocacoes, caminho, equipe] = await Promise.all([
    dadosExtras(
      vagas.map((v) => v.id),
      agora,
    ),
    respostaDeQuemPublica([autorId]).catch(() => new Map()),
    Promise.all(noAr.map((v) => obterAnuncio(v.id).catch(() => null))),
    // agência: as colocações (garantias e taxas a receber)
    agencia ? colocacoesDasVagas().then((m) => [...m.values()]) : Promise.resolve([]),
    caminhoDaConta(),
    agencia ? equipeDaConta().catch(() => null) : Promise.resolve(null),
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

  const pendentes = todos.filter(esperaResposta);
  const antigos = pendentes.filter((c) => agora - new Date(c.curtido_em).getTime() > 2 * DIA);
  const contratados = todos.filter((c) => c.etapa === "contratado" && c.status === "match");
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
      texto: "Divulgue o link da vaga no WhatsApp e no Instagram, ou revise o título, o salário e o horário.",
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
  // agência: os finalistas (prontos para mandar, o cliente abriu e não respondeu, o cliente respondeu)
  const nomeDoCliente = new Map(caminho.listaClientes.map((c) => [c.id, c.nome]));
  const paraQuem = (v: Caminho["vagas"][number]) =>
    (v.clienteId ? nomeDoCliente.get(v.clienteId) : null) ?? "o cliente";
  if (agencia) {
    const comProntos = caminho.vagas.filter(
      (v) => v.prontos.length > 0 && (v.anuncio.status === "ativo" || v.anuncio.status === "pausado"),
    );
    for (const v of comProntos.slice(0, 2)) {
      const nomes = v.prontos.slice(0, 2).map((c) => c.nome.split(" ")[0]);
      cartoes.push({
        icone: Send,
        quando: "Para o cliente",
        titulo: `Mandar ${v.prontos.length === 1 ? "o finalista" : `${v.prontos.length} finalistas`} de ${v.anuncio.titulo} para ${paraQuem(v)}`,
        texto: `${nomes.join(" e ")}${v.prontos.length > 2 ? " e mais" : ""} ${v.prontos.length === 1 ? "deu" : "deram"} match. O cliente abre sem conta, vê o currículo e o seu parecer, e responde por ali.`,
        href: `/painel/anuncio/${v.anuncio.id}/finalistas`,
        acao: v.link ? "Pôr na lista" : "Montar o link",
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
        quando: "O cliente respondeu",
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
        quando: "Esperando o cliente",
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
      quando: "Pode melhorar",
      titulo:
        semSalario.length === 1 ? `${semSalario[0].titulo} está sem salário` : `${semSalario.length} vagas sem salário`,
      texto: "Vaga com salário recebe mais curtidas: quem procura filtra por ele.",
      href: semSalario.length === 1 ? `/painel/anuncio/${semSalario[0].id}/editar` : "/painel/anuncios?tipo=vaga",
      acao: "Completar",
    });
  }
  cartoes.push(...extras);

  const responde = resposta ? comoResponde(resposta) : null;
  const listaDeVagas = agencia
    ? vagas.filter((v) => !caminho.vagas.find((c) => c.anuncio.id === v.id)?.clienteId)
    : vagas;

  // ------------------------------------------------------------ o caminho
  const nomesDe = (lista: string[]) =>
    lista.length <= 2 ? lista.join(" e ") : `${lista.slice(0, 2).join(", ")} e mais ${lista.length - 2}`;
  const esperando = nomesDe([...new Set(pendentes.map((c) => primeiroNome(c.perfil_id)).filter(Boolean))]);
  const ultimoContratado = [...contratados].sort((x, y) => (y.etapa_em ?? "").localeCompare(x.etapa_em ?? ""))[0];
  const passoClientes: Passo = {
    nome: "Clientes",
    numero: caminho.clientes,
    texto: caminho.clientes
      ? nomesDe(caminho.listaClientes.map((c) => c.nome))
      : "Cadastre as empresas para quem você seleciona",
    acao: "Adicionar cliente",
    href: "/painel/clientes/novo",
    estado: caminho.clientes ? "feito" : "agora",
  };
  const passoVagas: Passo = {
    nome: "Vagas no ar",
    numero: noAr.length,
    texto: semSalario.length
      ? `${semSalario[0].titulo} está sem salário`
      : noAr.length
        ? `${plural(todos.length, "candidato", "candidatos")} no total`
        : "Nenhuma vaga no ar agora",
    acao: noAr.length ? "Ver vagas" : "Publicar vaga",
    href: noAr.length ? "/painel/anuncios?tipo=vaga" : "/publicar",
    estado: noAr.length ? "feito" : "agora",
  };
  const passoCandidatos: Passo = {
    nome: "Para responder",
    numero: pendentes.length,
    texto: pendentes.length
      ? `${esperando} ${pendentes.length === 1 ? "espera" : "esperam"} você`
      : "Ninguém esperando resposta",
    acao: pendentes.length ? "Responder agora" : "Ver candidatos",
    href: pendentes.length ? "/painel/caixa?aba=responder" : "/painel/caixa",
    estado: pendentes.length ? "agora" : "normal",
  };
  const passoCliente: Passo = {
    nome: "Com o cliente",
    numero: caminho.comCliente,
    texto: caminho.prontos
      ? `${plural(caminho.prontos, "finalista pronto", "finalistas prontos")} para mandar`
      : caminho.respostasNovas
        ? `${plural(caminho.respostasNovas, "resposta nova", "respostas novas")} do cliente`
        : caminho.comCliente
          ? "Esperando a resposta do cliente"
          : "Quem der match pode ir para o cliente",
    acao: caminho.prontos ? "Montar o link" : "Ver os links",
    href: "/painel/finalistas",
    estado: caminho.prontos ? "agora" : "normal",
  };
  const passoEntrevistas: Passo = {
    nome: "Entrevistas",
    numero: caminho.entrevistas,
    texto: semana.length
      ? `Próxima: ${primeiroNome(semana[0].perfil_id) || "candidato"}, ${dataDaEntrevista(semana[0].quando)}`
      : caminho.entrevistas
        ? "Sem data marcada"
        : "Leve quem combina para Entrevista no quadro",
    acao: "Ver entrevistas",
    href: "/painel/caixa?aba=entrevistas",
    estado: semData.length || remarcar.length ? "agora" : "normal",
  };
  const passoContratados: Passo = {
    nome: "Contratados",
    numero: contratados.length,
    texto: ultimoContratado
      ? `${primeiroNome(ultimoContratado.perfil_id) || "Último"}, em ${tituloDe.get(ultimoContratado.anuncio_id) ?? "uma vaga"}`
      : "Ninguém contratado ainda",
    acao: agencia ? "Ver colocações" : "Ver contratados",
    href: "/painel/contratados",
    estado: contratados.length ? "feito" : "normal",
  };
  const passos = agencia
    ? [passoClientes, passoVagas, passoCandidatos, passoCliente, passoContratados]
    : [{ ...passoVagas, nome: "Vagas no ar" }, passoCandidatos, passoEntrevistas, passoContratados];
  // um passo "agora" por vez: o primeiro que pede você
  const daVez = passos.findIndex((p) => p.estado === "agora");
  const faixa = passos.map((p, i) => (p.estado === "agora" && i !== daVez ? { ...p, estado: "normal" as const } : p));

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

  // ------------------------------------------------------------ links para mandar
  const links: LinkParaMandar[] = [];
  if (noAr.length) {
    links.push({
      titulo: "Todas as suas vagas",
      detalhe: `${SITE_URL.replace(/^https?:\/\//, "")}/perfil/${autorId}/vagas`,
      url: `${SITE_URL}/perfil/${autorId}/vagas`,
      mensagem: `Vagas abertas de ${nome} no Publike. Candidate-se de graça`,
    });
  }
  if (agencia) {
    for (const v of caminho.vagas
      .filter((x) => x.anuncio.status === "ativo" && (x.link || x.prontos.length))
      .slice(0, 3)) {
      const vencido = v.link && Date.parse(v.link.expira_em) < agora;
      links.push({
        titulo: `Finalistas · ${v.anuncio.titulo}`,
        detalhe: `Para ${paraQuem(v)} · ${
          !v.link
            ? "ainda não criado"
            : vencido
              ? "venceu"
              : v.link.aberto_em
                ? "o cliente já abriu"
                : "ainda não aberto"
        }`,
        url: v.link && !vencido ? `${SITE_URL}/finalistas/${v.link.token}` : undefined,
        mensagem: `Os finalistas para ${v.anuncio.titulo}`,
        criar: `/painel/anuncio/${v.anuncio.id}/finalistas`,
      });
    }
  }
  for (const v of noAr.slice(0, 2)) {
    links.push({
      titulo: `Vaga · ${v.titulo}`,
      detalhe: "Para divulgar em grupos",
      url: `${SITE_URL}/anuncio/${v.id}`,
      mensagem: `Vaga: ${v.titulo}. Candidate-se de graça no Publike`,
    });
  }

  const resumo = contaNova
    ? agencia
      ? "Seu painel segue o caminho de cada vaga: do cliente ao contratado."
      : "Seu painel segue o caminho de cada vaga: da publicação ao contratado."
    : `${plural(noAr.length, "vaga no ar", "vagas no ar")}${agencia && caminho.clientes ? ` para ${plural(caminho.clientes, "cliente", "clientes")}` : ""}.${
        pendentes.length ? ` ${plural(pendentes.length, "candidato espera", "candidatos esperam")} você.` : ""
      }`;

  return (
    <div className="flex flex-col gap-8">
      <Saudacao
        nome={nome}
        agora={agora}
        pendencias={cartoes.length}
        resumo={resumo}
        boasVindas={contaNova}
        // conta nova: a ação é a do passo da vez no "Comece por aqui" (um botão principal por tela)
        acao={
          contaNova ? undefined : (
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <span className="flex flex-wrap items-center gap-2">
                {fotoDaVaga && !contaNova && (
                  <BotaoLink href="/publicar#arte" tamanho="sm">
                    <ImageUp aria-hidden />
                    Publicar pela foto
                  </BotaoLink>
                )}
                {agencia && (
                  <BotaoLink href="/painel/clientes/novo" tamanho="sm">
                    <Building2 aria-hidden />
                    Adicionar cliente
                  </BotaoLink>
                )}
                <BotaoLink href="/publicar" variante="primario" tamanho="sm">
                  <Plus aria-hidden />
                  Publicar vaga
                </BotaoLink>
              </span>
              {/* o que é "pela foto": a vaga que já existe numa imagem vira a vaga preenchida */}
              {fotoDaVaga && !contaNova && (
                <p className="max-w-xs text-body-sm text-ink-muted sm:text-right">
                  Pela foto: mande a arte da vaga (o post ou o cartaz) e o Publike preenche tudo.
                </p>
              )}
            </div>
          )
        }
      />

      {contaNova ? <ComecePorAqui passos={primeiros} /> : <FaixaDoCaminho passos={faixa} />}

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {contaNova ? (
            <ParaFazerAgora
              lista
              titulo="Enquanto isso"
              vazio=""
              itens={[
                {
                  icone: UserSearch,
                  titulo: "Veja quem tem currículo perto",
                  texto: "Na aba Talentos, convide quem combina, mesmo antes de publicar.",
                  href: "/painel/talentos",
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
          ) : (
            <ParaFazerAgora
              lista
              itens={cartoes}
              vazio="Tudo em dia: ninguém esperando por você agora. Quando alguém curtir uma vaga, aparece aqui."
            />
          )}

          {pendentes.length > 0 && (
            <Suspense fallback={null}>
              <EsperandoResposta agora={agora} />
            </Suspense>
          )}

          {agencia && <SeusClientes clientes={caminho.listaClientes} vagas={caminho.vagas} />}

          {listaDeVagas.length > 0 && (
            <section aria-labelledby="suas-vagas" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="suas-vagas" className="text-h3">
                  {agencia ? "Vagas sem cliente" : "Suas vagas"}
                </h2>
                <Link
                  href="/painel/anuncios?tipo=vaga"
                  className="text-label text-ink-muted underline underline-offset-2 hover:text-ink"
                >
                  Gerenciar vagas
                </Link>
              </div>
              <ul className="flex flex-col gap-3">
                {listaDeVagas.map((v) => {
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
          )}
        </div>

        <aside className="flex flex-col gap-4">
          {links.length > 0 && <LinksParaMandar links={links} mais="/painel/links" />}
          <MensagensRecentes conversas={conversas} agora={agora} />
          {contaNova && (
            <section className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4 sm:p-5">
              <h2 className="text-h3">Link das suas vagas</h2>
              <p className="text-body-sm text-ink-muted">
                Fica pronto quando a primeira vaga for ao ar. Vaga nova entra sozinha nele.
              </p>
            </section>
          )}
          {!contaNova && (
            <>
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
            </>
          )}
          {agencia && equipe && !contaNova && (
            <section
              aria-labelledby="sua-equipe"
              className="flex flex-col gap-2 rounded-lg border border-line bg-surface-200 p-4 sm:p-5"
            >
              <h2 id="sua-equipe" className="text-h3">
                Sua equipe
              </h2>
              <p className="text-body-sm text-ink-muted">
                {equipe.length <= 1
                  ? "Só você por enquanto. Cada recrutador entra com o próprio celular e age pela agência."
                  : `${plural(equipe.length, "pessoa", "pessoas")}: ${equipe
                      .slice(0, 3)
                      .map((m) => m.nome.split(" ")[0])
                      .join(", ")}${equipe.length > 3 ? " e mais" : ""}.`}
              </p>
              <Link href="/painel/equipe" className="self-start text-label underline underline-offset-2">
                {equipe.length <= 1 ? "Convidar alguém" : "Ver a equipe"}
              </Link>
            </section>
          )}
          {!contaNova && (
            <Suspense fallback={null}>
              <TalentosDaVaga vagas={vagas} agora={agora} />
            </Suspense>
          )}
        </aside>
      </div>
    </div>
  );
}
