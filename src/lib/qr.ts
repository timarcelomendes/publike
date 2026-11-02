import qrcode from "qrcode-generator";

// O QR Code do kit de divulgação (o cartaz e as imagens): quem aponta a câmera do celular abre a página de vagas.
// Um SVG só com um caminho (cada quadradinho preto vira um "M x y h1 v1 h-1 z"), que serve no HTML do cartaz e,
// como data: URL, nas imagens geradas (ImageResponse).

/** O SVG do QR Code de `texto`, com `margem` quadradinhos brancos em volta. */
export function qrSvg(texto: string, { margem = 2, cor = "#1f1a14" }: { margem?: number; cor?: string } = {}) {
  const qr = qrcode(0, "M");
  qr.addData(texto, "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const lado = n + margem * 2;
  let caminho = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (qr.isDark(y, x)) caminho += `M${x + margem} ${y + margem}h1v1h-1z`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges"><rect width="${lado}" height="${lado}" fill="#fff"/><path d="${caminho}" fill="${cor}"/></svg>`;
}

/** O mesmo SVG como data: URL, para um <img>. */
export function qrDataUrl(texto: string, opcoes?: { margem?: number; cor?: string }) {
  return `data:image/svg+xml;base64,${Buffer.from(qrSvg(texto, opcoes)).toString("base64")}`;
}
