import { z } from "zod";
import { cepValido, limparCep } from "./cep";
import { cnpjValido, limparCnpj } from "./cnpj";
import { lerNumeroBR } from "./numero";
import { REGIAO } from "./config";
import {
  AREAS_ATENDIMENTO,
  CIDADES,
  CNHS,
  LISTA_REGIMES,
  LISTA_TIPOS_CONTA,
  LISTA_UNIDADES,
  MAX_CURSOS,
  MAX_EXPERIENCIAS,
  MAX_FOTOS,
  MAX_SERVICOS,
  MOTIVOS_DENUNCIA,
  SLUGS_CATEGORIAS,
  SLUGS_OFICIOS,
  UNIDADES_SERVICO,
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

function texto(min: number, max: number, nome: string, textoLivre = false) {
  return z
    .string({ error: `Preencha ${nome}.` })
    .trim()
    .min(min, { error: min <= 1 ? `Preencha ${nome}.` : `Use pelo menos ${min} letras.` })
    .max(max, { error: `Use no máximo ${max} letras.` })
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

const SEM_CONTRATANTE = "Diga para qual empresa é a vaga ou marque “Empresa confidencial”.";

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
    pede_curriculo: z.boolean(),
    /** quem publica é agência de emprego: a vaga diz a empresa contratante (ou que é confidencial) */
    agencia: z.boolean(),
    contratante: z
      .string()
      .trim()
      .max(80, { error: "Use no máximo 80 letras." })
      .refine((t) => !temContato(t), { error: "Tire o telefone, e-mail ou site do nome da empresa." }),
    contratante_confidencial: z.boolean(),
    vagas: z
      .number({ error: "Informe quantas pessoas." })
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
      .min(REGIAO.latMin, { error: "Marque um ponto em Goiânia e região." })
      .max(REGIAO.latMax, { error: "Marque um ponto em Goiânia e região." }),
    lng: z
      .number({ error: "Marque no mapa a região do trabalho." })
      .min(REGIAO.lngMin, { error: "Marque um ponto em Goiânia e região." })
      .max(REGIAO.lngMax, { error: "Marque um ponto em Goiânia e região." }),
  })
  .superRefine((d, ctx) => {
    if (d.tipo === "vaga" && d.titulo.length < 5) {
      ctx.addIssue({ code: "custom", path: ["titulo"], message: "Use pelo menos 5 letras." });
    }
    if (d.tipo === "vaga" && !d.regime) {
      ctx.addIssue({ code: "custom", path: ["regime"], message: "Escolha o tipo de contratação." });
    }
    if (d.tipo === "vaga" && d.agencia && !d.contratante_confidencial && d.contratante.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["contratante"],
        message: d.contratante ? "Use pelo menos 2 letras." : SEM_CONTRATANTE,
      });
    }
    if (!d.combinar) {
      if (d.pagamento_valor == null || Number.isNaN(d.pagamento_valor)) {
        ctx.addIssue({ code: "custom", path: ["pagamento_valor"], message: "Informe o valor ou marque “A combinar”." });
      } else if (d.pagamento_valor <= 0 || d.pagamento_valor > 1_000_000) {
        ctx.addIssue({ code: "custom", path: ["pagamento_valor"], message: "Confira o valor." });
      }
      if (!d.pagamento_unidade) {
        ctx.addIssue({ code: "custom", path: ["pagamento_unidade"], message: "Diga se é por hora, dia, mês…" });
      }
    }
  })
  .transform((d) => ({
    ...d,
    regime: d.tipo === "vaga" ? d.regime : null,
    pagamento_valor: d.combinar ? null : d.pagamento_valor,
    pagamento_unidade: d.combinar ? null : d.pagamento_unidade,
    vagas: d.tipo === "vaga" ? d.vagas : 1,
    pede_curriculo: d.tipo === "vaga" && d.pede_curriculo,
    contratante:
      d.tipo === "vaga" && d.agencia && !d.contratante_confidencial ? d.contratante.replace(/\s+/g, " ") : null,
    contratante_confidencial: d.tipo === "vaga" && d.agencia && d.contratante_confidencial,
  }));

export type DadosAnuncio = z.output<typeof esquemaAnuncio>;

function coordenada(valor: string | null) {
  if (!valor) return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

/** Regras que dependem de mais de um campo, conferidas mesmo quando outros campos têm erro. */
function errosCruzados(bruto: Record<string, unknown>) {
  const erros: Record<string, string> = {};
  if (bruto.tipo === "vaga" && !bruto.regime) erros.regime = "Escolha o tipo de contratação.";
  if (bruto.tipo === "vaga" && bruto.agencia && !bruto.contratante_confidencial && !String(bruto.contratante).trim()) {
    erros.contratante = SEM_CONTRATANTE;
  }
  if (!bruto.combinar) {
    const valor = bruto.pagamento_valor as number | null;
    if (valor == null || Number.isNaN(valor)) erros.pagamento_valor = "Informe o valor ou marque “A combinar”.";
    else if (valor <= 0 || valor > 1_000_000) erros.pagamento_valor = "Confira o valor.";
    if (!bruto.pagamento_unidade) erros.pagamento_unidade = "Diga se é por hora, dia, mês…";
  }
  return erros;
}

export type LeituraAnuncio = { ok: true; dados: DadosAnuncio } | { ok: false; erros: Record<string, string> };

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
    pede_curriculo: campo(formData, "pede_curriculo") === "on",
    agencia: campo(formData, "agencia") === "1",
    contratante: campo(formData, "contratante") ?? "",
    contratante_confidencial: campo(formData, "contratante_confidencial") === "on",
    vagas: Number(campo(formData, "vagas") || "1"),
    cidade: campo(formData, "cidade"),
    bairro: campo(formData, "bairro") ?? "",
    cep: campo(formData, "cep") ?? "",
    endereco: campo(formData, "endereco") ?? "",
    lat: coordenada(campo(formData, "lat")),
    lng: coordenada(campo(formData, "lng")),
  };
  const leitura = esquemaAnuncio.safeParse(bruto);
  if (leitura.success) return { ok: true, dados: leitura.data };
  return { ok: false, erros: { ...errosCruzados(bruto), ...errosPorCampo(leitura.error) } };
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
      ctx.addIssue({ code: "custom", path: ["pagamento_valor"], message: "Informe o preço ou marque “A combinar”." });
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
    .min(REGIAO.latMin, { error: "Marque um ponto em Goiânia e região." })
    .max(REGIAO.latMax, { error: "Marque um ponto em Goiânia e região." }),
  lng: z
    .number({ error: "Marque no mapa a região onde você fica." })
    .min(REGIAO.lngMin, { error: "Marque um ponto em Goiânia e região." })
    .max(REGIAO.lngMax, { error: "Marque um ponto em Goiânia e região." }),
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
    inicio: z.string().regex(MES, { error: "Diga o mês em que começou." }),
    atual: z.boolean(),
    fim: z.string().regex(MES, { error: "Diga o mês em que saiu." }).nullable(),
    descricao: z
      .string()
      .trim()
      .max(300, { error: "Use no máximo 300 letras." })
      .refine((t) => !temContatoNoTexto(t), { error: SEM_CONTATO }),
  })
  .superRefine((d, ctx) => {
    if (!d.atual && !d.fim) ctx.addIssue({ code: "custom", path: ["fim"], message: "Diga o mês em que saiu ou marque “Trabalho aqui”." });
    if (!d.atual && d.fim && d.fim < d.inicio) ctx.addIssue({ code: "custom", path: ["fim"], message: "A saída vem depois da entrada." });
  })
  .transform(({ atual, ...d }) => ({ ...d, fim: atual ? null : d.fim }));

export const esquemaCurriculo = z
  .object({
    escolaridade: z.enum(VALORES_ESCOLARIDADE, { error: "Escolha até onde você estudou." }),
    curso: z
      .string()
      .trim()
      .max(80, { error: "Use no máximo 80 letras." })
      .refine((t) => !temContato(t), { error: SEM_CONTATO })
      .transform((t) => t || null),
    experiencias: z.array(esquemaExperiencia).max(MAX_EXPERIENCIAS, { error: `No máximo ${MAX_EXPERIENCIAS} experiências.` }),
    cursos: z
      .array(z.string().trim().min(2, { error: "Use pelo menos 2 letras." }).max(80, { error: "Use no máximo 80 letras." }))
      .max(MAX_CURSOS, { error: `No máximo ${MAX_CURSOS} cursos.` })
      .refine((l) => !l.some((t) => temContatoNoTexto(t)), { error: SEM_CONTATO }),
    cnh: z.enum(CNHS).nullable(),
    disponibilidade: z.array(z.enum(VALORES_DISPONIBILIDADE)),
    arquivo: z.string().regex(CAMINHO_CURRICULO, { error: "Envie o PDF de novo." }).nullable(),
  })
  .superRefine((d, ctx) => {
    if (d.curso && d.curso.length < 2) ctx.addIssue({ code: "custom", path: ["curso"], message: "Use pelo menos 2 letras." });
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
  try {
    experiencias = JSON.parse(campo(formData, "experiencias") ?? "[]");
    cursos = JSON.parse(campo(formData, "cursos") ?? "[]");
  } catch {
    return { ok: false, erros: { geral: "Algo deu errado com o formulário. Recarregue a página." } };
  }
  const textoDe = (v: unknown) => (typeof v === "string" ? v : "");
  const leitura = esquemaCurriculo.safeParse({
    escolaridade: campo(formData, "escolaridade"),
    curso: campo(formData, "curso") ?? "",
    experiencias: (Array.isArray(experiencias) ? experiencias : []).map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return {
        cargo: textoDe(o.cargo),
        onde: textoDe(o.onde),
        inicio: textoDe(o.inicio),
        atual: o.atual === true,
        fim: textoDe(o.fim) || null,
        descricao: textoDe(o.descricao),
      };
    }),
    cursos: (Array.isArray(cursos) ? cursos : []).map(textoDe).filter((c) => c.trim()),
    cnh: campo(formData, "cnh") || null,
    disponibilidade: formData.getAll("disponibilidade").filter((v): v is string => typeof v === "string"),
    arquivo: campo(formData, "arquivo") || null,
  });
  if (leitura.success) return { ok: true, dados: leitura.data };
  const erros: Record<string, string> = {};
  for (const problema of leitura.error.issues) {
    const chave =
      problema.path[0] === "experiencias" && problema.path.length > 1 ? problema.path.join(".") : String(problema.path[0] ?? "geral");
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

export function lerDenuncia(formData: FormData) {
  return esquemaDenuncia.safeParse({
    anuncio_id: campo(formData, "anuncio_id") ?? "",
    motivo: campo(formData, "motivo"),
    detalhes: campo(formData, "detalhes") ?? "",
  });
}


