// Novidades do Publike (/novidades): as escritas em Admin › Novidades (migração 20270122120000_novidades.sql),
// que também podem sair como banner e como recado no sino, e os banners marcados "Também em Novidades", que
// ficam na página mesmo depois de sair do ar (migração 20270118120000). O menu da conta mostra um ponto quando
// há uma mais nova que a última vista (o cookie guarda o dia dela).

export const COOKIE_NOVIDADES = "publike_novidades";

/** Tem novidade mais nova que a última vista? (`vista`: o valor do cookie, um horário ISO) */
export function temNovidadeNova(maisNova: string | null, vista: string | undefined | null) {
  if (!maisNova) return false;
  const visto = vista ? Date.parse(decodeURIComponent(vista)) : Number.NaN;
  return Number.isNaN(visto) || Date.parse(maisNova) > visto;
}

/** Para quem é a novidade. */
export const PARA_NOVIDADE = {
  todos: "Para todos",
  pessoas: "Para quem procura trabalho",
  empresas: "Para quem contrata",
} as const;
export type ParaNovidade = keyof typeof PARA_NOVIDADE;

export function paraDaNovidade(v: string | null | undefined): ParaNovidade {
  return v === "pessoas" || v === "empresas" ? v : "todos";
}
