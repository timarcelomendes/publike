"use server";

import { redirect } from "next/navigation";
import { obterMeuCurriculo, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import { curriculoImpresso, MAX_LUGARES_DA_ROTA, RAIOS_DA_ROTA } from "@/lib/rota-curriculo";
import { origemDaRota } from "@/lib/servidor/funcoes-da-rota";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

// Quem contrata perto, antes Rota do currículo (claude/plano-base-de-empresas-da-receita.md, parte 2; migração
// 20270605120000): montar a rota (guarda o currículo como vai no papel e cria uma cópia com QR code para cada lugar) e
// o checklist.

export async function montarRota(dados: {
  cbo: string;
  funcao: string;
  raio: number;
  cnpjs: string[];
}): Promise<Resultado> {
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre para imprimir as cópias." };
  const [perfil, curriculo] = await Promise.all([obterMeuPerfil(), obterMeuCurriculo()]);
  if (!perfil || !curriculo) return { ok: false, erro: "Preencha o seu currículo antes de imprimir." };
  // a mesma origem da página (a folha da rota sai na ordem que a pessoa viu); o centro da cidade não vale para montar
  const origem = await origemDaRota(perfil);
  if (origem.tipo === "cidade") return { ok: false, erro: "Diga de onde você sai (CEP, bairro ou a sua localização) para imprimir as cópias na ordem do caminho." };
  const ponto = origem.ponto;
  const cnpjs = [...new Set((dados?.cnpjs ?? []).filter((c) => /^[0-9A-Z]{12}[0-9]{2}$/.test(String(c))))];
  if (!cnpjs.length) return { ok: false, erro: "Escolha pelo menos um lugar." };
  if (cnpjs.length > MAX_LUGARES_DA_ROTA) return { ok: false, erro: `Escolha até ${MAX_LUGARES_DA_ROTA} lugares.` };
  const raio = (RAIOS_DA_ROTA as readonly number[]).includes(Number(dados.raio)) ? Number(dados.raio) : 2;
  const funcao = String(dados.funcao ?? "").trim().slice(0, 90);
  const banco = await criarClienteServidor();
  const { data, error } = await banco.rpc("criar_rota_curriculo", {
    p_cbo: /^\d{6}$/.test(String(dados.cbo)) ? dados.cbo : "",
    p_funcao: funcao,
    p_lat: ponto.lat,
    p_lng: ponto.lng,
    p_raio_km: raio,
    p_cnpjs: cnpjs,
    p_curriculo: curriculoImpresso(perfil, curriculo, funcao),
  });
  if (error) {
    if (error.code === "54000" || error.code === "22023") return { ok: false, erro: error.message };
    console.error("Publike: falha ao montar a rota do currículo:", error.message);
    return { ok: false, erro: "Não deu para preparar as cópias agora. Tente de novo." };
  }
  const rota = (data as { rota?: string } | null)?.rota;
  if (!rota) return { ok: false, erro: "Não deu para preparar as cópias agora." };
  redirect(`/quem-contrata-perto/${rota}?imprimir=1`);
}

/** "Entreguei" e "Desligar a página" de uma cópia. */
export async function mudarCopia(codigo: string, mudanca: { entregue?: boolean; desligada?: boolean }): Promise<Resultado> {
  if (!/^[a-z0-9]{10}$/.test(String(codigo ?? ""))) return { ok: false, erro: "Cópia inválida." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre de novo." };
  const banco = await criarClienteServidor();
  const { data, error } = await banco.rpc("mudar_copia_curriculo", {
    p_codigo: codigo,
    p_entregue: typeof mudanca?.entregue === "boolean" ? mudanca.entregue : null,
    p_desligada: typeof mudanca?.desligada === "boolean" ? mudanca.desligada : null,
  });
  if (error || !data) return { ok: false, erro: "Não deu para salvar agora." };
  return { ok: true };
}

/** "Alguém te chamou?" (migração 20270606120000). */
export async function responderRota(rota: string, resposta: "sim" | "nao" | "ainda_nao"): Promise<Resultado> {
  if (!["sim", "nao", "ainda_nao"].includes(resposta)) return { ok: false, erro: "Resposta inválida." };
  if (!(await obterUsuario())) return { ok: false, erro: "Entre de novo." };
  const banco = await criarClienteServidor();
  const { data, error } = await banco.rpc("responder_rota_curriculo", { p_rota: rota, p_resposta: resposta });
  if (error || !data) return { ok: false, erro: "Não deu para salvar agora." };
  return { ok: true };
}
