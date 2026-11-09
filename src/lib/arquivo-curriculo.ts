// O currículo pronto (PDF ou fotos da folha) no navegador, antes da leitura no servidor: o PDF vai
// para a pasta privada da conta no Storage e as fotos ficam menores. Só no navegador.

import type { CurriculoLido } from "./ia/curriculo-do-arquivo";
import { ehFalhaDeInternet } from "./falhas";
import { criarClienteNavegador } from "./supabase/navegador";

/** Até 3 fotos, uma por página. */
export const MAX_FOTOS_CURRICULO = 3;
/** As fotos, juntas, depois de diminuídas (a ação do servidor aceita até 1 MB). */
const LIMITE_FOTOS = 900 * 1024;

/** Erro com a mensagem pronta para a tela. */
export class ErroDaLeitura extends Error {}

/** Manda o PDF para a pasta privada da conta no Storage e devolve o caminho. */

export async function enviarPdf(pdf: File, usuarioId: string) {
  // a internet do celular às vezes cai no meio do envio: tenta de novo sozinho, até 3 vezes ao todo
  for (let tentativa = 1; ; tentativa++) {
    const caminho = `${usuarioId}/${Date.now()}.pdf`;
    const { error } = await criarClienteNavegador()
      .storage.from("curriculos")
      .upload(caminho, pdf, { contentType: "application/pdf", upsert: false });
    if (!error) return caminho;
    if (!ehFalhaDeInternet(error)) throw error;
    // "Failed to fetch" logo de cara: o Storage pode estar bloqueado na rede da pessoa (o resto do site funciona).
    // Passa pelo próprio site antes de tentar de novo (09/11/2026)
    const peloSite = await enviarPdfPeloSite(pdf).catch(() => null);
    if (peloSite) return peloSite;
    // a internet caiu no meio do envio: não é um "não" do Storage, vale tentar de novo
    if (tentativa >= 3) throw error;
    await new Promise((r) => setTimeout(r, 1500 * tentativa));
  }
}

/** O PDF pelo publike.org (/api/curriculo/pdf), quando o Storage não responde no navegador. null: não deu. */
async function enviarPdfPeloSite(pdf: File): Promise<string | null> {
  if (pdf.size > 4 * 1024 * 1024) return null;
  const dados = new FormData();
  dados.set("pdf", pdf);
  const resposta = await fetch("/api/curriculo/pdf", { method: "POST", body: dados });
  if (!resposta.ok) return null;
  const { caminho } = (await resposta.json()) as { caminho?: string };
  return typeof caminho === "string" && caminho ? caminho : null;
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
