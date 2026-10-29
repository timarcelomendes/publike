import { z } from "zod";
import { cepValido, limparCep } from "./cep";
import { cnpjValido, limparCnpj } from "./cnpj";
import { MAX_HABILIDADES } from "./talentos";
import { arrumarEstudos, experienciaEmBranco } from "./estudos";
import { lerNumeroBR } from "./numero";
import { CAIXA_DO_PUBLIKE as CAIXA, noPublike, ONDE_FUNCIONA } from "./pracas";
import {
  ehComissao,
  lerBeneficiosExtras,
  lerGanhosExtras,
  lerHorario,
  lerPerguntas,
  separarTriagem,
  textoDoHorario,
  type GanhoExtra,
  type HorarioDetalhe,
  type Pergunta,
  type Triagem,
} from "./vaga-extra";
import {
  AREAS_ATENDIMENTO,
  CIDADES,
  CNHS,
  LISTA_REGIMES,
  LISTA_TIPOS_CONTA,
  LISTA_UNIDADES,
  ESCOLARIDADES_COM_CURSO,
  MAX_CURSOS,
  MAX_ESTUDOS,
  MAX_EXPERIENCIAS,
  MAX_FOTOS,
  MAX_SERVICOS,
  MOTIVOS_DENUNCIA,
  SLUGS_CATEGORIAS,
  SLUGS_OFICIOS,
  UNIDADES_SERVICO,
  VALORES_BENEFICIO,
  VALORES_EXPERIENCIA,
  VALORES_JORNADA,
  VALORES_MODELO,
  VALORES_PCD,
  VALORES_DISPONIBILIDADE,
  VALORES_MOTIVO_DESFAZER,
  VALORES_ESCOLARIDADE,
} from "./constantes";

// A mesma regra do banco (public.tem_contato): contato só aparece no match.
const TELEFONE = /(\(?\d{2}\)?[ .-]?)?9?\d{4}[ .-]?\d{4}/;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const LINK_WHATSAPP = /(wa\.me|whatsapp\.com|api\.whatsapp)/i;
const LINK = /(https?:\/\/|www\.)/i;
const SITE = /\b[a-z0-9-]+(\.[a-z0-9-]+)*\.(com|net|org|br|io|app|xyz|info|site|online|store|shop|link|ly|biz|tv|top|vip|club|dev)\b/i;

const FAIXA_DE_ANO = /(19|20)\d{2} ?[-/] ?(19|20)\d{2}/g;

// Para achar site: gov.br é do governo (ninguém registra nome lá). No texto
// livre, ".Com palavra" é frase grudada ("no centro.Com carteira"), não site.
const GOV_BR = /\bgov\.br\b/gi;
const COM_GRUDADO = /([a-z])\.(Com\s+[a-zà-ú])/g;

function procurarContato(texto: string | null | undefined, textoLivre: boolean) {
  if (!texto) return false;
  const t = texto.replace(FAIXA_DE_ANO, "");
  const s = (textoLivre ? t.replace(COM_GRUDADO, "$1. $2") : t).replace(GOV_BR, "gov br");
  return TELEFONE.test(t) || EMAIL.test(t) || LINK_WHATSAPP.test(t) || LINK.test(t) || SITE.test(s);
}

/** Nome, título, bairro, mensagem: sem nenhuma folga. */
export function temContato(texto: string | null | undefined) {
  return procurarContato(texto, false);
}

/** Descrição, sobre, benefícios e horário (texto livre). */
export function temContatoNoTexto(texto: string | null | undefined) {
  return procurarContato(texto, true);
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SEM_CONTATO = "Tire o telefone, e-mail ou link. O contato aparece sozinho quando der match.";

/** "Escreva pelo menos 20 letras (faltam 7)." */
export function faltamLetras(min: number, tamanho: number) {
  const faltam = min - tamanho;
  return `Escreva pelo menos ${min} letras (${faltam === 1 ? "falta 1" : `faltam ${faltam}`}).`;
}

function texto(min: number, max: number, nome: string, textoLivre = false) {
  return z
    .string({ error: `Escreva ${nome}.` })
    .trim()
    .min(1, { error: `Escreva ${nome}.` })
    .min(min, { error: (p) => faltamLetras(min, String(p.input ?? "").length) })
    .max(max, { error: (p) => `Use no máximo ${max} letras (tem ${String(p.input ?? "").length}).` })
    .refine((t) => !procurarContato(t, textoLivre), { error: SEM_CONTATO });
}

function opcional(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Use no máximo ${max} letras.` })
    .refine((t) => !temContatoNoTexto(t), { error: SEM_CONTATO })
    .transform((t) => t || null)
    .nullable();
}

export { lerNumeroBR };

function campo(formData: FormData, nome: string) {
  const v = formData.get(nome);
  return typeof v === "string" ? v : null;
}

/** Converte os problemas do zod em { campo: mensagem }. */
export function errosPorCampo(erro: z.ZodError) {
  const erros: Record<string, string> = {};
  for (const problema of erro.issues) {
    const chave = String(problema.path[0] ?? "geral");
    if (!erros[chave]) erros[chave] = problema.message;
  }
  return erros;
}

// ---------------------------------------------------------------- anúncio

export const SEM_REGIME = "Escolha o tipo de contratação: CLT, diária, freela…";
export const SEM_VALOR = "Escreva quanto paga ou marque “Valor a combinar”.";
export const SEM_CONTRATANTE = "Diga para qual empresa é a vaga ou marque “Empresa confidencial”.";
const FORA_DO_PUBLIKE = `Marque um ponto em ${ONDE_FUNCIONA}.`;

export const esquemaAnuncio = z
  .object({
    tipo: z.enum(["vaga", "servico"], { error: "Escolha se é uma vaga ou um serviço." }),
    titulo: texto(2, 90, "o título"),
    descricao: texto(20, 3000, "a descrição", true),
    categoria: z.enum(SLUGS_CATEGORIAS, { error: "Escolha uma categoria." }),
    regime: z.enum(LISTA_REGIMES).nullable(),
    combinar: z.boolean(),
    pagamento_valor: z.number().nullable(),
    pagamento_unidade: z.enum(LISTA_UNIDADES).nullable(),
    beneficios: opcional(120),
    horario: opcional(120),
    /** vaga: fim da faixa salarial ("de 1.800 a 2.200"); vazio = valor fixo */
    pagamento_ate: z.number().nullable(),
    comissao: z.boolean(),
    beneficios_lista: z.array(z.enum(VALORES_BENEFICIO, { error: "Confira os benefícios marcados." })).max(12),
    escolaridade_minima: z.enum(VALORES_ESCOLARIDADE, { error: "Escolha a escolaridade." }).nullable(),
    experiencia: z.enum(VALORES_EXPERIENCIA, { error: "Escolha a experiência." }).nullable(),
    cnh: z.enum(CNHS, { error: "Escolha a categoria da CNH." }).nullable(),
    jornada: z.enum(VALORES_JORNADA, { error: "Escolha a jornada." }).nullable(),
    modelo: z.enum(VALORES_MODELO, { error: "Escolha o modelo de trabalho." }).nullable(),
    pcd: z.enum(VALORES_PCD, { error: "Escolha uma opção." }).nullable(),
    pede_curriculo: z.boolean(),
    /** contato direto: quem curtir já dá match (sem esperar o aceite) */
    contato_direto: z.boolean(),
    /** a vaga sai do ar sozinha em tantos dias (null: sem prazo) */
    prazo_dias: z
      .number({ error: "Diga em quantos dias, de 1 a 365, ou escolha Sem prazo." })
      .int({ error: "Use um número inteiro de dias." })
      .min(1, { error: "Diga em quantos dias, de 1 a 365, ou escolha Sem prazo." })
      .max(365, { error: "No máximo 365 dias. Para mais, escolha Sem prazo." })
      .nullable(),
    /** quem publica é agência de emprego: a vaga diz a empresa contratante (ou que é confidencial) */
    agencia: z.boolean(),
    contratante: z
      .string()
      .trim()
      .max(80, { error: "Use no máximo 80 letras." })
      .refine((t) => !temContato(t), { error: "Tire o telefone, e-mail ou site do nome da empresa." }),
    contratante_confidencial: z.boolean(),
    /** agência: o cliente escolhido na lista (null: outra empresa; undefined: o formulário não tem a lista) */
    cliente_id: z.string().regex(UUID, { error: "Escolha um cliente da lista." }).nullable().optional(),
    /** agência: a empresa escrita à mão vira cliente */
    guardar_cliente: z.boolean(),
    vagas: z
      .number({ error: "Escreva quantas pessoas a vaga procura." })
      .int({ error: "Use um número inteiro." })
      .min(1, { error: "Pelo menos 1." })
      .max(999, { error: "No máximo 999." }),
    cidade: z.enum(CIDADES, { error: "Escolha a cidade." }),
    bairro: texto(2, 80, "o bairro"),
    /** comércio, empresa e agência: o endereço aparece na vaga (pessoa física: o banco descarta) */
    cep: z
      .string()
      .transform((t) => limparCep(t) || null)
      .refine((c) => c === null || cepValido(c), { error: "O CEP tem 8 números." }),
    endereco: opcional(120),
    lat: z
      .number({ error: "Marque no mapa a região do trabalho." })
      .min(CAIXA.latMin, { error: FORA_DO_PUBLIKE })
      .max(CAIXA.latMax, { error: FORA_DO_PUBLIKE }),
    lng: z
      .number({ error: "Marque no mapa a região do trabalho." })
      .min(CAIXA.lngMin, { error: FORA_DO_PUBLIKE })
      .max(CAIXA.lngMax, { error: FORA_DO_PUBLIKE }),
  })
  .superRefine((d, ctx) => {
    // dentro da caixa, mas fora de todas as praças (com mais de uma praça)
    if (!noPublike({ lat: d.lat, lng: d.lng })) {
      ctx.addIssue({ code: "custom", path: ["lat"], message: FORA_DO_PUBLIKE });
    }
    if (d.tipo === "vaga" && d.titulo.length < 5) {
      ctx.addIssue({ code: "custom", path: ["titulo"], message: faltamLetras(5, d.titulo.length) });
    }
    if (d.tipo === "vaga" && !d.regime) {
      ctx.addIssue({ code: "custom", path: ["regime"], message: SEM_REGIME });
    }
    if (d.tipo === "vaga" && d.agencia && !d.contratante_confidencial && !d.cliente_id && d.contratante.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["contratante"],
        message: d.contratante ? "Use pelo menos 2 letras." : SEM_CONTRATANTE,
      });
    }
    if (!d.combinar) {
      if (d.pagamento_valor == null || Number.isNaN(d.pagamento_valor)) {
        ctx.addIssue({ code: "custom", path: ["pagamento_valor"], message: SEM_VALOR });
      } else if (d.pagamento_valor <= 0 || d.pagamento_valor > 1_000_000) {
        ctx.addIssue({ code: "custom", path: ["pagamento_valor"], message: "Confira o valor." });
      }
      if (!d.pagamento_unidade) {
        ctx.addIssue({ code: "custom", path: ["pagamento_unidade"], message: "Diga se é por hora, dia, mês…" });
      }
      const erroFaixa = conferirFaixa(d.pagamento_valor, d.pagamento_ate);
      if (erroFaixa) ctx.addIssue({ code: "custom", path: ["pagamento_ate"], message: erroFaixa });
    }
  })
  .transform((d) => {
    const daAgencia = d.tipo === "vaga" && d.agencia;
    const escrito = d.contratante.replace(/\s+/g, " ");
    const cliente = daAgencia ? (d.cliente_id ?? null) : null;
    return {
      ...d,
      regime: d.tipo === "vaga" ? d.regime : null,
      ...camposDaVaga(d),
      pagamento_valor: d.combinar ? null : d.pagamento_valor,
      pagamento_unidade: d.combinar ? null : d.pagamento_unidade,
      vagas: d.tipo === "vaga" ? d.vagas : 1,
      pede_curriculo: d.tipo === "vaga" && d.pede_curriculo,
      // com cliente, o nome vem dele (o banco põe); confidencial, a vaga fica sem nome
      contratante: daAgencia && !d.contratante_confidencial && !cliente ? escrito : null,
      contratante_confidencial: daAgencia && d.contratante_confidencial,
      cliente_id: d.cliente_id === undefined ? undefined : cliente,
      /** a empresa escrita à mão que vira cliente ao salvar (também na confidencial) */
      cliente_novo: daAgencia && !cliente && d.guardar_cliente && escrito.length >= 2 ? escrito : null,
    };
  });

/**
 * O que a empresa monta do jeito dela (vaga-extra.ts). `undefined`: o formulário não mandou
 * o campo, e o que está no banco fica como está.
 */
type ExtrasDaVaga = {
  perguntas?: Pergunta[];
  /** a resposta procurada em cada pergunta (fica em vaga_triagem, fora da vaga pública) */
  triagem?: Triagem;
  beneficios_extras?: string[];
  horario_detalhe?: HorarioDetalhe | null;
  /** comissão, bônus, gorjeta... junto do valor */
  ganhos_extras?: GanhoExtra[];
  /** "Começa já": precisa de alguém para começar logo (só quando o formulário tem a caixa) */
  comeca_ja?: boolean;
};

export type DadosAnuncio = z.output<typeof esquemaAnuncio> & ExtrasDaVaga;

/** "De 1.800 a 2.200": o fim é opcional e precisa ser maior que o começo. */
export function conferirFaixa(de: number | null, ate: number | null) {
  if (ate == null) return null;
  if (Number.isNaN(ate) || ate <= 0 || ate > 1_000_000) return "Confira o valor.";
  if (de != null && !Number.isNaN(de) && ate < de) return "O fim da faixa precisa ser maior que o começo.";
  return null;
}

/** Requisitos, benefícios, jornada e faixa só valem para vaga; "de 1.800 a 1.800" vira só 1.800. */
function camposDaVaga(d: {
  tipo: "vaga" | "servico";
  combinar: boolean;
  pagamento_valor: number | null;
  pagamento_ate: number | null;
  comissao: boolean;
  beneficios_lista: string[];
  escolaridade_minima: string | null;
  experiencia: string | null;
  cnh: string | null;
  jornada: string | null;
  modelo: string | null;
  pcd: string | null;
}) {
  const vaga = d.tipo === "vaga";
  const ate = vaga && !d.combinar && d.pagamento_ate !== d.pagamento_valor ? d.pagamento_ate : null;
  return {
    pagamento_ate: ate,
    comissao: vaga && d.comissao,
    beneficios_lista: vaga ? [...new Set(d.beneficios_lista)] : [],
    escolaridade_minima: vaga ? d.escolaridade_minima : null,
    experiencia: vaga ? d.experiencia : null,
    cnh: vaga ? d.cnh : null,
    jornada: vaga ? d.jornada : null,
    modelo: vaga ? d.modelo : null,
    pcd: vaga ? d.pcd : null,
  };
}

/** Os campos que a vaga grava no banco (publicar, editar e a correção da equipe). */
export function registroDoAnuncio(d: DadosAnuncio) {
  return {
    titulo: d.titulo,
    descricao: d.descricao,
    categoria: d.categoria,
    regime: d.regime,
    pagamento_valor: d.pagamento_valor,
    pagamento_unidade: d.pagamento_unidade,
    pagamento_ate: d.pagamento_ate,
    comissao: d.comissao,
    beneficios: d.beneficios,
    beneficios_lista: d.beneficios_lista,
    horario: d.horario,
    ...(d.perguntas !== undefined ? { perguntas: d.perguntas } : {}),
    ...(d.beneficios_extras !== undefined ? { beneficios_extras: d.beneficios_extras } : {}),
    ...(d.horario_detalhe !== undefined ? { horario_detalhe: d.horario_detalhe } : {}),
    ...(d.ganhos_extras !== undefined ? { ganhos_extras: d.ganhos_extras } : {}),
    ...(d.comeca_ja !== undefined ? { comeca_ja: d.comeca_ja } : {}),
    vagas: d.vagas,
    pede_curriculo: d.pede_curriculo,
    contato_direto: d.contato_direto,
    ...(d.tipo === "vaga" ? { prazo_dias: d.prazo_dias } : {}),
    contratante: d.contratante,
    contratante_confidencial: d.contratante_confidencial,
    // sem a lista de clientes no formulário (admin, moderação), o cliente da vaga fica como está
    ...(d.cliente_id !== undefined ? { cliente_id: d.cliente_id } : {}),
    escolaridade_minima: d.escolaridade_minima,
    experiencia: d.experiencia,
    cnh: d.cnh,
    jornada: d.jornada,
    modelo: d.modelo,
    pcd: d.pcd,
    cidade: d.cidade,
    bairro: d.bairro,
    cep: d.endereco ? d.cep : null,
    endereco: d.endereco,
    local: `SRID=4326;POINT(${d.lng} ${d.lat})`,
  };
}

function coordenada(valor: string | null) {
  if (!valor) return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

/** Regras que dependem de mais de um campo, conferidas mesmo quando outros campos têm erro. */
function errosCruzados(bruto: Record<string, unknown>) {
  const erros: Record<string, string> = {};
  const titulo = String(bruto.titulo ?? "").trim();
  if (bruto.tipo === "vaga" && titulo.length >= 2 && titulo.length < 5) erros.titulo = faltamLetras(5, titulo.length);
  if (bruto.tipo === "vaga" && !bruto.regime) erros.regime = SEM_REGIME;
  if (
    bruto.tipo === "vaga" &&
    bruto.agencia &&
    !bruto.contratante_confidencial &&
    !bruto.cliente_id &&
    !String(bruto.contratante).trim()
  ) {
    erros.contratante = SEM_CONTRATANTE;
  }
  if (!bruto.combinar) {
    const valor = bruto.pagamento_valor as number | null;
    if (valor == null || Number.isNaN(valor)) erros.pagamento_valor = SEM_VALOR;
    else if (valor <= 0 || valor > 1_000_000) erros.pagamento_valor = "Confira o valor.";
    if (!bruto.pagamento_unidade) erros.pagamento_unidade = "Diga se é por hora, dia, mês…";
    const erroFaixa = conferirFaixa(valor, bruto.pagamento_ate as number | null);
    if (erroFaixa) erros.pagamento_ate = erroFaixa;
  }
  return erros;
}

export type LeituraAnuncio = { ok: true; dados: DadosAnuncio } | { ok: false; erros: Record<string, string> };

/** O prazo da vaga no formulário: uma opção, "outro" (com o número) ou "sem". Sem o campo, 30 dias. */
function lerPrazo(prazo: string | null, outro: string | null): number | null {
  if (prazo === "sem") return null;
  if (prazo === "outro") return outro ? Number(outro) : Number.NaN;
  return prazo ? Number(prazo) : 30;
}

export function lerAnuncio(formData: FormData): LeituraAnuncio {
  const bruto = {
    tipo: campo(formData, "tipo"),
    titulo: campo(formData, "titulo") ?? "",
    descricao: campo(formData, "descricao") ?? "",
    categoria: campo(formData, "categoria"),
    regime: campo(formData, "regime") || null,
    combinar: campo(formData, "combinar") === "on",
    pagamento_valor: lerNumeroBR(campo(formData, "pagamento_valor")),
    pagamento_unidade: campo(formData, "pagamento_unidade") || null,
    beneficios: campo(formData, "beneficios") ?? "",
    horario: campo(formData, "horario") ?? "",
    pagamento_ate: lerNumeroBR(campo(formData, "pagamento_ate")),
    comissao: campo(formData, "comissao") === "on",
    beneficios_lista: formData.getAll("beneficios_lista").filter((v): v is string => typeof v === "string" && v !== ""),
    escolaridade_minima: campo(formData, "escolaridade_minima") || null,
    experiencia: campo(formData, "experiencia") || null,
    cnh: campo(formData, "cnh") || null,
    jornada: campo(formData, "jornada") || null,
    modelo: campo(formData, "modelo") || null,
    pcd: campo(formData, "pcd") || null,
    pede_curriculo: campo(formData, "pede_curriculo") === "on",
    contato_direto: campo(formData, "contato_direto") === "on",
    prazo_dias: lerPrazo(campo(formData, "prazo"), campo(formData, "prazo_outro")),
    agencia: campo(formData, "agencia") === "1",
    contratante: campo(formData, "contratante") ?? "",
    contratante_confidencial: campo(formData, "contratante_confidencial") === "on",
    cliente_id: formData.has("cliente_id") ? campo(formData, "cliente_id") || null : undefined,
    guardar_cliente: campo(formData, "guardar_cliente") === "on",
    vagas: Number(campo(formData, "vagas") || "1"),
    cidade: campo(formData, "cidade"),
    bairro: campo(formData, "bairro") ?? "",
    cep: campo(formData, "cep") ?? "",
    endereco: campo(formData, "endereco") ?? "",
    lat: coordenada(campo(formData, "lat")),
    lng: coordenada(campo(formData, "lng")),
  };
  const extras = lerExtrasDaVaga(formData, bruto.tipo === "vaga");
  const leitura = esquemaAnuncio.safeParse(bruto);
  if (leitura.success && extras.ok) {
    const d = leitura.data;
    const { horario_detalhe, beneficios_extras, ganhos_extras } = extras.dados;
    return {
      ok: true,
      dados: {
        ...d,
        ...extras.dados,
        // "Mais comissão" de antes: marcado quando um dos ganhos a mais é comissão (cartão e vagas antigas)
        comissao: ganhos_extras ? d.tipo === "vaga" && ganhos_extras.some((g) => ehComissao(g.nome)) : d.comissao,
        // o horário montado e os benefícios a mais também vão em texto: cartão, busca e planilha leem dali
        horario: horario_detalhe ? textoDoHorario(horario_detalhe) : horario_detalhe === null ? null : d.horario,
        beneficios: beneficios_extras ? beneficios_extras.join(", ") || null : d.beneficios,
      },
    };
  }
  return {
    ok: false,
    erros: {
      ...(leitura.success ? {} : { ...errosCruzados(bruto), ...errosPorCampo(leitura.error) }),
      ...(extras.ok ? {} : extras.erros),
    },
  };
}

/** Perguntas, benefícios a mais e horário montado: só da vaga, e só quando o formulário manda. */
function lerExtrasDaVaga(
  formData: FormData,
  vaga: boolean,
): { ok: true; dados: ExtrasDaVaga } | { ok: false; erros: Record<string, string> } {
  const dados: ExtrasDaVaga = {};
  const erros: Record<string, string> = {};
  // "Começa já": só o formulário que tem a caixa manda (o que não tem não mexe); serviço nunca
  if (formData.has("comeca_ja_enviado")) dados.comeca_ja = vaga && formData.get("comeca_ja") === "on";
  if (formData.has("perguntas")) {
    const r = lerPerguntas(vaga ? campo(formData, "perguntas") : null);
    if (r.ok) {
      const { publicas, triagem } = separarTriagem(r.perguntas);
      dados.perguntas = publicas;
      dados.triagem = triagem;
    }
    else erros.perguntas = r.erro;
  }
  if (formData.has("beneficios_extras_enviado")) {
    const r = lerBeneficiosExtras(vaga ? formData.getAll("beneficios_extras") : []);
    if (r.ok) dados.beneficios_extras = r.lista;
    else erros.beneficios_extras = r.erro;
  }
  if (formData.has("horario_detalhe")) {
    const r = lerHorario(vaga ? campo(formData, "horario_detalhe") : null);
    if (r.ok) dados.horario_detalhe = r.horario;
    else erros.horario = r.erro;
  }
  if (formData.has("ganhos_extras")) {
    const r = lerGanhosExtras(vaga ? campo(formData, "ganhos_extras") : null);
    if (r.ok) dados.ganhos_extras = r.lista;
    else erros.ganhos_extras = r.erro;
  }
  // nada de telefone, e-mail ou site escondido nos textos livres
  const textos: [string, string[]][] = [
    ["perguntas", (dados.perguntas ?? []).flatMap((p) => [p.nome, ...p.opcoes])],
    ["beneficios_extras", dados.beneficios_extras ?? []],
    ["horario", dados.horario_detalhe?.obs ? [dados.horario_detalhe.obs] : []],
    ["ganhos_extras", (dados.ganhos_extras ?? []).flatMap((g) => [g.nome, g.detalhe])],
  ];
  for (const [chave, lista] of textos) {
    if (!erros[chave] && lista.some((t) => temContatoNoTexto(t))) erros[chave] = SEM_CONTATO;
  }
  return Object.keys(erros).length ? { ok: false, erros } : { ok: true, dados };
}

// ---------------------------------------------------------------- serviços

/** Caminho de uma foto de trabalho: "<id-da-pessoa>/<data><sorteio>.jpg". */
export const CAMINHO_FOTO_TRABALHO = /^[0-9a-f-]{36}\/\d{10,20}\.jpg$/;

const esquemaServico = z
  .object({
    id: z.string().regex(UUID).nullable(),
    oficio: z.enum(SLUGS_OFICIOS).nullable(),
    categoria: z.enum(SLUGS_CATEGORIAS, { error: "Escolha a categoria." }),
    titulo: texto(2, 90, "o nome do serviço"),
    descricao: texto(20, 3000, "a descrição", true),
    combinar: z.boolean(),
    pagamento_valor: z.number().nullable(),
    pagamento_unidade: z.enum(UNIDADES_SERVICO).nullable(),
    fotos: z
      .array(z.string().regex(CAMINHO_FOTO_TRABALHO, { error: "Envie as fotos de novo." }))
      .max(MAX_FOTOS, { error: `No máximo ${MAX_FOTOS} fotos por serviço.` }),
  })
  .superRefine((d, ctx) => {
    if (d.combinar) return;
    if (d.pagamento_valor == null || Number.isNaN(d.pagamento_valor)) {
      ctx.addIssue({ code: "custom", path: ["pagamento_valor"], message: "Escreva o preço ou marque “A combinar”." });
    } else if (d.pagamento_valor <= 0 || d.pagamento_valor > 1_000_000) {
      ctx.addIssue({ code: "custom", path: ["pagamento_valor"], message: "Confira o valor." });
    }
    if (!d.pagamento_unidade) {
      ctx.addIssue({ code: "custom", path: ["pagamento_unidade"], message: "Diga se é por hora, dia, m²…" });
    }
  })
  .transform((d) => ({
    ...d,
    pagamento_valor: d.combinar ? null : d.pagamento_valor,
    pagamento_unidade: d.combinar ? null : d.pagamento_unidade,
  }));

export const esquemaServicos = z.object({
  servicos: z
    .array(esquemaServico)
    .min(1, { error: "Escolha pelo menos um serviço." })
    .max(MAX_SERVICOS, { error: `Escolha no máximo ${MAX_SERVICOS} serviços.` }),
  atende: z
    .array(z.enum(AREAS_ATENDIMENTO as [string, ...string[]], { error: "Confira os lugares marcados." }))
    .min(1, { error: "Marque pelo menos um lugar onde você atende." })
    .max(30),
  horario: opcional(120),
  cidade: z.enum(CIDADES, { error: "Escolha a cidade." }),
  bairro: texto(2, 80, "o bairro"),
  lat: z
    .number({ error: "Marque no mapa a região onde você fica." })
    .min(CAIXA.latMin, { error: FORA_DO_PUBLIKE })
    .max(CAIXA.latMax, { error: FORA_DO_PUBLIKE }),
  lng: z
    .number({ error: "Marque no mapa a região onde você fica." })
    .min(CAIXA.lngMin, { error: FORA_DO_PUBLIKE })
    .max(CAIXA.lngMax, { error: FORA_DO_PUBLIKE }),
});

export type DadosServicos = z.output<typeof esquemaServicos>;

export type LeituraServicos = { ok: true; dados: DadosServicos } | { ok: false; erros: Record<string, string> };

/**
 * O formulário manda a lista de serviços em JSON (campo "servicos") e o resto
 * em campos comuns. Erros de um serviço voltam como "servicos.0.descricao".
 */
export function lerServicos(formData: FormData): LeituraServicos {
  let lista: unknown = [];
  try {
    lista = JSON.parse(campo(formData, "servicos") ?? "[]");
  } catch {
    return { ok: false, erros: { servicos: "Algo deu errado com a lista de serviços. Recarregue a página." } };
  }
  const servicos = (Array.isArray(lista) ? lista : []).map((x) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const textoDe = (v: unknown) => (typeof v === "string" ? v : "");
    return {
      id: typeof o.id === "string" && o.id ? o.id : null,
      oficio: typeof o.oficio === "string" && o.oficio ? o.oficio : null,
      categoria: textoDe(o.categoria),
      titulo: textoDe(o.titulo),
      descricao: textoDe(o.descricao),
      combinar: o.combinar === true,
      pagamento_valor: lerNumeroBR(textoDe(o.valor)),
      pagamento_unidade: typeof o.unidade === "string" && o.unidade ? o.unidade : null,
      fotos: Array.isArray(o.fotos) ? o.fotos.filter((f): f is string => typeof f === "string") : [],
    };
  });
  const leitura = esquemaServicos.safeParse({
    servicos,
    atende: formData.getAll("atende").filter((v): v is string => typeof v === "string"),
    horario: campo(formData, "horario") ?? "",
    cidade: campo(formData, "cidade"),
    bairro: campo(formData, "bairro") ?? "",
    lat: coordenada(campo(formData, "lat")),
    lng: coordenada(campo(formData, "lng")),
  });
  if (leitura.success) return { ok: true, dados: leitura.data };
  const erros: Record<string, string> = {};
  for (const problema of leitura.error.issues) {
    const chave = problema.path[0] === "servicos" && problema.path.length > 1 ? problema.path.join(".") : String(problema.path[0] ?? "geral");
    if (!erros[chave]) erros[chave] = problema.message;
  }
  return { ok: false, erros };
}

// ---------------------------------------------------------------- currículo

/** Caminho do PDF do currículo: "<id-da-pessoa>/<data>.pdf". */
export const CAMINHO_CURRICULO = /^[0-9a-f-]{36}\/\d{10,20}\.pdf$/;
const MES = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/;

const esquemaExperiencia = z
  .object({
    cargo: texto(2, 80, "o cargo"),
    onde: z
      .string()
      .trim()
      .max(80, { error: "Use no máximo 80 letras." })
      .refine((t) => !temContato(t), { error: SEM_CONTATO }),
    // a unidade ou o bairro da empresa (opcional): separa as lojas de uma rede
    unidade: z
      .string()
      .trim()
      .max(60, { error: "Use no máximo 60 letras." })
      .refine((t) => !temContato(t), { error: SEM_CONTATO })
      .optional(),
    // as datas são opcionais: sem o mês, a experiência entra sem o período
    inicio: z.union([z.string().regex(MES, { error: "Confira o mês em que começou." }), z.literal("")]),
    atual: z.boolean(),
    fim: z.string().regex(MES, { error: "Confira o mês em que saiu." }).nullable(),
    descricao: z
      .string()
      .trim()
      .max(300, { error: "Use no máximo 300 letras." })
      .refine((t) => !temContatoNoTexto(t), { error: SEM_CONTATO }),
  })
  .superRefine((d, ctx) => {
    if (!d.atual && d.inicio && d.fim && d.fim < d.inicio) {
      ctx.addIssue({ code: "custom", path: ["fim"], message: "A saída vem depois da entrada." });
    }
  })
  .transform(({ unidade, ...d }) => ({ ...d, ...(unidade ? { unidade } : {}), fim: d.atual ? null : d.fim }));

const mesmoEstudo = (a: { nivel: string; curso: string }, b: { nivel: string; curso: string }) =>
  a.nivel === b.nivel && a.curso.toLowerCase() === b.curso.toLowerCase();

/** Um estudo a mais: o nível (técnico, faculdade ou pós) e o curso. */
const esquemaEstudo = z.object({
  nivel: z.string().refine((v) => ESCOLARIDADES_COM_CURSO.includes(v), { error: "Escolha o nível do estudo." }),
  curso: z
    .string()
    .transform((t) => t.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(2, { error: "Diga qual curso." })
        .max(80, { error: "Use no máximo 80 letras." })
        .refine((t) => !temContato(t), { error: SEM_CONTATO }),
    ),
});

export const esquemaCurriculo = z
  .object({
    // opcional: sem ele o currículo salva assim mesmo (a força do currículo pede depois)
    escolaridade: z
      .union([z.enum(VALORES_ESCOLARIDADE), z.literal("")], { error: "Escolha até onde você estudou." })
      .transform((v) => v || null),
    curso: z
      .string()
      .trim()
      .max(80, { error: "Use no máximo 80 letras." })
      .refine((t) => !temContato(t), { error: SEM_CONTATO })
      .transform((t) => t || null),
    experiencias: z.array(esquemaExperiencia).max(MAX_EXPERIENCIAS, { error: `No máximo ${MAX_EXPERIENCIAS} experiências.` }),
    /** outros estudos, além do mais alto (sem repetir o mesmo curso) */
    estudos: z
      .array(esquemaEstudo)
      .max(MAX_ESTUDOS, { error: `No máximo ${MAX_ESTUDOS} estudos a mais.` })
      .transform((l) => l.filter((e, i) => l.findIndex((x) => mesmoEstudo(x, e)) === i)),
    cursos: z
      .array(z.string().trim().min(2, { error: "Use pelo menos 2 letras." }).max(80, { error: "Use no máximo 80 letras." }))
      .max(MAX_CURSOS, { error: `No máximo ${MAX_CURSOS} cursos.` })
      .refine((l) => !l.some((t) => temContatoNoTexto(t)), { error: SEM_CONTATO }),
    cnh: z.enum(CNHS).nullable(),
    disponibilidade: z.array(z.enum(VALORES_DISPONIBILIDADE)),
    arquivo: z.string().regex(CAMINHO_CURRICULO, { error: "Envie o PDF de novo." }).nullable(),
    /** o que a pessoa faz ("Auxiliar de cozinha"): o título na aba Talentos */
    titulo: z
      .string()
      .trim()
      .max(60, { error: "Use no máximo 60 letras." })
      .refine((t) => !temContato(t), { error: SEM_CONTATO })
      .transform((t) => t.replace(/\s+/g, " ") || null),
    habilidades: z
      .array(
        z.string().trim().min(2, { error: "Use pelo menos 2 letras." }).max(40, { error: "Use no máximo 40 letras." }),
      )
      .max(MAX_HABILIDADES, { error: `No máximo ${MAX_HABILIDADES} habilidades.` })
      .refine((l) => !l.some((t) => temContato(t)), { error: SEM_CONTATO }),
  })
  .superRefine((d, ctx) => {
    if (d.curso && d.curso.length < 2) ctx.addIssue({ code: "custom", path: ["curso"], message: "Use pelo menos 2 letras." });
    if (d.titulo && d.titulo.length < 2)
      ctx.addIssue({ code: "custom", path: ["titulo"], message: "Use pelo menos 2 letras." });
  });

export type DadosCurriculo = z.output<typeof esquemaCurriculo>;
export type LeituraCurriculo = { ok: true; dados: DadosCurriculo } | { ok: false; erros: Record<string, string> };

/**
 * O formulário manda as experiências e os cursos em JSON e o resto em campos
 * comuns. Erros de uma experiência voltam como "experiencias.0.cargo".
 */
export function lerCurriculo(formData: FormData): LeituraCurriculo {
  let experiencias: unknown = [];
  let cursos: unknown = [];
  let habilidades: unknown = [];
  let estudos: unknown = [];
  try {
    experiencias = JSON.parse(campo(formData, "experiencias") ?? "[]");
    cursos = JSON.parse(campo(formData, "cursos") ?? "[]");
    habilidades = JSON.parse(campo(formData, "habilidades") ?? "[]");
    estudos = JSON.parse(campo(formData, "estudos") ?? "[]");
  } catch {
    return { ok: false, erros: { geral: "Algo deu errado com o formulário. Recarregue a página." } };
  }
  const textoDe = (v: unknown) => (typeof v === "string" ? v : "");
  // o que ficou pela metade não trava: experiência em branco sai; estudo a mais pela metade sai ou vai
  // para Cursos (arrumarEstudos, o mesmo que o formulário faz antes de mandar)
  const listaDeCursos = (Array.isArray(cursos) ? cursos : []).map(textoDe).filter((c) => c.trim());
  const arrumados = arrumarEstudos(
    (Array.isArray(estudos) ? estudos : []).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { nivel: textoDe(o.nivel), curso: textoDe(o.curso) };
    }),
    listaDeCursos,
  );
  const leitura = esquemaCurriculo.safeParse({
    escolaridade: campo(formData, "escolaridade") ?? "",
    curso: campo(formData, "curso") ?? "",
    experiencias: (Array.isArray(experiencias) ? experiencias : [])
      .map((x) => {
        const o = (x ?? {}) as Record<string, unknown>;
        return {
          cargo: textoDe(o.cargo),
          onde: textoDe(o.onde),
          unidade: textoDe(o.unidade),
          inicio: textoDe(o.inicio),
          atual: o.atual === true,
          fim: textoDe(o.fim) || null,
          descricao: textoDe(o.descricao),
        };
      })
      .filter((x) => !experienciaEmBranco(x)),
    estudos: arrumados.estudos,
    cursos: arrumados.cursos,
    cnh: campo(formData, "cnh") || null,
    disponibilidade: formData.getAll("disponibilidade").filter((v): v is string => typeof v === "string"),
    arquivo: campo(formData, "arquivo") || null,
    titulo: campo(formData, "titulo") ?? "",
    habilidades: (Array.isArray(habilidades) ? habilidades : []).map(textoDe).filter((h) => h.trim()),
  });
  if (leitura.success) return { ok: true, dados: leitura.data };
  const erros: Record<string, string> = {};
  for (const problema of leitura.error.issues) {
    const chave =
      (problema.path[0] === "experiencias" || problema.path[0] === "estudos") && problema.path.length > 1
        ? problema.path.join(".")
        : String(problema.path[0] ?? "geral");
    if (!erros[chave]) erros[chave] = problema.message;
  }
  return { ok: false, erros };
}

// ---------------------------------------------------------------- desfazer match

export const esquemaDesfazerMatch = z.object({
  anuncio: z.string().regex(UUID, { error: "Match não encontrado." }),
  perfil: z.string().regex(UUID, { error: "Match não encontrado." }),
  motivo: z.enum(VALORES_MOTIVO_DESFAZER, { error: "Escolha o motivo." }),
  futuro: z.enum(["sim", "nao"], { error: "Responda se toparia negociar em outro momento." }),
  justificativa: z
    .string({ error: "Explique por que está desfazendo." })
    .transform((t) => t.replace(/\s+/g, " ").trim())
    .pipe(
      z
        .string()
        .min(10, { error: "Explique em poucas palavras (pelo menos 10 letras)." })
        .max(500, { error: "Use no máximo 500 letras." }),
    ),
});

export function lerDesfazerMatch(formData: FormData) {
  const leitura = esquemaDesfazerMatch.safeParse({
    anuncio: campo(formData, "anuncio") ?? "",
    perfil: campo(formData, "perfil") ?? "",
    motivo: campo(formData, "motivo"),
    futuro: campo(formData, "futuro"),
    justificativa: campo(formData, "justificativa") ?? "",
  });
  if (leitura.success) return { ok: true as const, dados: leitura.data };
  return { ok: false as const, erros: errosPorCampo(leitura.error) };
}

// ---------------------------------------------------------------- perfil

export function normalizarWhatsapp(valor: string) {
  const d = valor.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

const SEM_CONTATO_PERFIL = "Tire o telefone, e-mail ou link. O contato aparece sozinho quando der match.";

export const esquemaPerfil = z
  .object({
    nome: z
      .string()
      .trim()
      .min(2, { error: "Escreva seu nome (ou o nome do comércio)." })
      .max(80, { error: "Use no máximo 80 letras." })
      .refine((t) => !temContato(t), { error: SEM_CONTATO_PERFIL }),
    tipo: z.enum(LISTA_TIPOS_CONTA, { error: "Escolha uma opção." }),
    cidade: z.enum(CIDADES, { error: "Escolha a cidade." }),
    bairro: z
      .string()
      .trim()
      .max(80, { error: "Use no máximo 80 letras." })
      .refine((t) => !temContato(t), { error: SEM_CONTATO_PERFIL })
      .transform((t) => t || null)
      .nullable(),
    sobre: z
      .string()
      .trim()
      .max(600, { error: "Use no máximo 600 letras." })
      .refine((t) => !temContatoNoTexto(t), { error: SEM_CONTATO_PERFIL })
      .transform((t) => t || null)
      .nullable(),
    servicos: z
      .array(z.string().trim().min(2).max(40))
      .max(12, { error: "Escolha até 12 itens." })
      .refine((lista) => !temContato(lista.join(" ")), { error: SEM_CONTATO_PERFIL }),
    foto: z
      .string()
      .regex(/^[0-9a-f-]{36}\/\d{10,16}\.jpg$/, { error: "Envie a foto de novo." })
      .nullable(),
    whatsapp: z
      .string()
      .transform(normalizarWhatsapp)
      .refine((d) => /^55[1-9]\d\d{8,9}$/.test(d), { error: "Confira o número: DDD + número, como (62) 99999-0000." }),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .refine((t) => !t || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t), { error: "Confira o e-mail." })
      .transform((t) => t || null),
    receber_emails: z.boolean(),
    /** agência: obrigatório; comércio e empresa: opcional; pessoa: não guarda (o banco confere de novo) */
    cnpj: z.string().transform(limparCnpj),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === "pessoa") return;
    if (!d.cnpj) {
      if (d.tipo === "agencia") ctx.addIssue({ code: "custom", path: ["cnpj"], message: "Informe o CNPJ da agência." });
    } else if (!cnpjValido(d.cnpj)) {
      ctx.addIssue({ code: "custom", path: ["cnpj"], message: "Confira o CNPJ: algum número ou letra não bate." });
    }
  })
  .transform((d) => ({ ...d, cnpj: d.tipo === "pessoa" ? null : d.cnpj || null }));

export type DadosPerfil = z.output<typeof esquemaPerfil>;

export function lerPerfil(formData: FormData) {
  const servicos = (campo(formData, "servicos") ?? "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)
    .slice(0, 12);
  return esquemaPerfil.safeParse({
    nome: campo(formData, "nome") ?? "",
    tipo: campo(formData, "tipo"),
    cidade: campo(formData, "cidade"),
    bairro: campo(formData, "bairro") ?? "",
    sobre: campo(formData, "sobre") ?? "",
    servicos,
    foto: campo(formData, "foto") || null,
    whatsapp: campo(formData, "whatsapp") ?? "",
    email: campo(formData, "email") ?? "",
    receber_emails: campo(formData, "receber_emails") === "on",
    cnpj: campo(formData, "cnpj") ?? "",
  });
}

// ---------------------------------------------------------------- cliente da agência

const SEM_CONTATO_NO_NOME = "Tire o telefone, e-mail ou link do nome da empresa.";

/** Os dados de um cliente da agência. Só o nome aparece na vaga; o resto fica com a agência. */
export const esquemaCliente = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "Escreva o nome da empresa." })
    .max(80, { error: "Use no máximo 80 letras." })
    .refine((t) => !temContato(t), { error: SEM_CONTATO_NO_NOME })
    .transform((t) => t.replace(/\s+/g, " ")),
  cnpj: z
    .string()
    .transform(limparCnpj)
    .refine((c) => !c || cnpjValido(c), { error: "Confira o CNPJ: algum número ou letra não bate." })
    .transform((c) => c || null),
  confidencial: z.boolean(),
  cidade: z.enum(CIDADES, { error: "Escolha a cidade." }).nullable(),
  bairro: z
    .string()
    .trim()
    .max(80, { error: "Use no máximo 80 letras." })
    .refine((t) => !temContato(t), { error: SEM_CONTATO })
    .transform((t) => t || null),
  cep: z
    .string()
    .transform((t) => limparCep(t) || null)
    .refine((c) => c === null || cepValido(c), { error: "O CEP tem 8 números." }),
  endereco: z
    .string()
    .trim()
    .max(120, { error: "Use no máximo 120 letras." })
    .refine((t) => !temContato(t), { error: SEM_CONTATO })
    .transform((t) => t || null),
  lat: z.number().min(CAIXA.latMin).max(CAIXA.latMax).nullable(),
  lng: z.number().min(CAIXA.lngMin).max(CAIXA.lngMax).nullable(),
  responsavel: z
    .string()
    .trim()
    .max(80, { error: "Use no máximo 80 letras." })
    .transform((t) => t.replace(/\s+/g, " ") || null),
  telefone: z
    .string()
    .transform(normalizarWhatsapp)
    .refine((d) => !d || /^55[1-9]\d\d{8,9}$/.test(d), {
      error: "Confira o número: DDD + número, como (62) 99999-0000.",
    })
    .transform((d) => d || null),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(120, { error: "Use no máximo 120 letras." })
    .refine((t) => !t || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t), { error: "Confira o e-mail." })
    .transform((t) => t || null),
  nota: z
    .string()
    .trim()
    .max(1000, { error: "Use no máximo 1000 letras." })
    .transform((t) => t || null),
});

export type DadosCliente = z.output<typeof esquemaCliente>;

export function lerCliente(formData: FormData) {
  const lat = coordenada(campo(formData, "lat"));
  const lng = coordenada(campo(formData, "lng"));
  const cidade = campo(formData, "cidade");
  return esquemaCliente.safeParse({
    nome: campo(formData, "nome") ?? "",
    cnpj: campo(formData, "cnpj") ?? "",
    confidencial: campo(formData, "confidencial") === "on",
    cidade: cidade || null,
    bairro: campo(formData, "bairro") ?? "",
    cep: campo(formData, "cep") ?? "",
    endereco: campo(formData, "endereco") ?? "",
    // o ponto vale inteiro (os dois números) ou nada
    lat: lat !== undefined && lng !== undefined ? lat : null,
    lng: lat !== undefined && lng !== undefined ? lng : null,
    responsavel: campo(formData, "responsavel") ?? "",
    telefone: campo(formData, "telefone") ?? "",
    email: campo(formData, "email") ?? "",
    nota: campo(formData, "nota") ?? "",
  });
}

// ---------------------------------------------------------------- denúncia

const MOTIVOS = MOTIVOS_DENUNCIA.map((m) => m.valor) as [string, ...string[]];

export const esquemaDenuncia = z.object({
  anuncio_id: z.string().min(1),
  motivo: z.enum(MOTIVOS, { error: "Escolha o motivo." }),
  detalhes: z
    .string()
    .trim()
    .max(1000, { error: "Use no máximo 1000 letras." })
    .transform((t) => t || null),
});

// ---------------------------------------------------------------- recado

/** O recado da linha do tempo: texto de 1 a 280 letras, foto e anúncio citado opcionais. */
export const esquemaRecado = z.object({
  texto: z
    .string()
    .transform((t) =>
      t
        .replace(/\r\n?/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim(),
    )
    .pipe(
      z
        .string()
        .min(1, { error: "Escreva o recado." })
        .max(280, { error: "Use no máximo 280 letras." })
        .refine((t) => !temContatoNoTexto(t), {
          error: "Tire o telefone, o e-mail ou o link. O contato é pela conversa do Publike.",
        }),
    ),
  foto: z
    .string()
    .regex(/^[0-9a-f-]{36}\/\d{10,16}\.jpg$/, { error: "Envie a foto de novo." })
    .nullable(),
  anuncio_id: z.string().regex(UUID, { error: "Cite outra vaga." }).nullable(),
  talento_id: z.string().regex(UUID, { error: "Escolha outro currículo." }).nullable(),
});

export function lerRecado(formData: FormData) {
  return esquemaRecado.safeParse({
    texto: campo(formData, "texto") ?? "",
    foto: campo(formData, "foto") || null,
    anuncio_id: campo(formData, "anuncio_id") || null,
    talento_id: campo(formData, "talento_id") || null,
  });
}

export function lerDenuncia(formData: FormData) {
  return esquemaDenuncia.safeParse({
    anuncio_id: campo(formData, "anuncio_id") ?? "",
    motivo: campo(formData, "motivo"),
    detalhes: campo(formData, "detalhes") ?? "",
  });
}


