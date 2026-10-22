"use server";

import { iaConfigurada, MODELO_PADRAO } from "@/lib/ia/openai";
import { lerVagasImportadas, type VagaImportada } from "@/lib/ia/importar-vaga";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";

// Admin › Publicar vaga em nome de uma conta › "Importar com a IA" (foto ou texto colado).

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const TIPOS = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 4 * 1024 * 1024;

export type ResultadoImportar = { ok: true; vagas: VagaImportada[] } | { ok: false; erro: string };

export async function importarVagas(formData: FormData): Promise<ResultadoImportar> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!iaConfigurada()) return { ok: false, erro: "Falta a chave da IA (OPENAI_API_KEY) no .env.local." };

  const arquivo = formData.get("imagem");
  const textoColado = typeof formData.get("texto") === "string" ? String(formData.get("texto")).trim() : "";
  let imagem: string | null = null;
  if (arquivo instanceof File && arquivo.size > 0) {
    if (!TIPOS.includes(arquivo.type)) return { ok: false, erro: "Use uma foto em JPG, PNG ou WebP." };
    if (arquivo.size > MAX_BYTES) return { ok: false, erro: "A foto está grande demais. Tente um print menor." };
    imagem = `data:${arquivo.type};base64,${Buffer.from(await arquivo.arrayBuffer()).toString("base64")}`;
  }
  if (!imagem && textoColado.length < 20) {
    return { ok: false, erro: "Mande uma foto do anúncio ou cole o texto dele." };
  }
  if (textoColado.length > 6000) return { ok: false, erro: "Texto grande demais: cole até 6.000 letras." };

  const { data } = await c.rpc("admin_config");
  const modelo = data?.[0]?.ia_modelo ?? MODELO_PADRAO;
  try {
    const vagas = await lerVagasImportadas({ imagem, textoColado }, modelo);
    if (!vagas.length) return { ok: false, erro: "A IA não achou vaga de trabalho nesse material." };
    return { ok: true, vagas };
  } catch (e) {
    console.error("Publike: a IA não leu a vaga:", e instanceof Error ? e.message : e);
    return {
      ok: false,
      erro: e instanceof Error && e.name === "ErroIA" ? e.message : "A IA não conseguiu ler agora. Tente de novo.",
    };
  }
}
