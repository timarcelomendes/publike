import { z } from "zod";
import { lerNumeroBR } from "./numero";
import { REGIAO } from "./config";
import {
  CIDADES,
  LISTA_REGIMES,
  LISTA_TIPOS_CONTA,
  LISTA_UNIDADES,
  MOTIVOS_DENUNCIA,
  SLUGS_CATEGORIAS,
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

export const esquemaAnuncio = z
  .object({
    tipo: z.enum(["vaga", "servico"], { error: "Escolha se é uma vaga ou um serviço." }),
    titulo: texto(5, 90, "o título"),
    descricao: texto(20, 3000, "a descrição", true),
    categoria: z.enum(SLUGS_CATEGORIAS, { error: "Escolha uma categoria." }),
    regime: z.enum(LISTA_REGIMES).nullable(),
    combinar: z.boolean(),
    pagamento_valor: z.number().nullable(),
    pagamento_unidade: z.enum(LISTA_UNIDADES).nullable(),
    beneficios: opcional(120),
    horario: opcional(120),
    vagas: z
      .number({ error: "Informe quantas pessoas." })
      .int({ error: "Use um número inteiro." })
      .min(1, { error: "Pelo menos 1." })
      .max(999, { error: "No máximo 999." }),
    cidade: z.enum(CIDADES, { error: "Escolha a cidade." }),
    bairro: texto(2, 80, "o bairro"),
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
    if (d.tipo === "vaga" && !d.regime) {
      ctx.addIssue({ code: "custom", path: ["regime"], message: "Escolha o tipo de contratação." });
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
    vagas: Number(campo(formData, "vagas") || "1"),
    cidade: campo(formData, "cidade"),
    bairro: campo(formData, "bairro") ?? "",
    lat: coordenada(campo(formData, "lat")),
    lng: coordenada(campo(formData, "lng")),
  };
  const leitura = esquemaAnuncio.safeParse(bruto);
  if (leitura.success) return { ok: true, dados: leitura.data };
  return { ok: false, erros: { ...errosCruzados(bruto), ...errosPorCampo(leitura.error) } };
}

// ---------------------------------------------------------------- perfil

export function normalizarWhatsapp(valor: string) {
  const d = valor.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  return d;
}

const SEM_CONTATO_PERFIL = "Tire o telefone, e-mail ou link. O contato aparece sozinho quando der match.";

export const esquemaPerfil = z.object({
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
});

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

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
