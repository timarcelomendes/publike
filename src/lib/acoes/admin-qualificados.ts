"use server";

import { redirect } from "next/navigation";
import { MODELOS_IA } from "@/lib/ia/openai";
import {
  lerCurriculo,
  MODELOS_DA_COMPARACAO,
  type LeituraComNomes,
  type LinhaDoCurriculo,
} from "@/lib/servidor/leitura-curriculo";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";

// Admin › Qualificados (migração 20270826120000; claude/plano-curriculos-qualificados.md): ligar a leitura do
// currículo com o modelo escolhido e a comparação Sonnet x Opus nos mesmos currículos de Talentos (nada é guardado:
// só as chamadas e o custo, em Admin › IA).

const AQUI = "/admin/qualificados";

export async function salvarConfigLeitura(formData: FormData) {
  const c = await clienteAdminOuNulo();
  if (!c) redirect(`${AQUI}?erro=fora`);
  const modelo = String(formData.get("modelo") ?? "");
  const { error } = await c.rpc("admin_config_leitura", {
    p_ligado: formData.get("ligado") === "on",
    p_modelo: MODELOS_IA.some((m) => m.id === modelo) ? modelo : null,
  });
  redirect(`${AQUI}?${error ? "erro=salvar" : "salvo=1"}`);
}

/** O que a tela mostra de cada currículo da comparação (sem nome, foto, bairro nem contato). */
export type CurriculoDaComparacao = LinhaDoCurriculo & { perfil_id: string };

export async function curriculosParaComparar(): Promise<
  { ok: true; curriculos: CurriculoDaComparacao[] } | { ok: false; erro: string }
> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: "O admin só funciona com a sua conta de admin." };
  const { data, error } = await c.rpc("admin_curriculos_para_comparar", { p_limite: 30 });
  if (error)
    return {
      ok: false,
      erro: error.code === "PGRST202" ? "Rode a migração 20270826120000_leitura_do_curriculo.sql primeiro." : error.message,
    };
  return { ok: true, curriculos: (data ?? []) as CurriculoDaComparacao[] };
}

export type ResultadoDoModelo = { ok: true; leitura: LeituraComNomes; ms: number } | { ok: false; erro: string };

/** Lê um currículo com os dois modelos, ao mesmo tempo. */
export async function compararUmCurriculo(
  cv: CurriculoDaComparacao,
): Promise<{ ok: true; resultados: Record<string, ResultadoDoModelo> } | { ok: false; erro: string }> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: "O admin só funciona com a sua conta de admin." };
  const pares = await Promise.all(
    MODELOS_DA_COMPARACAO.map(async (m): Promise<[string, ResultadoDoModelo]> => {
      const inicio = Date.now();
      try {
        const leitura = await lerCurriculo(cv, m);
        return [m, leitura ? { ok: true, leitura, ms: Date.now() - inicio } : { ok: false, erro: "A resposta não serviu." }];
      } catch (e) {
        return [m, { ok: false, erro: e instanceof Error ? e.message : String(e) }];
      }
    }),
  );
  return { ok: true, resultados: Object.fromEntries(pares) };
}
