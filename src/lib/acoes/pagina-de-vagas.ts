"use server";

import { refresh, updateTag } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { corValida } from "@/lib/marca";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

// A página de carreiras personalizada (migração 20270117120000): salvar a cor, a capa, o texto, os benefícios e o
// endereço curto. O banco confere de novo (a liberação, quem pode, cada campo e o apelido de outra conta).

export type PaginaParaSalvar = {
  cor: string | null;
  capa: string | null;
  texto: string;
  beneficios: string[];
  apelido: string;
};

export async function salvarPaginaDeVagas(dados: PaginaParaSalvar): Promise<Resultado> {
  if (MODO_DEMO) return { ok: false, erro: MENSAGEM_DEMO };
  const usuario = await obterUsuario();
  if (!usuario) return { ok: false, erro: "Entre na sua conta.", ir: "/entrar?next=%2Fpainel%2Flinks%2Fpagina" };
  const cor = corValida(dados?.cor) ? dados.cor : null;
  const capa =
    typeof dados?.capa === "string" && /^[0-9a-f-]{36}\/capa\/\d{10,16}\.jpg$/.test(dados.capa) ? dados.capa : null;
  const texto = String(dados?.texto ?? "")
    .trim()
    .slice(0, 600);
  const beneficios = (Array.isArray(dados?.beneficios) ? dados.beneficios : [])
    .map((b) => String(b).trim().slice(0, 60))
    .filter(Boolean)
    .slice(0, 6);
  const apelido = String(dados?.apelido ?? "")
    .trim()
    .toLowerCase();
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc("salvar_pagina_de_vagas", {
    p_cor: cor,
    p_capa: capa,
    p_texto: texto || null,
    p_beneficios: beneficios,
    p_apelido: apelido || null,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para salvar agora. Tente de novo.") };
  // as capas antigas saem da pasta de quem enviou (a de agora fica)
  const pasta = `${usuario.pessoaId}/capa`;
  const { data: arquivos } = await supabase.storage.from("avatars").list(pasta, { limit: 100 });
  const sobras = (arquivos ?? []).map((a) => `${pasta}/${a.name}`).filter((c) => c !== capa);
  if (sobras.length) await supabase.storage.from("avatars").remove(sobras);
  // o quadro do site e a imagem do link guardam as vagas por 15 min: a cor e a capa entram já
  updateTag(`vagas-da-empresa-${usuario.id}`);
  refresh();
  return { ok: true, mensagem: "Página salva." };
}
