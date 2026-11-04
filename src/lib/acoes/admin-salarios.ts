"use server";

import { refresh } from "next/cache";
import { mensagemDeErro } from "@/lib/erros";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/tipos-banco";
import type { Resultado } from "@/lib/tipos";

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const MES = /^\d{4}-\d{2}-01$/;

/**
 * Admin › Salários, o plano B do robô: o salarios.json que o script (scripts/salarios/caged.mjs) fez no computador
 * troca a tabela inteira das faixas (migração 20270131120000). Uma linha com valor inválido recusa tudo.
 */
export async function enviarSalarios(texto: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (texto.length > 4_000_000) return { ok: false, erro: "O arquivo passou de 4 MB: confira se é o salarios.json." };
  let dados: { de?: unknown; ate?: unknown; linhas?: unknown };
  try {
    dados = JSON.parse(texto);
  } catch {
    return { ok: false, erro: "O arquivo não é um JSON. Mande o salarios.json que o script fez." };
  }
  if (
    typeof dados?.de !== "string" ||
    typeof dados.ate !== "string" ||
    !MES.test(dados.de) ||
    !MES.test(dados.ate) ||
    !Array.isArray(dados.linhas)
  ) {
    return { ok: false, erro: "Faltam o período (de, ate) ou as linhas: mande o salarios.json que o script fez." };
  }
  const { data, error } = await c.rpc("admin_salarios_salvar", {
    p_de: dados.de,
    p_ate: dados.ate,
    p_linhas: dados.linhas as Json,
  });
  if (error) {
    if (error.code === "PGRST202")
      return { ok: false, erro: "Rode antes a migração 20270131120000_salarios_do_mercado.sql no Supabase." };
    return { ok: false, erro: error.code === "22023" ? error.message : mensagemDeErro(error) };
  }
  refresh();
  return { ok: true, mensagem: `${data ?? 0} faixas salvas. A tabela de antes foi trocada.` };
}
