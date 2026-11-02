import "server-only";

// Um .zip simples, sem compressão (PNG já vem comprimido): o "Baixar tudo" de Admin › Vagas do dia. Sem
// biblioteca: o cabeçalho de cada arquivo, os dados, o diretório central e o fim (PKWARE APPNOTE, sem ZIP64,
// então até 4 GB e 65 mil arquivos, muito longe do que o admin baixa). Os nomes vão em UTF-8 (bit 11).

const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(dados: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA[(c ^ dados[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export type ArquivoDoZip = { nome: string; dados: Uint8Array };

export function montarZip(arquivos: ArquivoDoZip[], quando = new Date()): Uint8Array<ArrayBuffer> {
  const texto = new TextEncoder();
  // a data e a hora no formato do DOS, no horário do computador que roda o admin
  const hora = (quando.getHours() << 11) | (quando.getMinutes() << 5) | Math.floor(quando.getSeconds() / 2);
  const dia = ((quando.getFullYear() - 1980) << 9) | ((quando.getMonth() + 1) << 5) | quando.getDate();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let posicao = 0;

  for (const a of arquivos) {
    const nome = texto.encode(a.nome);
    const crc = crc32(a.dados);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true); // versão para abrir
    local.setUint16(6, 0x0800, true); // nome em UTF-8
    local.setUint16(8, 0, true); // sem compressão
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, a.dados.length, true);
    local.setUint32(22, a.dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, a.dados);

    const item = new DataView(new ArrayBuffer(46));
    item.setUint32(0, 0x02014b50, true);
    item.setUint16(4, 20, true); // feito com
    item.setUint16(6, 20, true); // versão para abrir
    item.setUint16(8, 0x0800, true);
    item.setUint16(10, 0, true);
    item.setUint16(12, hora, true);
    item.setUint16(14, dia, true);
    item.setUint32(16, crc, true);
    item.setUint32(20, a.dados.length, true);
    item.setUint32(24, a.dados.length, true);
    item.setUint16(28, nome.length, true);
    item.setUint32(42, posicao, true); // onde começa o cabeçalho deste arquivo
    central.push(new Uint8Array(item.buffer), nome);

    posicao += 30 + nome.length + a.dados.length;
  }

  const tamanhoDoCentral = central.reduce((soma, p) => soma + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamanhoDoCentral, true);
  fim.setUint32(16, posicao, true);

  const saida = new Uint8Array(posicao + tamanhoDoCentral + 22);
  let i = 0;
  for (const p of [...partes, ...central, new Uint8Array(fim.buffer)]) {
    saida.set(p, i);
    i += p.length;
  }
  return saida;
}
