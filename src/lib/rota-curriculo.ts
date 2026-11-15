import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import { textoDoPeriodo } from "@/lib/experiencia";
import { funcaoPeloTitulo, tituloDaFuncao } from "@/lib/funcao-cbo";
import type { Curriculo, MeuPerfil } from "@/lib/tipos";

// Rota do currículo (claude/plano-base-de-empresas-da-receita.md, parte 2): o currículo como vai no papel. Fica guardado
// na rota (migração 20270605120000) e é o mesmo que o dono do comércio vê pelo QR code, nada além do que foi entregue.

export type CurriculoImpresso = {
  nome: string;
  titulo: string | null;
  whatsapp: string | null;
  email: string | null;
  cidade: string;
  bairro: string | null;
  sobre: string | null;
  experiencias: { cargo: string; onde: string; periodo: string; descricao: string }[];
  estudo: string | null;
  cursos: string[];
  habilidades: string[];
  cnh: string | null;
  disponibilidade: string[];
};

export type CopiaDaRota = {
  codigo: string;
  cnpj: string;
  nome: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  distancia_m: number | null;
  entregue_em: string | null;
  desligada: boolean;
  aberturas: number;
  aberta_em: string | null;
};

export type RotaDoCurriculo = {
  id: string;
  funcao: string;
  raio_km: number;
  criada_em: string;
  curriculo: CurriculoImpresso;
  copias: CopiaDaRota[];
};

export const RAIOS_DA_ROTA = [1, 2, 5] as const;
export const MAX_LUGARES_DA_ROTA = 15;

function telefoneBonito(t: string | null) {
  const d = String(t ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return t || null;
}

/** O currículo da conta pronto para o papel. */
export function curriculoImpresso(perfil: MeuPerfil, c: Curriculo, funcao: string): CurriculoImpresso {
  const escolaridade = nomeEscolaridade(c.escolaridade);
  return {
    nome: perfil.nome,
    titulo: c.titulo?.trim() || funcao,
    whatsapp: telefoneBonito(perfil.whatsapp),
    email: perfil.email,
    cidade: perfil.cidade,
    bairro: perfil.bairro,
    sobre: perfil.sobre?.trim() ? perfil.sobre.trim().slice(0, 600) : null,
    experiencias: (c.experiencias ?? []).slice(0, 6).map((e) => ({
      cargo: e.cargo,
      onde: e.onde,
      periodo: textoDoPeriodo(e),
      descricao: (e.descricao ?? "").trim().slice(0, 300),
    })),
    estudo: escolaridade ? [escolaridade, c.curso].filter(Boolean).join(": ") : null,
    cursos: (c.cursos ?? []).slice(0, 8),
    habilidades: (c.habilidades ?? []).slice(0, 12),
    cnh: c.cnh ? `CNH ${c.cnh}` : null,
    disponibilidade: (c.disponibilidade ?? []).map(nomeDisponibilidade),
  };
}

/** As funções que o currículo diz (o título e os cargos), sem repetir, com o título curto. */
export function funcoesDoCurriculo(c: Curriculo | null) {
  if (!c) return [];
  const vistas = new Map<string, string>();
  for (const texto of [c.titulo, ...(c.experiencias ?? []).map((e) => e.cargo)]) {
    const f = funcaoPeloTitulo(texto);
    if (f && !vistas.has(f.cbo)) vistas.set(f.cbo, tituloDaFuncao(f.cbo) ?? f.nome);
  }
  return [...vistas].map(([cbo, titulo]) => ({ cbo, titulo }));
}

/** "800 m" ou "1,4 km". */
export function distanciaCurta(m: number | null) {
  if (m == null) return null;
  if (m < 1000) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  return `${(m / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}
