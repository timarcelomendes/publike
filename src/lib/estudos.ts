import { ESCOLARIDADES, ESCOLARIDADES_COM_CURSO, MAX_ESTUDOS, nomeEscolaridade } from "./constantes";
import type { Estudo } from "./tipos";

// Os estudos do currículo: "Até onde você estudou" (o mais alto, com o curso) e os outros
// (um técnico, outra faculdade, uma pós), cada um com o nível e o curso.

const ORDEM: string[] = ESCOLARIDADES.map((e) => e.valor);

/** Os níveis que um estudo a mais pode ter: os que têm curso. */
export const NIVEIS_DE_OUTRO_ESTUDO = ESCOLARIDADES.filter((e) => ESCOLARIDADES_COM_CURSO.includes(e.valor));

/** Os estudos a mais que vieram do banco (jsonb): só o que tem forma de estudo. */
export function estudosDoBanco(valor: unknown): Estudo[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .flatMap((e) => {
      const o = (e ?? {}) as Record<string, unknown>;
      const nivel = typeof o.nivel === "string" && ORDEM.includes(o.nivel) ? o.nivel : null;
      const curso = typeof o.curso === "string" ? o.curso.replace(/\s+/g, " ").trim() : "";
      return nivel ? [{ nivel, curso }] : [];
    })
    .slice(0, MAX_ESTUDOS);
}

/** "Técnico · Enfermagem", ou só "Ensino médio completo". */
export function textoDoEstudo(nivel: string | null | undefined, curso?: string | null) {
  const nome = nomeEscolaridade(nivel);
  if (!nome) return null;
  return curso ? `${nome} · ${curso}` : nome;
}

/** Todos os estudos, o principal primeiro: ["Superior completo · Administração", "Técnico · Enfermagem"]. */
export function textosDosEstudos(c: { escolaridade: string | null; curso: string | null; estudos?: Estudo[] }) {
  return [
    textoDoEstudo(c.escolaridade, c.curso),
    ...(c.estudos ?? []).map((e) => textoDoEstudo(e.nivel, e.curso)),
  ].filter((t): t is string => Boolean(t));
}

/** O estudo mais alto de todos (o % de match usa este): o principal ou um dos outros. */
export function escolaridadeMaisAlta(c: { escolaridade: string | null; estudos?: Estudo[] }): string | null {
  const niveis = [c.escolaridade, ...(c.estudos ?? []).map((e) => e.nivel)].filter(
    (n): n is string => typeof n === "string" && ORDEM.includes(n),
  );
  return niveis.sort((a, b) => ORDEM.indexOf(b) - ORDEM.indexOf(a))[0] ?? null;
}
