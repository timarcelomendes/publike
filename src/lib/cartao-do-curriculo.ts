import type { TalentoResumo } from "./talentos";
import type { Curriculo, Experiencia } from "./tipos";

// O cartão da aba Talentos montado com o que está no formulário do currículo, antes de salvar (a tela do currículo
// mostra ao vivo como as empresas veem). As contas são as mesmas do banco: privado.cargos_do_curriculo e
// privado.meses_de_experiencia.

const MES = /^\d{4}-\d{2}$/;

/** Os cargos das experiências, sem repetir, na ordem do currículo, até três. */
export function cargosDoCurriculo(experiencias: Pick<Experiencia, "cargo">[]) {
  const cargos: string[] = [];
  for (const e of experiencias) {
    const cargo = e.cargo.trim();
    if (cargo.length >= 2 && !cargos.includes(cargo)) cargos.push(cargo);
  }
  return cargos.slice(0, 3);
}

/** Os meses de experiência, somando os trabalhos: o atual conta até `hoje` ("2026-11"); sem a entrada, não conta. */
export function mesesDeExperiencia(experiencias: Pick<Experiencia, "inicio" | "fim" | "atual">[], hoje: string) {
  let total = 0;
  for (const e of experiencias) {
    if (!MES.test(e.inicio)) continue;
    const fim = e.atual ? hoje : e.fim && MES.test(e.fim) ? e.fim : null;
    if (!fim) continue;
    const [a1, m1] = e.inicio.split("-").map(Number);
    const [a2, m2] = fim.split("-").map(Number);
    total += Math.max(0, a2 * 12 + m2 - (a1 * 12 + m1) + 1);
  }
  return total;
}

/** O cartão da aba Talentos com o currículo do formulário (o nome já encurtado, como no banco). */
export function cartaoDoCurriculo(
  c: Curriculo,
  pessoa: { id: string; nome: string; bairro: string | null; cidade: string },
  hoje: string,
): TalentoResumo {
  return {
    perfil_id: pessoa.id,
    nome: pessoa.nome,
    cidade: pessoa.cidade,
    bairro: pessoa.bairro,
    titulo: c.titulo?.trim() || null,
    habilidades: c.habilidades ?? [],
    cursos: c.cursos,
    escolaridade: c.escolaridade || null,
    cnh: c.cnh || null,
    disponibilidade: c.disponibilidade,
    cargos: cargosDoCurriculo(c.experiencias),
    meses_experiencia: mesesDeExperiencia(c.experiencias, hoje),
    atualizado_em: c.atualizado_em,
  };
}
