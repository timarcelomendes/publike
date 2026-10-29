import "server-only";

// A imagem do banner (Admin › Banners): sai sempre em WebP, de pé na posição certa (foto de celular vem
// girada), com até 1200 px de largura e 900 de altura, para a janela abrir rápido no celular.

const FORMATOS = new Set(["png", "jpeg", "webp", "gif"]);
/** O arquivo que chega do navegador (já diminuído lá) pode ter até 950 KB: a ação aceita 1 MB. */
export const MAX_IMAGEM_BANNER = 950 * 1024;

export type ImagemPreparada = { ok: true; webp: Buffer } | { ok: false; erro: string };

export async function prepararImagemBanner(arquivo: Buffer): Promise<ImagemPreparada> {
  if (arquivo.length > MAX_IMAGEM_BANNER) return { ok: false, erro: "A imagem ficou grande demais. Envie uma menor." };
  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return { ok: false, erro: "Falta o programa que ajusta a imagem (sharp). Rode npm install e tente de novo." };
  }
  try {
    const meta = await sharp(arquivo, { limitInputPixels: 40_000_000 }).metadata();
    if (!meta.format || !FORMATOS.has(meta.format)) return { ok: false, erro: "Envie a imagem em PNG, JPG ou WebP." };
    const webp = await sharp(arquivo, { limitInputPixels: 40_000_000, animated: false })
      .rotate()
      .resize({ width: 1200, height: 900, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { ok: true, webp };
  } catch {
    return { ok: false, erro: "Não deu para abrir essa imagem. Envie outra, em PNG ou JPG." };
  }
}
