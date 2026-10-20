// O currículo pronto (PDF ou fotos da folha) no navegador, antes da leitura no servidor: o PDF vai
// para a pasta privada da conta no Storage e as fotos ficam menores. Só no navegador.

import type { CurriculoLido } from "./ia/curriculo-do-arquivo";
import { criarClienteNavegador } from "./supabase/navegador";

/** Até 3 fotos, uma por página. */
export const MAX_FOTOS_CURRICULO = 3;
/** As fotos, juntas, depois de diminuídas (a ação do servidor aceita até 1 MB). */
const LIMITE_FOTOS = 900 * 1024;

/** Erro com a mensagem pronta para a tela. */
export class ErroDaLeitura extends Error {}

/** Manda o PDF para a pasta privada da conta no Storage e devolve o caminho. */
export async function enviarPdf(pdf: File, usuarioId: string) {
  const caminho = `${usuarioId}/${Date.now()}.pdf`;
  const { error } = await criarClienteNavegador()
    .storage.from("curriculos")
    .upload(caminho, pdf, { contentType: "application/pdf", upsert: false });
  if (error) throw error;
  return caminho;
}

/** A foto do celular, menor (JPG de até `lado` px): a leitura aceita até 1 MB ao todo. */
async function diminuirFoto(foto: File, lado: number, qualidade: number): Promise<Blob> {
  let imagem: ImageBitmap;
  try {
    imagem = await createImageBitmap(foto);
  } catch {
    throw new ErroDaLeitura("Não deu para abrir esta foto. Tente outra (JPG ou PNG) ou envie o PDF.");
  }
  const escala = Math.min(1, lado / Math.max(imagem.width, imagem.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(imagem.width * escala);
  tela.height = Math.round(imagem.height * escala);
  const ctx = tela.getContext("2d");
  if (!ctx) throw new ErroDaLeitura("Não deu para preparar a foto. Envie o PDF.");
  // PNG com fundo transparente vira folha branca
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, tela.width, tela.height);
  ctx.drawImage(imagem, 0, 0, tela.width, tela.height);
  imagem.close();
  return new Promise((ok, falha) =>
    tela.toBlob(
      (b) => (b ? ok(b) : falha(new ErroDaLeitura("Não deu para preparar a foto. Envie o PDF."))),
      "image/jpeg",
      qualidade,
    ),
  );
}

/** As fotos prontas para a leitura: menores, em JPG, até 1 MB juntas. */
export async function fotosParaLeitura(fotos: File[]): Promise<Blob[]> {
  let menores: Blob[] = [];
  for (const [lado, qualidade] of [
    [1600, 0.75],
    [1280, 0.6],
  ] as const) {
    menores = await Promise.all(fotos.map((f) => diminuirFoto(f, lado, qualidade)));
    if (menores.reduce((t, b) => t + b.size, 0) <= LIMITE_FOTOS) break;
  }
  if (menores.reduce((t, b) => t + b.size, 0) > LIMITE_FOTOS) {
    throw new ErroDaLeitura("As fotos ficaram grandes demais. Mande uma página por vez ou envie o PDF.");
  }
  return menores;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function juntar(partes: string[]) {
  return partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : (partes[0] ?? "");
}

/** O que a leitura preencheu, em palavras: "profissão, 6 habilidades, estudos e 3 experiências". */
export function resumoDaLeitura(l: CurriculoLido) {
  return juntar(
    [
      l.titulo ? "profissão" : "",
      l.habilidades.length ? plural(l.habilidades.length, "habilidade", "habilidades") : "",
      l.escolaridade || l.estudos.length ? "estudos" : "",
      l.experiencias.length ? plural(l.experiencias.length, "experiência", "experiências") : "",
      l.cursos.length ? plural(l.cursos.length, "curso", "cursos") : "",
      l.cnh ? "CNH" : "",
      l.disponibilidade.length ? "horários" : "",
    ].filter(Boolean),
  );
}
