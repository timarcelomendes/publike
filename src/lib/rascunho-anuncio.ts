// O rascunho da vaga de quem começou a publicar sem conta: fica só neste aparelho
// (localStorage) enquanto a pessoa preenche e entra; depois de entrar, é publicado e some.

import type { ValoresAnuncio } from "@/components/form-anuncio";
import { lerNumeroBR } from "./numero";
import type { TipoAnuncio } from "./tipos";
import { lerHorario, perguntasDoBanco } from "./vaga-extra";

const CHAVE = "publike_rascunho_vaga";
/** Depois de uma semana, o rascunho não volta mais. */
const VALIDADE = 7 * 24 * 3600e3;

export type Rascunho = { salvo_em: number; campos: [string, string][] };

export function guardarRascunho(form: HTMLFormElement) {
  const campos: [string, string][] = [];
  for (const [k, v] of new FormData(form).entries()) if (typeof v === "string") campos.push([k, v]);
  try {
    localStorage.setItem(CHAVE, JSON.stringify({ salvo_em: Date.now(), campos } satisfies Rascunho));
  } catch {}
}

export function lerRascunhoGuardado(): Rascunho | null {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return null;
    const r = JSON.parse(bruto) as Rascunho;
    if (!Array.isArray(r?.campos) || Date.now() - r.salvo_em > VALIDADE) return null;
    // só vale se tem alguma coisa escrita
    return r.campos.some(([k, v]) => k === "titulo" && v.trim()) ? r : null;
  } catch {
    return null;
  }
}

export function apagarRascunho() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {}
}

export function formDataDoRascunho(r: Rascunho) {
  const f = new FormData();
  for (const [k, v] of r.campos) f.append(k, v);
  return f;
}

/** O rascunho de volta no formulário (o que não estiver nele fica como em `base`). */
export function valoresDoRascunho(r: Rascunho, base: ValoresAnuncio): ValoresAnuncio {
  const um = (k: string) => r.campos.find(([c]) => c === k)?.[1] ?? null;
  const todos = (k: string) => r.campos.filter(([c]) => c === k).map(([, v]) => v);
  const numero = (k: string) => {
    const n = lerNumeroBR(um(k));
    return n != null && Number.isFinite(n) ? n : null;
  };
  const coordenada = (k: string) => {
    const n = Number.parseFloat(um(k) ?? "");
    return Number.isFinite(n) ? n : null;
  };
  const combinar = um("combinar") === "on";
  const horario = lerHorario(um("horario_detalhe"));
  let perguntas = base.perguntas;
  try {
    const p = um("perguntas");
    if (p) perguntas = perguntasDoBanco(JSON.parse(p));
  } catch {}
  return {
    ...base,
    tipo: (um("tipo") as TipoAnuncio) || base.tipo,
    titulo: um("titulo") ?? base.titulo,
    descricao: um("descricao") ?? base.descricao,
    categoria: um("categoria") ?? base.categoria,
    regime: um("regime") || base.regime,
    combinar,
    pagamento_valor: combinar ? null : numero("pagamento_valor"),
    pagamento_unidade: um("pagamento_unidade") || base.pagamento_unidade,
    pagamento_ate: combinar ? null : numero("pagamento_ate"),
    comissao: um("comissao") === "on",
    beneficios_lista: todos("beneficios_lista"),
    beneficios_extras: todos("beneficios_extras"),
    escolaridade_minima: um("escolaridade_minima") || null,
    experiencia: um("experiencia") || null,
    cnh: um("cnh") || null,
    jornada: um("jornada") || null,
    modelo: um("modelo") || base.modelo,
    pcd: um("pcd") || null,
    pede_curriculo: um("pede_curriculo") === "on",
    contato_direto: um("contato_direto") === "on",
    prazo_dias:
      um("prazo") === "sem"
        ? null
        : um("prazo") === "outro"
          ? Number(um("prazo_outro")) || 30
          : Number(um("prazo")) || 30,
    perguntas,
    horario_detalhe: horario.ok ? horario.horario : null,
    vagas: Number(um("vagas")) || 1,
    cidade: um("cidade") || base.cidade,
    bairro: um("bairro") ?? base.bairro,
    cep: um("cep") || base.cep,
    endereco: um("endereco") || base.endereco,
    lat: coordenada("lat"),
    lng: coordenada("lng"),
  };
}
