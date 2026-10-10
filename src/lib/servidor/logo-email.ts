import "server-only";
import { LOGO_EMAIL } from "@/lib/email/montar";

// A imagem da logo dos e-mails sai sempre no mesmo formato: uma plaquinha da
// cor do fundo do e-mail (creme), com cantos redondos e a logo no meio. No
// modo claro a plaquinha some no fundo. No modo escuro do Gmail e do Outlook,
// que escurecem o fundo do e-mail mas não mexem nas imagens, a logo continua
// legível, mesmo quando a original tem fundo transparente e letra escura.
// A logo padrão (public/logo/publike-logo-email.png) foi feita do mesmo jeito.

const FUNDO = { r: 251, g: 247, b: 239, alpha: 1 }; // #fbf7ef, o fundo dos e-mails
const FOLGA_V = 7; // px, em cima e embaixo da logo
const FOLGA_H = 9; // px, dos lados
const RAIO = 8; // px
const FORMATOS = new Set(["png", "jpeg", "webp"]);

export type LogoPreparada = { ok: true; png: Buffer; largura: number; altura: number } | { ok: false; erro: string };

/** Ajusta a imagem enviada no admin para a plaquinha dos e-mails (PNG). */
export async function prepararLogoEmail(arquivo: Buffer): Promise<LogoPreparada> {
  if (arquivo.length > LOGO_EMAIL.arquivoMaximo)
    return { ok: false, erro: "A imagem passa de 800 KB. Envie uma menor." };
  let sharp: typeof import("sharp").default;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    return { ok: false, erro: "Falta o programa que ajusta a imagem (sharp). Rode npm install e tente de novo." };
  }

  const e = LOGO_EMAIL.escala;
  const alturaPlaca = LOGO_EMAIL.altura * e;
  const alturaMiolo = (LOGO_EMAIL.altura - 2 * FOLGA_V) * e;
  const larguraMaxMiolo = (LOGO_EMAIL.larguraMaxima - 2 * FOLGA_H) * e;

  try {
    const meta = await sharp(arquivo, { limitInputPixels: 40_000_000 }).metadata();
    if (!meta.format || !FORMATOS.has(meta.format)) return { ok: false, erro: "Envie a logo em PNG, JPG ou WebP." };

    // Primeiro quadro, na posição certa (foto de celular vem girada) e com no máximo 2400 px.
    const normal = await sharp(arquivo, { limitInputPixels: 40_000_000, pages: 1 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true })
      .ensureAlpha()
      .png()
      .toBuffer();

    // Margem transparente ou branca em volta da logo: corta, para ela ocupar a plaquinha.
    // Fundo colorido (logo dentro de um retângulo vermelho, por exemplo) fica como está.
    const canto = await sharp(normal).extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    const [r, g, b, a] = canto;
    let recortada = normal;
    if (a < 16 || (r > 235 && g > 235 && b > 235)) {
      try {
        recortada = await sharp(normal).trim({ threshold: 12 }).png().toBuffer();
      } catch {
        return { ok: false, erro: "A imagem parece vazia. Confira o arquivo." };
      }
    }

    const { info: tamanho } = await sharp(recortada).toBuffer({ resolveWithObject: true });
    if (tamanho.width < 120 && tamanho.height < 40) {
      return { ok: false, erro: "A imagem é pequena demais. Envie uma maior, com pelo menos 300 px de largura." };
    }

    const { data: miolo, info } = await sharp(recortada)
      .flatten({ background: FUNDO })
      .resize({ width: larguraMaxMiolo, height: alturaMiolo, fit: "inside" })
      .png()
      .toBuffer({ resolveWithObject: true });

    const largura = Math.max(info.width, alturaMiolo) + 2 * FOLGA_H * e;
    const esquerda = Math.floor((largura - info.width) / 2);
    const topo = Math.floor((alturaPlaca - info.height) / 2);
    const cantos = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${alturaPlaca}">` +
        `<rect width="${largura}" height="${alturaPlaca}" rx="${RAIO * e}" ry="${RAIO * e}" fill="#fff"/></svg>`,
    );
    const png = await sharp(miolo)
      .extend({
        left: esquerda,
        right: largura - info.width - esquerda,
        top: topo,
        bottom: alturaPlaca - info.height - topo,
        background: FUNDO,
      })
      .ensureAlpha()
      .composite([{ input: cantos, blend: "dest-in" }])
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();

    return { ok: true, png, largura: Math.round(largura / e), altura: LOGO_EMAIL.altura };
  } catch (erro) {
    console.error("Publike: não deu para ajustar a logo dos e-mails:", erro instanceof Error ? erro.message : erro);
    return { ok: false, erro: "Não deu para abrir essa imagem. Envie a logo em PNG, JPG ou WebP." };
  }
}
