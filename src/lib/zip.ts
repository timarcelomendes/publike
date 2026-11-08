import "server-only";

import { crc32 } from "node:zlib";

// Um .zip simples, sem compressão (as fotos e os PDFs já vêm comprimidos): os cabeçalhos de cada arquivo e o índice
// do fim. Para "Baixar tudo" dos documentos da admissão. Nomes em UTF-8 (o bit 11), datas de agora em MS-DOS.

export type ArquivoDoZip = { nome: string; dados: Uint8Array };

function dataDos(d: Date) {
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, dia };
}

export function montarZip(arquivos: ArquivoDoZip[], quando = new Date()): Uint8Array {
  const { hora, dia } = dataDos(quando);
  const partes: Uint8Array[] = [];
  const indice: Uint8Array[] = [];
  let posicao = 0;
  for (const a of arquivos) {
    const nome = new TextEncoder().encode(a.nome);
    const crc = crc32(a.dados) >>> 0;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, a.dados.length, true);
    local.setUint32(22, a.dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, a.dados);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(8, 0x0800, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, hora, true);
    central.setUint16(14, dia, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, a.dados.length, true);
    central.setUint32(24, a.dados.length, true);
    central.setUint16(28, nome.length, true);
    central.setUint32(42, posicao, true);
    indice.push(new Uint8Array(central.buffer), nome);
    posicao += 30 + nome.length + a.dados.length;
  }
  const tamanhoIndice = indice.reduce((t, p) => t + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoIndice, true);
  fim.setUint32(16, posicao, true);
  const tudo = [...partes, ...indice, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(tudo.reduce((t, p) => t + p.length, 0));
  let i = 0;
  for (const p of tudo) {
    saida.set(p, i);
    i += p.length;
  }
  return saida;
}
