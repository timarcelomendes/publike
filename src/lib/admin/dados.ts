import "server-only";
import type { ClienteBanco } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/tipos-banco";
import { pdfNaoSalvoDe } from "@/lib/servidor/curriculo-pendente";
import { agoraDaRequisicao } from "@/lib/tempo";
import { lerRespostas } from "@/lib/mensagem-equipe";
import { urlDosEmails } from "@/lib/servidor/ambiente";

// Leituras das páginas do admin e da moderação. O cliente vem de
// exigirAdminLocal() (chave secreta, só no computador do dono) ou de
// acessoDaEquipe() (moderador logado). O banco confere quem pode o quê.

type Funcoes = Database["public"]["Functions"];
type Linha<F extends keyof Funcoes> = Funcoes[F]["Returns"] extends (infer L)[] ? L : never;

export type UsuarioAdmin = Linha<"admin_listar_usuarios">;
export type AnuncioAdmin = Linha<"admin_listar_anuncios">;
export type ItemFila = Linha<"fila_moderacao">;
export type ModeloEmailAdmin = Linha<"admin_modelos_email">;
export type EmailDaFila = Linha<"admin_fila_emails">;
export type DecisaoIA = Linha<"admin_decisoes_ia">;
export type ItemRegistro = Linha<"admin_registro">;
export type Moderador = Linha<"admin_listar_moderadores">;
export type ChaveServidor = Linha<"admin_listar_chaves_servidor">;
export type OrigemContas = Linha<"admin_origens">;
export type ConfigSite = Database["public"]["Tables"]["config_site"]["Row"];
export type ResumoIA = Linha<"admin_ultimo_resumo">;

export type NumerosPainel = {
  contas: number;
  contas_7d: number;
  contas_30d: number;
  acessos_7d: number;
  sem_perfil: number;
  perfis: {
    total: number;
    pessoa: number;
    comercio: number;
    empresa: number;
    agencia: number;
    /** agências com o CNPJ ainda não conferido pela equipe */
    agencias_a_verificar: number;
    verificados: number;
  };
  anuncios: {
    total: number;
    no_ar: number;
    vagas_no_ar: number;
    servicos_no_ar: number;
    pausados: number;
    expirados: number;
    encerrados: number;
    em_analise: number;
    removidos: number;
    novos_7d: number;
  };
  curtidas: { total: number; novas_7d: number; matches: number; matches_7d: number };
  denuncias_abertas: number;
  denuncias_7d: number;
  suspensos: number;
  banidos: number;
  ia: { revisados_7d: number; retidos_7d: number; na_fila: number };
  emails: { enviados_7d: number; falhas_7d: number; na_fila: number };
  por_dia: { dia: string; contas: number; anuncios: number; curtidas: number }[];
  categorias: { nome: string; n: number }[];
  bairros: { nome: string; n: number }[];
};

export type Suspensao = {
  id: number;
  tipo: "suspensao" | "banimento";
  dias: number | null;
  motivo: string;
  inicio: string;
  fim: string;
  encerrada_em?: string | null;
  aplicada_por?: string | null;
  encerrada_por?: string | null;
};

export type FichaUsuario = {
  id: string;
  email: string | null;
  telefone: string | null;
  provedor: string;
  provedores: string[];
  criado_em: string;
  ultimo_acesso: string | null;
  login_bloqueado_ate: string | null;
  perfil: {
    nome: string;
    tipo: string;
    foto: string | null;
    cidade: string;
    bairro: string | null;
    sobre: string | null;
    servicos: string[];
    verificado: boolean;
    criado_em: string;
    /** só agências */
    cnpj: string | null;
  } | null;
  contato: { whatsapp: string | null; email: string | null; receber_emails: boolean };
  moderador: boolean;
  suspensao: Suspensao | null;
  historico: Suspensao[];
  numeros: {
    anuncios: number;
    no_ar: number;
    curtidas_feitas: number;
    curtidas_recebidas: number;
    matches: number;
    denuncias_recebidas: number;
    denuncias_procedentes: number;
    denuncias_feitas: number;
  };
};

export type FichaAnuncio = {
  id: string;
  status: string;
  nota_moderacao: string | null;
  autor: {
    id: string;
    nome: string;
    tipo: string;
    foto: string | null;
    verificado: boolean;
    suspenso_ate: string | null;
    email: string | null;
    anuncios: number;
    removidos: number;
  };
  curtidas: number;
  matches: number;
  denuncias: { id: number; motivo: string; detalhes: string | null; status: string; criado_em: string; quem: string | null }[];
  ia: { decisao: string; categorias: string[]; explicacao: string | null; modelo: string | null; criado_em: string }[];
  registro: { acao: string; detalhes: Record<string, unknown>; criado_em: string; quem: string | null }[];
};

function falha(onde: string, erro: { message: string }): never {
  throw new Error(`Publike: falha ao ler ${onde}: ${erro.message}`);
}

export const POR_PAGINA = 30;

export async function numerosDoPainel(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_resumo");
  if (error) falha("os números do painel", error);
  return data as unknown as NumerosPainel;
}

/** O quadro verde/vermelho do topo do painel (migração 20261107120000_saude_do_site.sql). */
export type SaudeSite = {
  emails: {
    parados: number;
    parado_desde: string | null;
    na_fila: number;
    falharam_24h: number;
    ultimo_enviado: string | null;
  };
  ia: {
    ligada: boolean;
    parados: number;
    parado_desde: string | null;
    erros_24h: number;
    ultima_revisao: string | null;
  };
  chaves: { nome: string; criada_em: string; usada_em: string | null }[];
  moderacao: { anuncios: number; recados: number; avaliacoes: number; denuncias: number; desde: string | null };
  falhas: { sistema_24h: number; ultima: string | null };
};

/** Sem a migração ainda, o quadro não aparece (null) e o resto do painel segue normal. */
export async function saudeDoSite(c: ClienteBanco): Promise<SaudeSite | null> {
  const { data, error } = await c.rpc("admin_saude");
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler a saúde do site:", error.message);
    return null;
  }
  return data as unknown as SaudeSite;
}

/** Por que as vagas e os serviços foram encerrados (a pergunta do "Encerrar"). null: banco sem a migração. */
export async function motivosDeEncerramento(c: ClienteBanco, dias = 30) {
  const { data, error } = await c.rpc("admin_motivos_encerramento", { p_dias: dias });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler os motivos de encerramento:", error.message);
    return null;
  }
  return data ?? [];
}

export type SituacaoPush = {
  aparelhos: number;
  contas: number;
  novos_7d: number;
  enviadas_24h: number;
  falhas_24h: number;
  na_fila: number;
  mais_antiga_na_fila: string | null;
  ultima_enviada: string | null;
  ultimo_erro: string | null;
  ultimo_erro_em: string | null;
};

/** Os números das notificações no celular, do banco de produção. null: banco sem a migração. */
export async function situacaoDoPush(c: ClienteBanco): Promise<SituacaoPush | null> {
  const { data, error } = await c.rpc("admin_situacao_push");
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler as notificações no celular:", error.message);
    return null;
  }
  return data as unknown as SituacaoPush;
}

/**
 * As notificações estão ligadas no site publicado? O admin roda no computador do dono e não vê as
 * variáveis da Vercel: pergunta ao próprio site (/api/notificacoes). null: não deu para perguntar.
 */
export async function pushNoSitePublicado(): Promise<{
  endereco: string;
  ligadas: boolean;
  chave: string | null;
} | null> {
  // o endereço público do site (no computador do dono, PUBLIKE_URL_PUBLICA pode apontar para o próprio computador)
  const configurado = urlDosEmails();
  const endereco =
    configurado && /^https:\/\//.test(configurado) && !/\/\/(localhost|127\.)/.test(configurado)
      ? configurado
      : "https://publike.org";
  try {
    const r = await fetch(`${endereco}/api/notificacoes`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const corpo = (await r.json()) as { ligadas?: unknown; chave?: unknown };
    return {
      endereco,
      ligadas: corpo.ligadas === true,
      chave: typeof corpo.chave === "string" ? corpo.chave : null,
    };
  } catch {
    return null;
  }
}

/** O começo de hoje em Goiânia (o banco conta os dias nesse fuso), em ISO. */
export function inicioDeHoje(agora: number) {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora));
  // Goiânia não tem horário de verão desde 2019: sempre -03:00
  return new Date(`${dia}T00:00:00-03:00`).toISOString();
}

/** Os números de hoje dos cartões do painel: contas, anúncios publicados, curtidas e matches. */
export async function numerosDeHoje(c: ClienteBanco, n: NumerosPainel, agora: number) {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(agora));
  const deHoje = n.por_dia.find((d) => d.dia === dia) ?? { contas: 0, anuncios: 0, curtidas: 0 };
  const { count, error } = await c
    .from("curtidas")
    .select("anuncio_id", { count: "exact", head: true })
    .eq("status", "match")
    .gte("respondida_em", inicioDeHoje(agora));
  if (error) console.warn(`Publike: sem os matches de hoje: ${error.message}`);
  return { contas: deHoje.contas, anuncios: deHoje.anuncios, curtidas: deHoje.curtidas, matches: count ?? 0 };
}

/** Quantas pessoas abriram o site, por dia (o banco não guarda quem). */
export type AcessosSite = {
  hoje: number;
  com_conta_hoje: number;
  ontem: number;
  /** média por dia dos dias inteiros (até 7, sem hoje e sem o primeiro dia contado) */
  media_7d: number;
  /** o primeiro dia contado (null: nada ainda) */
  desde: string | null;
  /** quantos dias inteiros entraram na média (sem a migração 20261114120000: não vem) */
  dias_na_media?: number;
  /** a hora de agora, em Goiânia */
  hora?: number;
  /** ontem até a mesma hora (null: ontem ainda não tinha a hora guardada) */
  ontem_ate_agora?: number | null;
  paginas_por_visitante?: number | null;
  /** % de quem viu só uma página, nos dias inteiros */
  so_uma_pagina?: number | null;
  por_dia: { dia: string; visitantes: number; com_conta?: number }[];
};

/** On-line agora e as contas que voltaram (migração 20261130120000). */
export type PresencaSite = {
  online: number;
  online_com_conta: number;
  contas_hoje: number;
  voltaram_hoje: number;
  contas_7d: number;
  voltaram_7d: number;
  /** o primeiro dia contado das contas (null: nada ainda) */
  desde: string | null;
};

/** null: banco sem a migração 20261130120000. */
export async function presencaNoSite(c: ClienteBanco): Promise<PresencaSite | null> {
  const { data, error } = await c.rpc("admin_presenca");
  if (error) return null;
  return data as unknown as PresencaSite;
}

/** As métricas de produto do Painel (migração 20261207120000_metricas_de_produto.sql). Os dias são de Goiânia. */
export type MetricasProduto = {
  hoje: string;
  /** desde quando "entrou no site" conta como uso (antes, só as ações); null: ainda não há registro */
  desde: string | null;
  ativos: {
    dau_hoje: number;
    /** a média dos 7 dias inteiros antes de hoje */
    dau_media: number | null;
    wau: number;
    mau: number;
    /** os 30 dias antes destes */
    mau_antes: number;
    mau_pessoas: number;
    mau_empresas: number;
    dias_por_conta: number | null;
  };
  /** 8 blocos de 7 dias, do mais antigo à semana que termina hoje */
  semanas: {
    inicio: string;
    fim: string;
    contas: number;
    matches: number;
    ativos: number;
    curtidas: number;
    vagas: number;
  }[];
  /** as contas criadas de 8 a 37 dias atrás */
  ativacao: {
    contas: number;
    com_perfil: number;
    ativadas: number;
    pessoas: number;
    pessoas_ativadas: number;
    empresas: number;
    empresas_ativadas: number;
    mediana_horas: number | null;
  };
  /** por semana de cadastro: quantas usaram na 1ª a 4ª semana depois (null: a semana ainda não terminou) */
  retencao: { inicio: string; fim: string; tamanho: number; semanas: (number | null)[] }[];
  voltaram: Record<"1" | "7" | "30", { base: number; voltaram: number }>;
  churn: { base: number; sairam: number };
  /** as contas criadas nos últimos 30 dias */
  funil: {
    contas: number;
    com_perfil: number;
    pessoas: number;
    curriculo: number;
    curtiu: number;
    match: number;
    empresas: number;
    vaga: number;
    candidato: number;
    aceitou: number;
    visitas: number;
  };
  /** as vagas e as curtidas de 8 a 37 dias atrás */
  liquidez: {
    vagas: number;
    com_candidato_7d: number;
    mediana_horas_primeiro: number | null;
    candidatos_media: number | null;
    curtidas: number;
    respondidas_7d: number;
    mediana_horas_resposta: number | null;
    matches: number;
    preenchidas_publike: number;
    encerradas_com_motivo: number;
    vagas_no_ar: number;
  };
  engajamento: { acoes_7d: number; mensagens_7d: number };
};

/** null: falta a migração 20261207120000 (ou deu erro: o Painel segue sem as métricas). */
export async function metricasDeProduto(c: ClienteBanco): Promise<MetricasProduto | null> {
  const { data, error } = await c.rpc("admin_metricas_produto");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha nas métricas de produto: ${error.message}`);
    return null;
  }
  return data as unknown as MetricasProduto;
}

/** As somas de um período do tempo nas páginas. */
type SomaDoTempo = {
  /** as vezes que uma página ficou na tela (a partir de 1 segundo) */
  visitas: number;
  segundos: number;
  mais_de_10s: number;
  mais_de_1min: number;
};

/** O tempo nas páginas (migração 20261208120000_tempo_na_pagina.sql): os últimos 7 dias, até hoje. */
export type TempoNasPaginas = {
  /** o primeiro dia contado; null: ainda nada */
  desde: string | null;
  /** os últimos 7 dias, com as pessoas que abriram o site em cada dia (somadas) */
  semana: SomaDoTempo & { pessoas: number };
  /** os 7 dias antes */
  antes: SomaDoTempo & { pessoas: number };
  /** as 12 páginas com mais tempo nos últimos 7 dias */
  paginas: (SomaDoTempo & { pagina: string })[];
  paginas_total: number;
};

/** null: falta a migração 20261208120000 (ou deu erro: o Painel segue sem o tempo). */
export async function tempoNasPaginas(c: ClienteBanco): Promise<TempoNasPaginas | null> {
  const { data, error } = await c.rpc("admin_tempo_paginas");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha no tempo nas páginas: ${error.message}`);
    return null;
  }
  return data as unknown as TempoNasPaginas;
}

/** Admin › Empresas (migração 20261209120000_empresas_catalogo.sql): os números do cadastro. */
export type ResumoEmpresas = {
  empresas: number;
  com_conta: number;
  nao_empresas: number;
  /** com 30 pessoas ou mais: na parte B, só juntam com a mesma época ou a mesma unidade */
  grandes: number;
  curriculos: number;
  trabalhos: number;
  trabalhos_em_empresa: number;
  /** os trabalhos numa empresa que está em 2 currículos ou mais */
  trabalhos_juntos: number;
  curriculos_com_empresa: number;
  /** o número que decide a parte B: os currículos que teriam pelo menos um colega */
  com_colega: number;
};

export type EmpresaDoAdmin = {
  id: number;
  nome: string;
  chave: string;
  tipo: "empresa" | "nao_empresa";
  cnpj: string | null;
  cidade: string | null;
  pessoas: number;
  perfil: { id: string; nome: string; foto_url: string | null } | null;
  /** os outros nomes limpos que levam a ela */
  nomes: string[];
  /** sem conta ligada: as contas de empresa com o nome parecido */
  contas_parecidas: { id: string; nome: string; cidade: string }[] | null;
};

export type EmpresasRepetidas = {
  a: { id: number; nome: string; pessoas: number; com_conta: boolean };
  b: { id: number; nome: string; pessoas: number; com_conta: boolean };
  parecido: number;
}[];

export const FILTROS_EMPRESAS = ["todas", "sem_conta", "com_conta", "nao_empresa"] as const;
export type FiltroEmpresas = (typeof FILTROS_EMPRESAS)[number];

/** null: falta a migração 20261209120000. */
export async function resumoDasEmpresas(c: ClienteBanco): Promise<ResumoEmpresas | null> {
  const { data, error } = await c.rpc("admin_empresas_resumo");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha nos números das empresas: ${error.message}`);
    return null;
  }
  return data as unknown as ResumoEmpresas;
}

export async function listarEmpresasDoAdmin(
  c: ClienteBanco,
  f: { busca?: string; filtro?: FiltroEmpresas; pagina?: number; limite?: number },
): Promise<{ total: number; itens: EmpresaDoAdmin[] }> {
  const { data, error } = await c.rpc("admin_empresas", {
    p_busca: f.busca?.trim() || null,
    p_filtro: f.filtro ?? "todas",
    p_limite: f.limite ?? 50,
    p_pagina: f.pagina ?? 1,
  });
  if (error) falha("as empresas", error);
  return data as unknown as { total: number; itens: EmpresaDoAdmin[] };
}

/** Admin › Empresas › Contas para ligar (migração 20261210120000_empresas_contas.sql). */
export type ContaParaLigar = {
  perfil: { id: string; nome: string; cidade: string; foto: string | null; verificado: boolean; criado_em: string };
  empresa: { id: number; nome: string; pessoas: number };
};

/** Sem a migração 20261210120000: lista vazia. */
export async function contasParaLigar(c: ClienteBanco): Promise<ContaParaLigar[]> {
  const { data, error } = await c.rpc("admin_empresas_contas_para_ligar");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha nas contas para ligar: ${error.message}`);
    return [];
  }
  return (data ?? []) as unknown as ContaParaLigar[];
}

export async function empresasRepetidas(c: ClienteBanco): Promise<EmpresasRepetidas> {
  const { data, error } = await c.rpc("admin_empresas_repetidas", { p_limite: 20 });
  if (error) falha("as empresas repetidas", error);
  return (data ?? []) as unknown as EmpresasRepetidas;
}

/** null: a contagem ainda não existe neste banco (falta rodar a migração 20261019250000). */
export async function acessosDoSite(c: ClienteBanco): Promise<AcessosSite | null> {
  const { data, error } = await c.rpc("admin_acessos_site");
  if (error) {
    console.warn(`Publike: sem a contagem de acessos: ${error.message}`);
    return null;
  }
  return data as unknown as AcessosSite;
}

export async function listarUsuarios(c: ClienteBanco, busca: string | null, filtro: string, pagina: number) {
  const { data, error } = await c.rpc("admin_listar_usuarios", {
    p_busca: busca,
    p_filtro: filtro,
    p_limite: POR_PAGINA,
    p_deslocamento: (pagina - 1) * POR_PAGINA,
  });
  if (error) falha("as contas", error);
  const itens = data ?? [];
  return { itens, total: Number(itens[0]?.total ?? 0), curriculos: await curriculoDasContas(c, itens) };
}

/**
 * O currículo de cada pessoa da página: "salvo", "pdf" (mandou o PDF e não salvou o currículo) ou
 * "nao". Contas que não são de pessoa ficam de fora (não têm currículo).
 */
export type SituacaoCurriculo = "salvo" | "pdf" | "nao";
async function curriculoDasContas(
  c: ClienteBanco,
  itens: { id: string; tipo: string | null }[],
): Promise<Record<string, SituacaoCurriculo>> {
  const pessoas = itens.filter((u) => u.tipo === "pessoa").map((u) => u.id);
  if (!pessoas.length) return {};
  const { data, error } = await c.from("curriculos").select("perfil_id").in("perfil_id", pessoas);
  if (error) {
    console.warn(`Publike: sem a situação dos currículos: ${error.message}`);
    return {};
  }
  const comCurriculo = new Set((data ?? []).map((l) => l.perfil_id));
  const situacao: Record<string, SituacaoCurriculo> = {};
  const agora = await agoraDaRequisicao();
  await Promise.all(
    pessoas.map(async (id) => {
      if (comCurriculo.has(id)) return void (situacao[id] = "salvo");
      // o PDF fica na pasta da pessoa assim que ela envia, antes de salvar (o do chat não conta)
      situacao[id] = (await pdfNaoSalvoDe(c, id, agora).catch(() => null)) ? "pdf" : "nao";
    }),
  );
  return situacao;
}

export async function fichaUsuario(c: ClienteBanco, id: string) {
  const { data, error } = await c.rpc("admin_usuario", { p_id: id });
  if (error) falha("a conta", error);
  return (data as unknown as FichaUsuario | null) ?? null;
}

export async function listarAnuncios(
  c: ClienteBanco,
  f: { busca: string | null; status: string; tipo: string | null; autor: string | null; pagina: number },
) {
  const { data, error } = await c.rpc("admin_listar_anuncios", {
    p_busca: f.busca,
    p_status: f.status,
    p_tipo: f.tipo,
    p_autor: f.autor,
    p_limite: POR_PAGINA,
    p_deslocamento: (f.pagina - 1) * POR_PAGINA,
  });
  if (error) falha("os anúncios", error);
  return { itens: data ?? [], total: Number(data?.[0]?.total ?? 0) };
}

/** Os anúncios em "Outros" (no ar, em análise ou pausados), para o admin pôr na área certa. Os 200 mais novos. */
export async function anunciosEmOutros(c: ClienteBanco) {
  const { data, error } = await c
    .from("anuncios")
    .select("id, tipo, titulo, descricao, status, cidade, bairro, criado_em")
    .eq("categoria", "outros")
    .in("status", ["ativo", "em_analise", "pausado"])
    .order("criado_em", { ascending: false })
    .limit(200);
  if (error) falha("os anúncios em Outros", error);
  return data ?? [];
}

export async function fichaAnuncio(c: ClienteBanco, id: string) {
  const { data, error } = await c.rpc("admin_anuncio", { p_id: id });
  if (error) falha("o anúncio", error);
  return (data as unknown as FichaAnuncio | null) ?? null;
}

/** Advertências da pessoa (textos de avaliação retidos ou removidos). */
export async function advertenciasDe(c: ClienteBanco, usuarioId: string) {
  const { data, error } = await c.rpc("admin_advertencias", { p_usuario: usuarioId });
  if (error) falha("as advertências", error);
  return data ?? [];
}

/** Matches que a pessoa desfez e que desfizeram com ela, com a justificativa. */
export async function matchesDesfeitosDe(c: ClienteBanco, usuarioId: string) {
  const { data, error } = await c.rpc("admin_matches_desfeitos", { p_perfil: usuarioId });
  if (error) falha("os matches desfeitos", error);
  return data ?? [];
}

/** Avaliações retidas pela IA, sem revisão ou denunciadas pelo profissional. */
export async function filaDeAvaliacoes(c: ClienteBanco) {
  const { data, error } = await c.rpc("fila_avaliacoes");
  if (error) falha("a fila de avaliações", error);
  return data ?? [];
}

/** Recados retidos, denunciados ou que a IA não revisou. Sem a migração dos recados, lista vazia. */
export async function filaDeRecados(c: ClienteBanco) {
  const { data, error } = await c.rpc("fila_recados");
  if (error) {
    if (error.code === "PGRST202") return [];
    falha("a fila de recados", error);
  }
  return data ?? [];
}

export async function filaDaModeracao(c: ClienteBanco) {
  const { data, error } = await c.rpc("fila_moderacao");
  if (error) falha("a fila da moderação", error);
  return data ?? [];
}

export async function configDoSite(c: ClienteBanco): Promise<ConfigSite> {
  const { data, error } = await c.rpc("admin_config");
  if (error) falha("as configurações", error);
  const linha = data?.[0];
  if (!linha) throw new Error("Publike: configuração do site não encontrada. Rode a migração do admin.");
  return linha;
}

export async function modelosDeEmail(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_modelos_email");
  if (error) falha("os textos dos e-mails", error);
  return data ?? [];
}

/** Convites por e-mail: quantas contas recebem agora e quantas já receberam (sem a migração, nada). */
export async function convitesPorEmail(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_convites_por_email");
  if (error) {
    console.error("Publike: não deu para ler os convites por e-mail:", error.message);
    return null;
  }
  return data ?? [];
}

/** Os convites no sino (contas sem e-mail). Antes da migração, null: a página mostra só o e-mail. */
export async function avisosDeConvite(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_avisos_de_convite");
  if (error) return null;
  return data ?? [];
}

export async function ultimosEmails(c: ClienteBanco, limite = 40) {
  const { data, error } = await c.rpc("admin_fila_emails", { p_limite: limite });
  if (error) falha("a fila de e-mails", error);
  return data ?? [];
}

/** As contas com e-mail @publike.org confirmado e se veem o Painel no site. Antes da migração, null. */
export async function contasDoPainelNoSite(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_contas_painel_no_site");
  if (error) return null;
  return data ?? [];
}

/** As contas com o copiloto (teste) liberado e o uso em 30 dias. Antes da migração, null. */
export async function contasDoCopiloto(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_copiloto_contas");
  if (error) return null;
  return data ?? [];
}

/** Quantos e-mails saíram por dia (do mais novo ao mais velho). Antes da migração, null: a página segue sem. */
export async function emailsPorDia(c: ClienteBanco, dias = 7) {
  const { data, error } = await c.rpc("admin_emails_por_dia", { p_dias: dias });
  if (error) return null;
  return data ?? [];
}

/** Os números da página do teste do app (/testar-app), por passo e origem. null: banco sem a migração. */
export async function numerosDoTesteApp(c: ClienteBanco, dias = 30) {
  const { data, error } = await c.rpc("admin_numeros_teste_app", { p_dias: dias });
  if (error) return null;
  return data ?? [];
}

/** Os últimos comunicados mandados no sino. null: banco sem a migração 20261129120000. */
export async function comunicadosMandados(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_comunicados", { p_limite: 20 });
  if (error) return null;
  return data ?? [];
}

export type CreditosEmail = {
  emails: number;
  total: number | null;
  vence_em: string | null;
  contado_em: string;
  enviados: number;
};

/**
 * Os créditos do ZeptoMail: o saldo que a equipe informou e os enviados desde então. "vazio": ainda não
 * informado; null: banco sem a migração 20261126120000.
 */
export async function creditosDoEmail(c: ClienteBanco): Promise<CreditosEmail | "vazio" | null> {
  const { data, error } = await c.rpc("admin_creditos_email");
  if (error) return null;
  return data?.[0] ?? "vazio";
}

/** O navegador do último acesso da conta (e se foi pelo app). null: sem registro ou banco sem a migração. */
export async function aparelhoDoUsuario(c: ClienteBanco, usuarioId: string) {
  const { data, error } = await c.rpc("admin_aparelho_do_usuario", { p_usuario: usuarioId });
  if (error) return null;
  return data?.[0] ?? null;
}

/** Os últimos e-mails de uma conta (para ver se chegou ou falhou). */
export async function emailsDoUsuario(c: ClienteBanco, usuarioId: string, limite = 15) {
  const { data, error } = await c.rpc("admin_emails_do_usuario", { p_usuario: usuarioId, p_limite: limite });
  // antes da migração das boas-vindas a função não existe: a página segue sem a lista
  if (error) return null;
  return data ?? [];
}

/** As mensagens da equipe que a conta recebeu. null: banco sem a migração. */
export async function mensagensDaEquipeDe(c: ClienteBanco, contaId: string) {
  const { data, error } = await c.rpc("admin_mensagens_equipe", { p_conta: contaId });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler as mensagens da equipe:", error.message);
    return null;
  }
  return (data ?? []).map((m) => ({ ...m, respostas: lerRespostas(m.respostas) }));
}

/** As respostas às mensagens da equipe que ninguém viu ainda (o painel inicial). null: banco sem a migração. */
export async function respostasNovasDaEquipe(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_respostas_equipe", { p_limite: 10 });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler as respostas da equipe:", error.message);
    return null;
  }
  return data ?? [];
}

export async function decisoesDaIA(c: ClienteBanco, limite = 40) {
  const { data, error } = await c.rpc("admin_decisoes_ia", { p_limite: limite });
  if (error) falha("as decisões da IA", error);
  return data ?? [];
}

export async function ultimoResumo(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_ultimo_resumo");
  if (error) falha("o resumo da IA", error);
  return data?.[0] ?? null;
}

export async function registroDaEquipe(c: ClienteBanco, limite = 30, alvo: string | null = null) {
  const { data, error } = await c.rpc("admin_registro", { p_limite: limite, p_alvo: alvo });
  if (error) falha("o registro da equipe", error);
  return data ?? [];
}

export async function listarModeradores(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_listar_moderadores");
  if (error) falha("os moderadores", error);
  return data ?? [];
}

export async function listarChavesServidor(c: ClienteBanco) {
  const { data, error } = await c.rpc("admin_listar_chaves_servidor");
  if (error) falha("as chaves do servidor", error);
  return data ?? [];
}

/** Contas novas por campanha (o utm do link do anúncio) e quantas publicaram; "direto" são as sem campanha. */
export async function origensDasContas(c: ClienteBanco, desde: string | null) {
  const { data, error } = await c.rpc("admin_origens", desde ? { p_desde: desde } : {});
  if (error) falha("as campanhas", error);
  return data ?? [];
}

/** Um match para o admin: quem curtiu, o anúncio, quem publicou e quando. */
export type MatchAdmin = {
  quando: string;
  curtiu: { id: string; nome: string; tipo: string; bairro: string | null } | null;
  anuncio: { id: string; titulo: string; tipo: string } | null;
  publicou: { id: string; nome: string; tipo: string } | null;
};

/** Os matches desde `desde` (null: todos), do mais novo para o mais antigo (até 300). */
export async function matchesRecentes(c: ClienteBanco, desde: string | null): Promise<MatchAdmin[]> {
  let q = c
    .from("curtidas")
    .select("anuncio_id, perfil_id, respondida_em, criado_em")
    .eq("status", "match")
    .order("respondida_em", { ascending: false, nullsFirst: false })
    .limit(300);
  if (desde) q = q.gte("respondida_em", desde);
  const { data, error } = await q;
  if (error) falha("os matches", error);
  const linhas = data ?? [];
  const idsAnuncios = [...new Set(linhas.map((l) => l.anuncio_id))];
  const { data: anuncios, error: e1 } = idsAnuncios.length
    ? await c.from("anuncios").select("id, titulo, tipo, autor_id").in("id", idsAnuncios)
    : { data: [], error: null };
  if (e1) falha("os anúncios dos matches", e1);
  const porAnuncio = new Map((anuncios ?? []).map((a) => [a.id, a]));
  const idsPerfis = [...new Set([...linhas.map((l) => l.perfil_id), ...(anuncios ?? []).map((a) => a.autor_id)])];
  const { data: perfis, error: e2 } = idsPerfis.length
    ? await c.from("perfis").select("id, nome, tipo, bairro").in("id", idsPerfis)
    : { data: [], error: null };
  if (e2) falha("as contas dos matches", e2);
  const porPerfil = new Map((perfis ?? []).map((p) => [p.id, p]));
  return linhas.map((l) => {
    const a = porAnuncio.get(l.anuncio_id) ?? null;
    const autor = a ? (porPerfil.get(a.autor_id) ?? null) : null;
    return {
      quando: l.respondida_em ?? l.criado_em,
      curtiu: porPerfil.get(l.perfil_id) ?? null,
      anuncio: a ? { id: a.id, titulo: a.titulo, tipo: a.tipo } : null,
      publicou: autor ? { id: autor.id, nome: autor.nome, tipo: autor.tipo } : null,
    };
  });
}

/** Uma pessoa esperando a empresa: o nome curto, a vaga e desde quando. */
export type PessoaEsperando = { nome: string; vaga: string; desde: string };

/** Uma empresa com gente esperando: quem curtiu e espera o aceite, e quem deu match e ainda não recebeu mensagem. */
export type EmpresaEsperando = {
  id: string;
  nome: string;
  tipo: string;
  whatsapp: string | null;
  esperando: PessoaEsperando[];
  semConversa: PessoaEsperando[];
  /** a espera mais antiga (a lista vem dela para a mais nova) */
  maisAntiga: string;
  /** sem e-mail de login confirmado: não recebe os avisos por e-mail, só fica sabendo pelo WhatsApp */
  semEmail: boolean;
  /** a última vez que a equipe avisou pelo WhatsApp (Admin › Esperando); null sem aviso ou sem a migração */
  avisadaEm: string | null;
  /** nunca fez login (a conta foi criada pela equipe ou por convite e ninguém entrou) */
  nuncaEntrou: boolean;
  /** a última vez que a conta usou o Publike: o login ou a última página aberta (marcada a cada 6 h) */
  ultimoAcesso: string | null;
};

/** "Maria Souza" → "Maria S." (o nome inteiro a empresa vê no Publike). */
function nomeCurtoDoCandidato(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 1 ? `${partes[0]} ${partes.at(-1)!.charAt(0).toUpperCase()}.` : partes[0];
}

/**
 * As empresas com gente esperando, nas vagas no ar: quem curtiu e espera o aceite (sem o aceite que
 * espera o currículo, que é com a pessoa) e quem deu match nos últimos 30 dias sem a empresa ter mandado
 * mensagem. Para o admin avisar a empresa pelo WhatsApp (Admin › Esperando). `contaId`: só uma empresa.
 */
export async function empresasComGenteEsperando(
  c: ClienteBanco,
  agora: number,
  contaId: string | null = null,
): Promise<EmpresaEsperando[]> {
  let qv = c
    .from("anuncios")
    .select("id, titulo, autor_id")
    .eq("tipo", "vaga")
    .eq("status", "ativo")
    .gt("expira_em", new Date(agora).toISOString())
    .limit(2000);
  if (contaId) qv = qv.eq("autor_id", contaId);
  const { data: vagas, error: ev } = await qv;
  if (ev) falha("as vagas no ar", ev);
  if (!vagas?.length) return [];
  const vagaDe = new Map(vagas.map((v) => [v.id, v]));
  const desde30 = new Date(agora - 30 * 24 * 3600e3).toISOString();
  const { data: curtidas, error: ec } = await c
    .from("curtidas")
    .select("anuncio_id, perfil_id, status, criado_em, respondida_em, aceita_em")
    .in(
      "anuncio_id",
      vagas.map((v) => v.id),
    )
    .in("status", ["pendente", "match"])
    .limit(5000);
  if (ec) falha("as curtidas das vagas no ar", ec);
  const pendentes = (curtidas ?? []).filter((k) => k.status === "pendente" && !k.aceita_em);
  const matches = (curtidas ?? []).filter((k) => k.status === "match" && (k.respondida_em ?? k.criado_em) >= desde30);

  // os matches em que a empresa ainda não mandou mensagem (a conversa é uma por dupla: conta_a < conta_b)
  const dupla = (a: string, b: string) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const empresaDoMatch = (k: { anuncio_id: string }) => vagaDe.get(k.anuncio_id)!.autor_id;
  const comMensagem = new Set<string>();
  if (matches.length) {
    const lados = [...new Set(matches.flatMap((k) => [k.perfil_id, empresaDoMatch(k)]))];
    const { data: conversas, error: eco } = await c
      .from("conversas")
      .select("id, conta_a, conta_b")
      .in("conta_a", lados)
      .in("conta_b", lados)
      .limit(5000);
    if (eco) falha("as conversas dos matches", eco);
    const queremos = new Set(matches.map((k) => dupla(k.perfil_id, empresaDoMatch(k))));
    const daDupla = new Map(
      (conversas ?? []).filter((x) => queremos.has(`${x.conta_a}:${x.conta_b}`)).map((x) => [x.id, x]),
    );
    if (daDupla.size) {
      const { data: msgs, error: em } = await c
        .from("mensagens")
        .select("conversa_id, autor_id")
        .in("conversa_id", [...daDupla.keys()])
        .limit(20000);
      if (em) falha("as mensagens dos matches", em);
      // a dupla e quem escreveu: só a mensagem da empresa tira o match da lista (a da pessoa, não)
      for (const m of msgs ?? []) {
        const x = daDupla.get(m.conversa_id!);
        if (x) comMensagem.add(`${x.conta_a}:${x.conta_b}>${m.autor_id}`);
      }
    }
  }
  const semConversa = matches.filter(
    (k) => !comMensagem.has(`${dupla(k.perfil_id, empresaDoMatch(k))}>${empresaDoMatch(k)}`),
  );

  const idsPessoas = [...new Set([...pendentes, ...semConversa].map((k) => k.perfil_id))];
  const idsEmpresas = [...new Set([...pendentes, ...semConversa].map(empresaDoMatch))];
  if (!idsEmpresas.length) return [];
  const [{ data: perfis, error: ep }, { data: contatos, error: ect }] = await Promise.all([
    c
      .from("perfis")
      .select("id, nome, tipo")
      .in("id", [...idsPessoas, ...idsEmpresas]),
    c.from("contatos").select("perfil_id, whatsapp").in("perfil_id", idsEmpresas),
  ]);
  if (ep) falha("as contas", ep);
  if (ect) falha("os contatos das empresas", ect);
  const perfilDe = new Map((perfis ?? []).map((p) => [p.id, p]));
  const zapDe = new Map((contatos ?? []).map((x) => [x.perfil_id, x.whatsapp]));

  const porEmpresa = new Map<string, EmpresaEsperando>();
  const pessoa = (k: { anuncio_id: string; perfil_id: string }, desde: string): PessoaEsperando => ({
    nome: nomeCurtoDoCandidato(perfilDe.get(k.perfil_id)?.nome ?? "Alguém"),
    vaga: vagaDe.get(k.anuncio_id)!.titulo,
    desde,
  });
  const da = (id: string) => {
    let e = porEmpresa.get(id);
    if (!e) {
      const p = perfilDe.get(id);
      e = {
        id,
        nome: p?.nome ?? "Conta sem perfil",
        tipo: p?.tipo ?? "empresa",
        whatsapp: zapDe.get(id) ?? null,
        esperando: [],
        semConversa: [],
        maisAntiga: new Date(agora).toISOString(),
        semEmail: false,
        avisadaEm: null,
        nuncaEntrou: false,
        ultimoAcesso: null,
      };
      porEmpresa.set(id, e);
    }
    return e;
  };
  for (const k of pendentes) da(empresaDoMatch(k)).esperando.push(pessoa(k, k.criado_em));
  for (const k of semConversa) da(empresaDoMatch(k)).semConversa.push(pessoa(k, k.respondida_em ?? k.criado_em));
  const porData = (a: PessoaEsperando, b: PessoaEsperando) => a.desde.localeCompare(b.desde);
  for (const e of porEmpresa.values()) {
    e.esperando.sort(porData);
    e.semConversa.sort(porData);
    e.maisAntiga = [...e.esperando, ...e.semConversa].map((p) => p.desde).sort()[0] ?? e.maisAntiga;
  }

  // quem não tem e-mail de login só fica sabendo pelo WhatsApp: vem primeiro
  const empresas = [...porEmpresa.values()];
  const [logins, aparelhos] = await Promise.all([
    Promise.all(empresas.map((e) => c.auth.admin.getUserById(e.id))),
    // a última página aberta (o site marca a cada 6 h); sem registro, a sessão mais recente
    Promise.all(empresas.map((e) => c.rpc("admin_aparelho_do_usuario", { p_usuario: e.id }))),
  ]);
  empresas.forEach((e, i) => {
    const u = logins[i].data?.user;
    e.semEmail = Boolean(u) && !(u!.email && u!.email_confirmed_at);
    e.nuncaEntrou = Boolean(u) && !u!.last_sign_in_at;
    const visto = aparelhos[i].data?.[0]?.quando ?? null;
    const login = u?.last_sign_in_at ?? null;
    const quando = [login, visto].filter((x): x is string => Boolean(x)).map((x) => Date.parse(x));
    e.ultimoAcesso = e.nuncaEntrou || !quando.length ? null : new Date(Math.max(...quando)).toISOString();
  });
  // o último aviso pelo WhatsApp (sem a migração 20261121120000, a lista sai sem ele)
  const { data: avisos } = await c.rpc("admin_empresas_avisadas", { p_contas: empresas.map((e) => e.id) });
  const avisoDe = new Map((avisos ?? []).map((a) => [a.conta_id, a.avisada_em]));
  for (const e of empresas) e.avisadaEm = avisoDe.get(e.id) ?? null;
  return empresas.sort((a, b) => Number(b.semEmail) - Number(a.semEmail) || a.maisAntiga.localeCompare(b.maisAntiga));
}
