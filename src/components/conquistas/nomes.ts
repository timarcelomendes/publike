/** "Ana Souza Lima" → "Ana L." (como o banco mostra no feed). */
export function nomeCurtoDaConquista(nome: string) {
  const partes = nome.trim().split(/\s+/);
  if (partes.length < 2) return partes[0] ?? nome;
  return `${partes[0]} ${partes[partes.length - 1].charAt(0)}.`;
}

