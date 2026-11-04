"use server";

import { buscarOcupacoes, ocupacao } from "@/lib/cbo";
import { obterUsuario } from "@/lib/dados";
import type { FuncaoParaForm } from "@/lib/funcao-cbo";
import { funcaoDaVaga, modeloDaFuncao } from "@/lib/servidor/funcao";
import { dentroDoLimite } from "@/lib/servidor/limite";

// O "Cargo na carteira" do formulário da vaga (claude/plano-salario-e-curriculo.md, parte 2): a sugestão pelo título
// (as regras; com conta e a IA ligada, a IA, com o que ela achou guardado por título) e a busca na CBO para trocar.

/** A função que o título sugere, ou null. Sem conta, só as regras e o que a IA já achou antes. */
export async function sugerirFuncao(titulo: string, descricao: string): Promise<FuncaoParaForm | null> {
  const t = String(titulo ?? "").slice(0, 120);
  if (t.trim().length < 3) return null;
  const usuario = await obterUsuario();
  // a IA só para quem entrou, e no máximo 20 títulos novos por minuto (o resto fica com as regras)
  const modelo =
    usuario && dentroDoLimite(`funcao:${usuario.id}`, 20, 60_000) ? await modeloDaFuncao().catch(() => null) : null;
  return funcaoDaVaga({ titulo: t, descricao: String(descricao ?? "").slice(0, 600) }, modelo).catch(() => null);
}

/** As ocupações da CBO que mais parecem com o que a pessoa digitou (para trocar o cargo). */
export async function buscarFuncoes(texto: string): Promise<{ cbo: string; nome: string; pelo: string }[]> {
  const q = String(texto ?? "").slice(0, 80);
  // um código de 6 dígitos também vale ("513505" ou "5135-05")
  const codigo = q.replace(/\D/g, "");
  if (codigo.length === 6) {
    const o = ocupacao(codigo);
    return o ? [{ cbo: o.cbo, nome: o.nome, pelo: o.nome }] : [];
  }
  return buscarOcupacoes(q, 8).map((o) => ({ cbo: o.cbo, nome: o.nome, pelo: o.pelo }));
}
