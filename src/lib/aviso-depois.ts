// "Salvo" que acompanha um redirect: a ação grava a chave num cookie curto e o navegador mostra o
// aviso na página de destino (AvisoDepois, no layout) e apaga o cookie. Serve para quando o destino
// não é a página que já mostra a confirmação (o currículo que volta para a vaga, o perfil com `next`).
// Só chaves conhecidas: o cookie nunca carrega texto livre.

export const COOKIE_AVISO_DEPOIS = "publike_aviso";

export const AVISOS_DEPOIS = {
  curriculo_salvo: "Currículo salvo.",
  curriculo_match: "Currículo salvo e enviado para quem esperava por ele.",
  perfil_salvo: "Perfil salvo.",
  cliente_salvo: "Cliente salvo. Agora é só publicar a vaga.",
} as const;

export type AvisoDepois = keyof typeof AVISOS_DEPOIS;

export function ehAvisoDepois(v: string): v is AvisoDepois {
  return Object.hasOwn(AVISOS_DEPOIS, v);
}
