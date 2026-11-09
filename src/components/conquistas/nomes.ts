import { CATEGORIAS } from "@/lib/constantes";

/** "Ana Souza Lima" → "Ana L." (como o banco mostra no feed). */
export function nomeCurtoDaConquista(nome: string) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length < 2) return partes[0] ?? nome;
  return `${partes[0]} ${partes[partes.length - 1].charAt(0)}.`;
}

/** "na área de Alimentação" (a categoria da vaga, quando a empresa não confirmou). */
export function rotuloDaArea(categoria: string) {
  const nome = CATEGORIAS.find((c) => c.slug === categoria)?.nome;
  return nome ? `na área de ${nome}` : "por uma vaga do Publike";
}
