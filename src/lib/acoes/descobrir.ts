"use server";

import { refresh } from "next/cache";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { mensagemDeErro } from "@/lib/erros";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";
import { temContato, UUID } from "@/lib/validacao";

async function logado(voltar = "/descobrir") {
  if (MODO_DEMO) return { erro: { ok: false as const, erro: MENSAGEM_DEMO } };
  const usuario = await obterUsuario();
  if (!usuario) {
    return { erro: { ok: false as const, erro: "Entre para usar o Descobrir.", ir: `/entrar?next=${encodeURIComponent(voltar)}` } };
  }
  return { supabase: await criarClienteServidor() };
}

/** Guardar a vaga para ver depois. */
export async function salvarVaga(anuncioId: string, salvar = true): Promise<Resultado> {
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Vaga não encontrada." };
  const r = await logado(`/anuncio/${anuncioId}`);
  if (!r.supabase) return r.erro;
  const { error } = salvar
    ? await r.supabase.from("salvas").insert({ anuncio_id: anuncioId })
    : await r.supabase.from("salvas").delete().eq("anuncio_id", anuncioId);
  if (error && error.code !== "23505") return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: salvar ? "Vaga salva." : "Vaga tirada das salvas." };
}

/** Passar a vaga (some do "Para você" por 30 dias). `passar = false` desfaz. */
export async function passarVaga(anuncioId: string, passar = true): Promise<Resultado> {
  if (!UUID.test(anuncioId)) return { ok: false, erro: "Vaga não encontrada." };
  const r = await logado();
  if (!r.supabase) return r.erro;
  const { error } = passar
    ? await r.supabase.from("dispensas").insert({ anuncio_id: anuncioId })
    : await r.supabase.from("dispensas").delete().eq("anuncio_id", anuncioId);
  if (error && error.code !== "23505") return { ok: false, erro: mensagemDeErro(error) };
  return { ok: true };
}

/** Voltar a ver todas as vagas que a pessoa passou. */
export async function verPassadasDeNovo(): Promise<Resultado> {
  const r = await logado();
  if (!r.supabase) return r.erro;
  const usuario = await obterUsuario();
  const { error } = await r.supabase.from("dispensas").delete().eq("perfil_id", usuario!.id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}

/** "O que você procura?" */
export async function salvarProcuro(texto: string): Promise<Resultado> {
  const procuro = (typeof texto === "string" ? texto : "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (temContato(procuro)) return { ok: false, erro: "Tire o telefone, e-mail ou link do texto." };
  const r = await logado();
  if (!r.supabase) return r.erro;
  // perfil_id vem sozinho (auth.uid()); a pessoa só escreve o texto
  const { error } = await r.supabase
    .from("preferencias")
    .upsert({ procuro: procuro || null }, { onConflict: "perfil_id" });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true, mensagem: "Pronto: as vagas foram reordenadas." };
}
