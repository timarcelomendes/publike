"use server";

import { redirect } from "next/navigation";
import { MODELOS_IA } from "@/lib/ia/openai";
import {
  lerCurriculo,
  MODELOS_DA_COMPARACAO,
  type LeituraComNomes,
  type LinhaDoCurriculo,
} from "@/lib/servidor/leitura-curriculo";
import {
  MODELOS_DA_COMPARACAO_DAS_ATIVIDADES,
  paresParaLer,
  type DadosParaAtividades,
  type ParDasAtividades,
} from "@/lib/servidor/atividades-da-vaga";
import { compararAtividadesComIA, daParaComparar } from "@/lib/ia/atividades";
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

// As atividades da vaga (migração 20270831120000): ligar com o modelo escolhido e a comparação Haiku x Sonnet nos
// mesmos pares (a vaga e os trabalhos da pessoa na mesma função; nada é guardado: só as chamadas, em Admin › IA).

export async function salvarConfigAtividades(formData: FormData) {
  const c = await clienteAdminOuNulo();
  if (!c) redirect(`${AQUI}?erro=fora`);
  const modelo = String(formData.get("modelo") ?? "");
  const { error } = await c.rpc("admin_config_atividades", {
    p_ligado: formData.get("ligado") === "on",
    p_modelo: MODELOS_IA.some((m) => m.id === modelo) ? modelo : null,
  });
  redirect(`${AQUI}?${error ? "erro=salvar" : "salvo=1"}#atividades`);
}

/** Até 30 pares para a comparação, de vagas diferentes (uma de cada vaga por vez), primeiro os candidatos. */
export async function paresParaComparar(): Promise<{ ok: true; pares: ParDasAtividades[] } | { ok: false; erro: string }> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: "O admin só funciona com a sua conta de admin." };
  const { data, error } = await c.rpc("admin_dados_para_atividades");
  if (error || !data)
    return {
      ok: false,
      erro: error?.code === "PGRST202" ? "Rode a migração 20270831120000_atividades_da_vaga.sql primeiro." : (error?.message ?? "Sem dados."),
    };
  const todos = (await paresParaLer(data as unknown as DadosParaAtividades, Date.now(), true)).filter((p) =>
    daParaComparar(p.vaga, p.trabalhos),
  );
  // uma de cada vaga por vez, para não ficar tudo numa vaga só
  const porVaga = new Map<string, ParDasAtividades[]>();
  for (const p of todos) porVaga.set(p.vaga.id, [...(porVaga.get(p.vaga.id) ?? []), p]);
  const filas = [...porVaga.values()];
  const pares: ParDasAtividades[] = [];
  for (let i = 0; pares.length < 30 && filas.some((f) => f.length > i); i++)
    for (const f of filas) if (f[i] && pares.length < 30) pares.push(f[i]);
  return { ok: true, pares };
}

export type RespostaDoModelo =
  | { ok: true; resultado: "sim" | "parte" | "nao" | "sem"; trecho: string; modelo: string; custo: number; ms: number }
  | { ok: false; erro: string };

/** Compara um par com os dois modelos, ao mesmo tempo. */
export async function compararUmPar(
  par: ParDasAtividades,
): Promise<{ ok: true; resultados: Record<string, RespostaDoModelo> } | { ok: false; erro: string }> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: "O admin só funciona com a sua conta de admin." };
  const respostas = await Promise.all(
    MODELOS_DA_COMPARACAO_DAS_ATIVIDADES.map(async (m): Promise<[string, RespostaDoModelo]> => {
      const inicio = Date.now();
      try {
        const r = await compararAtividadesComIA(par.vaga, par.trabalhos, m);
        const preco = MODELOS_IA.find((x) => x.id === (r?.modelo ?? m))?.preco;
        const custo =
          r?.tokens && preco ? (r.tokens.entrada * preco.entrada + r.tokens.saida * preco.saida) / 1_000_000 : 0;
        return [
          m,
          r
            ? { ok: true, resultado: r.resultado, trecho: r.trecho, modelo: r.modelo, custo, ms: Date.now() - inicio }
            : { ok: true, resultado: "sem", trecho: "", modelo: m, custo, ms: Date.now() - inicio },
        ];
      } catch (e) {
        return [m, { ok: false, erro: e instanceof Error ? e.message : String(e) }];
      }
    }),
  );
  return { ok: true, resultados: Object.fromEntries(respostas) };
}

// O currículo pelo WhatsApp (migração 20270902120000): desligado, só os números de teste de Admin › WhatsApp ou todos.
export async function salvarModoCurriculoWhatsapp(formData: FormData) {
  const c = await clienteAdminOuNulo();
  if (!c) redirect(`${AQUI}?erro=fora`);
  const modo = String(formData.get("modo") ?? "");
  if (!["desligado", "teste", "todos"].includes(modo)) redirect(`${AQUI}?erro=salvar#curriculo-whatsapp`);
  const { error } = await c.rpc("admin_modo_curriculo_whatsapp", { p_modo: modo });
  redirect(`${AQUI}?${error ? "erro=salvar" : "salvo=1"}#curriculo-whatsapp`);
}
