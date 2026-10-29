import "server-only";
import { MAX_PDF_MB } from "@/lib/constantes";
import { mensagemDeErro } from "@/lib/erros";
import {
  camposLidos,
  lerCurriculoDaFala,
  lerCurriculoDoArquivo,
  type CurriculoLido,
} from "@/lib/ia/curriculo-do-arquivo";
import { MODELO_PADRAO } from "@/lib/ia/openai";
import { transcrever } from "@/lib/ia/transcrever";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { criarClienteServidor } from "@/lib/supabase/servidor";
import { CAMINHO_CURRICULO } from "@/lib/validacao";

// A leitura do currículo pronto (PDF ou fotos da folha) pela IA, para a própria pessoa ("Já tem
// currículo pronto?") e para quem publicou a vaga (o candidato de fora). E o currículo falado: a
// pessoa conta, a fala vira texto e a IA preenche os campos.

export type LeituraDoArquivo = { ok: true; curriculo: CurriculoLido } | { ok: false; erro: string };

/** Fotos do currículo: no máximo 3, já diminuídas no navegador (a ação aceita até 1 MB ao todo). */
const MAX_FOTOS = 3;
/** Confere pelos primeiros bytes que a foto é mesmo JPG, PNG ou WebP. */
export const TIPOS_DE_FOTO: Record<string, (b: Buffer) => boolean> = {
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/png": (b) => b.subarray(0, 4).toString("hex") === "89504e47",
  "image/webp": (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
};

/**
 * A IA lê o PDF (que o navegador já mandou para a pasta da conta: campo "pdf", o caminho) ou as
 * fotos (campo "foto") e devolve os campos do currículo, sem contato. Usa a cota da ajuda da IA.
 * `deOutraPessoa`: quem envia é quem publicou a vaga (o currículo é de outra pessoa): o PDF sai do
 * Storage logo depois da leitura e as mensagens não falam "seu currículo".
 */
export async function lerArquivoDoCurriculo(
  dados: FormData,
  usuarioId: string,
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  deOutraPessoa = false,
): Promise<LeituraDoArquivo> {
  const caminho = dados.get("pdf");
  const temPdf = typeof caminho === "string" && caminho !== "";
  if (temPdf && (!CAMINHO_CURRICULO.test(caminho) || !caminho.startsWith(`${usuarioId}/`))) {
    return { ok: false, erro: "Envie o PDF de novo." };
  }
  try {
    // primeiro o arquivo (sem gastar a cota com arquivo errado)
    const fotos = dados.getAll("foto").filter((f): f is File => f instanceof File && f.size > 0);
    if (fotos.length > MAX_FOTOS) return { ok: false, erro: `Mande no máximo ${MAX_FOTOS} fotos.` };
    const imagens: string[] = [];
    for (const foto of fotos) {
      const bytes = Buffer.from(await foto.arrayBuffer());
      if (!TIPOS_DE_FOTO[foto.type]?.(bytes)) return { ok: false, erro: "Mande a foto em JPG ou PNG." };
      imagens.push(`data:${foto.type};base64,${bytes.toString("base64")}`);
    }
    let pdf: { nome: string; dados: string } | null = null;
    if (temPdf) {
      const { data: arquivo } = await supabase.storage.from("curriculos").download(caminho);
      const bytes = arquivo ? Buffer.from(await arquivo.arrayBuffer()) : null;
      if (!bytes) return { ok: false, erro: "Não deu para abrir o PDF. Envie de novo." };
      if (bytes.subarray(0, 5).toString() !== "%PDF-" || bytes.length > MAX_PDF_MB * 1024 * 1024) {
        return { ok: false, erro: "Envie um arquivo PDF." };
      }
      pdf = { nome: "curriculo.pdf", dados: `data:application/pdf;base64,${bytes.toString("base64")}` };
    }
    if (!pdf && !imagens.length) {
      return {
        ok: false,
        erro: deOutraPessoa ? "Escolha o PDF ou a foto do currículo." : "Escolha o PDF ou a foto do seu currículo.",
      };
    }

    const cota = await modeloComCota(supabase);
    if (!cota.ok) return cota;
    const modelo = cota.modelo;

    try {
      const lido = await lerCurriculoDoArquivo({ pdf, fotos: imagens }, modelo, new Date().toISOString().slice(0, 7));
      if (!lido) {
        return {
          ok: false,
          erro: deOutraPessoa
            ? "Isso não parece um currículo. Envie o PDF ou a foto do currículo."
            : "Isso não parece um currículo. Envie o PDF ou a foto do seu currículo.",
        };
      }
      if (!camposLidos(lido)) {
        return {
          ok: false,
          erro: deOutraPessoa
            ? pdf
              ? "Não deu para ler este PDF. Tente a foto do currículo ou chame a pessoa sem ele."
              : "Não deu para ler a foto. Tire de perto, com a folha inteira e boa luz, ou envie o PDF."
            : pdf
              ? "Não deu para ler este PDF. Preencha os campos aqui embaixo."
              : "Não deu para ler a foto. Tire de perto, com a folha inteira e boa luz, ou envie o PDF.",
        };
      }
      return { ok: true, curriculo: lido };
    } catch (e) {
      // o motivo técnico (chave, créditos, modelo) fica no registro do servidor, não na tela
      console.error("Publike: a leitura do currículo falhou:", e instanceof Error ? e.message : e);
      return {
        ok: false,
        erro: deOutraPessoa
          ? "Não deu para ler o currículo agora. Tente de novo em instantes."
          : "Não deu para ler o currículo agora. Tente de novo ou preencha aqui embaixo.",
      };
    }
  } finally {
    // o currículo de outra pessoa não fica guardado: só o que a leitura achou vai para o convite
    if (deOutraPessoa && temPdf) await supabase.storage.from("curriculos").remove([caminho]);
  }
}

/**
 * O modelo escolhido no admin e a cota da ajuda da IA (a mesma chave do admin e o mesmo limite
 * por dia): no admin local não gasta cota.
 */
async function modeloComCota(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
): Promise<{ ok: true; modelo: string } | { ok: false; erro: string }> {
  const admin = await clienteAdminOuNulo();
  if (admin) {
    const { data } = await admin.rpc("admin_config");
    return { ok: true, modelo: data?.[0]?.ia_modelo ?? MODELO_PADRAO };
  }
  const { error } = await supabase.rpc("usar_ia_texto");
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  const { data } = await supabase.rpc("config_publica");
  return { ok: true, modelo: data?.[0]?.ia_modelo ?? MODELO_PADRAO };
}

/** O áudio do currículo falado: de 3 KB (um segundo, mais ou menos) a 4 MB (o limite da Vercel é 4,5 MB). */
export const MIN_AUDIO_BYTES = 3 * 1024;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

/** O formato do áudio pelos primeiros bytes (WebM do Chrome, MP4 do iPhone, Ogg, WAV ou MP3), e o nome com a extensão. */
export function formatoDoAudio(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b.readUInt32BE(0) === 0x1a45dfa3) return "fala.webm";
  if (b.subarray(4, 8).toString() === "ftyp") return "fala.mp4";
  if (b.subarray(0, 4).toString() === "OggS") return "fala.ogg";
  if (b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WAVE") return "fala.wav";
  if (b.subarray(0, 3).toString() === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "fala.mp3";
  return null;
}

/**
 * Currículo falado: confere o áudio, gasta a cota da ajuda da IA, transcreve (o áudio vai só para a
 * transcrição e não fica guardado) e a IA preenche os campos. Nada é salvo: a pessoa confere e salva.
 */
export async function lerFalaDoCurriculo(
  audio: File,
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
): Promise<LeituraDoArquivo> {
  if (audio.size < MIN_AUDIO_BYTES)
    return { ok: false, erro: "A gravação ficou curta demais. Conte de novo, com calma." };
  if (audio.size > MAX_AUDIO_BYTES)
    return { ok: false, erro: "A gravação ficou grande demais. Conte em até 3 minutos." };
  const bytes = Buffer.from(await audio.arrayBuffer());
  const nome = formatoDoAudio(bytes);
  if (!nome) return { ok: false, erro: "Não deu para abrir a gravação. Tente de novo." };

  const cota = await modeloComCota(supabase);
  if (!cota.ok) return cota;

  let fala: string;
  try {
    fala = await transcrever(new Blob([bytes], { type: audio.type || "application/octet-stream" }), nome);
  } catch (e) {
    console.error("Publike: a transcrição do currículo falado falhou:", e instanceof Error ? e.message : e);
    return { ok: false, erro: "Não deu para ouvir a gravação agora. Tente de novo ou preencha aqui embaixo." };
  }
  // menos que umas poucas palavras: o microfone não pegou (ou a pessoa não falou)
  if (fala.replace(/[^\p{L}]/gu, "").length < 12) {
    return { ok: false, erro: "Não deu para ouvir. Fale perto do celular, num lugar sem barulho, e tente de novo." };
  }
  try {
    const lido = await lerCurriculoDaFala(fala, cota.modelo, new Date().toISOString().slice(0, 7));
    if (!lido || !camposLidos(lido)) {
      return {
        ok: false,
        erro: "Não entendemos o seu trabalho nessa fala. Conte de novo: o trabalho que procura, onde trabalhou e até onde estudou.",
      };
    }
    return { ok: true, curriculo: lido };
  } catch (e) {
    console.error("Publike: a leitura do currículo falado falhou:", e instanceof Error ? e.message : e);
    return { ok: false, erro: "Não deu para preencher agora. Tente de novo ou preencha aqui embaixo." };
  }
}
