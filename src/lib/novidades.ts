// Novidades do Publike (/novidades): os banners marcados "Também em Novidades" no admin, que ficam na
// página mesmo depois de sair do ar (migração 20270118120000_novidades_do_publike.sql). O menu da conta
// mostra um ponto quando há uma mais nova que a última vista (o cookie guarda o dia dela).

export const COOKIE_NOVIDADES = "publike_novidades";

/** Tem novidade mais nova que a última vista? (`vista`: o valor do cookie, um horário ISO) */
export function temNovidadeNova(maisNova: string | null, vista: string | undefined | null) {
  if (!maisNova) return false;
  const visto = vista ? Date.parse(decodeURIComponent(vista)) : Number.NaN;
  return Number.isNaN(visto) || Date.parse(maisNova) > visto;
}
