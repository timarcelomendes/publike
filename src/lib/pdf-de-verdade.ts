// O PDF de verdade (claude/plano-seguranca.md, item 12): o tipo do arquivo vem do navegador de quem envia e pode
// mentir. O PDF começa com "%PDF-" (a norma aceita lixo antes, até 1 KB); outro arquivo com o nome .pdf não entra.

const ASSINATURA = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

/** Os primeiros bytes têm a marca do PDF. */
export function bytesDePdf(bytes: Uint8Array) {
  const fim = Math.min(bytes.length, 1024) - ASSINATURA.length;
  for (let i = 0; i <= fim; i++) {
    let igual = true;
    for (let j = 0; j < ASSINATURA.length; j++) {
      if (bytes[i + j] !== ASSINATURA[j]) {
        igual = false;
        break;
      }
    }
    if (igual) return true;
  }
  return false;
}

/** O arquivo (no navegador ou no servidor) começa como um PDF. */
export async function arquivoEhPdf(arquivo: Blob) {
  return bytesDePdf(new Uint8Array(await arquivo.slice(0, 1024).arrayBuffer()));
}

export const NAO_EH_PDF = "Este arquivo não é um PDF de verdade. Salve o currículo como PDF e envie de novo.";
