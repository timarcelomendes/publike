/**
 * Reduz uma imagem no navegador para no máximo `largura` px de largura, em JPEG (as fotos do topo,
 * do perfil e dos recados). Com `quadrado`, corta no meio antes.
 */
export async function reduzirImagem(arquivo: File, largura: number, quadrado = false): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const lado = Math.min(imagem.width, imagem.height);
  const [sx, sy, sw, sh] = quadrado
    ? [(imagem.width - lado) / 2, (imagem.height - lado) / 2, lado, lado]
    : [0, 0, imagem.width, imagem.height];
  const w = Math.min(largura, sw);
  const h = Math.round((sh * w) / sw);
  const tela = document.createElement("canvas");
  tela.width = w;
  tela.height = h;
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(imagem, sx, sy, sw, sh, 0, 0, w, h);
  return new Promise((resolver, rejeitar) =>
    tela.toBlob((b) => (b ? resolver(b) : rejeitar(new Error("blob"))), "image/jpeg", 0.85),
  );
}
