// Sem dependências: usado no servidor e no navegador.

/** Lê "1.900", "1.900,50", "1900.5" ou "R$ 120" como número. */
export function lerNumeroBR(valor: FormDataEntryValue | null): number | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.replace(/[^\d,.]/g, "");
  if (!limpo) return null;
  let normal = limpo;
  if (limpo.includes(",")) normal = limpo.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) normal = limpo.replace(/\./g, "");
  const n = Number(normal);
  return Number.isFinite(n) ? n : Number.NaN;
}
