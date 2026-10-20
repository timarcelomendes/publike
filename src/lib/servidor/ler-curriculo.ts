import "server-only";
import { MAX_PDF_MB } from "@/lib/constantes";
import { mensagemDeErro } from "@/lib/erros";
import { camposLidos, lerCurriculoDoArquivo, type CurriculoLido } from "@/lib/ia/curriculo-do-arquivo";
import { MODELO_PADRAO } from "@/lib/ia/openai";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { criarClienteServidor } from "@/lib/supabase/servidor";
import { CAMINHO_CURRICULO } from "@/lib/validacao";

// A leitura do currículo pronto (PDF ou fotos da folha) pela IA, para a própria pessoa ("Já tem
// currículo pronto?") e para quem publicou a vaga (o candidato de fora).

export type LeituraDoArquivo = { ok: true; curriculo: CurriculoLido } | { ok: false; erro: string };

/** Fotos do currículo: no máximo 3, já diminuídas no navegador (a ação aceita até 1 MB ao todo). */
const MAX_FOTOS = 3;
const TIPOS_DE_FOTO: Record<string, (b: Buffer) => boolean> = {
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

    let modelo = MODELO_PADRAO;
    const admin = await clienteAdminOuNulo();
    if (admin) {
      const { data } = await admin.rpc("admin_config");
      modelo = data?.[0]?.ia_modelo ?? modelo;
    } else {
      const { error } = await supabase.rpc("usar_ia_texto");
      if (error) return { ok: false, erro: mensagemDeErro(error) };
      const { data } = await supabase.rpc("config_publica");
      modelo = data?.[0]?.ia_modelo ?? modelo;
    }

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
