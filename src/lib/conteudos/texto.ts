/** O texto sem as marcações de **negrito** e [link](/caminho). */
export function textoPuroConteudo(texto: string) {
  return texto.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
