"use server";

import { obterUsuario } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// "Quero trabalhar aqui" (migração 20270615120000): a empresa no Publike recebe o aviso com o currículo; se não está,
// volta o contato da Receita (telefone, se é celular) e o ponto para traçar a rota.

export type ContatoDoLugar = {
  no_publike: boolean;
  ja_demonstrou: boolean;
  telefone: string | null;
  celular: boolean;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
};

export type RespostaDoInteresse =
  | { ok: true; avisada: boolean; contato: ContatoDoLugar | null }
  | { ok: false; erro: string; entrar?: boolean };

export async function demonstrarInteresse(cnpj: string): Promise<RespostaDoInteresse> {
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(String(cnpj ?? ""))) return { ok: false, erro: "Lugar inválido." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre para demonstrar interesse.", entrar: true };
  const banco = await criarClienteServidor();
  const { data, error } = await banco.rpc("demonstrar_interesse", { p_cnpj: cnpj });
  if (error) {
    if (["42501", "54000", "22023"].includes(error.code ?? "")) return { ok: false, erro: error.message };
    console.error("Publike: falha ao demonstrar interesse:", error.message);
    return { ok: false, erro: "Não deu agora. Tente de novo." };
  }
  const avisada = Boolean((data as { avisada?: boolean } | null)?.avisada);
  const { data: contato } = await banco.rpc("contato_do_lugar", { p_cnpj: cnpj });
  return { ok: true, avisada, contato: (contato as unknown as ContatoDoLugar | null) ?? null };
}
