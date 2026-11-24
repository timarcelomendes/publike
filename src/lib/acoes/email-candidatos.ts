"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

// O e-mail dos candidatos novos (migração 20270923120000): a cada 3 novos (o padrão), a cada um ou nenhum.

const JEITOS = ["tres", "cada", "nenhum"] as const;
const FEITO: Record<(typeof JEITOS)[number], string> = {
  tres: "Pronto: o e-mail chega quando juntarem 3 candidatos novos.",
  cada: "Pronto: um e-mail a cada candidato novo.",
  nenhum: "Pronto: os candidatos não chegam mais por e-mail. O sino continua avisando.",
};

export async function mudarEmailCandidatos(jeito: string): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  if (!JEITOS.includes(jeito as (typeof JEITOS)[number])) return { ok: false, erro: "Escolha uma opção." };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta." };
  if (usuario.papel === "recrutador") return { ok: false, erro: "Só quem administra a conta pode mudar isso." };
  const { error } = await (await criarClienteServidor()).rpc("mudar_email_candidatos", { p_jeito: jeito });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: FEITO[jeito as (typeof JEITOS)[number]] };
}
