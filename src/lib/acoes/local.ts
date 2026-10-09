"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { cepValido, limparCep } from "@/lib/cep";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { COOKIE_LOCAL, valorCookieLocal } from "@/lib/local";
import { arredondarCasa, criarLocal } from "@/lib/regioes";
import { consultarCep } from "@/lib/servidor/cep";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Resultado } from "@/lib/tipos";

const UM_ANO = 365 * 24 * 3600;

async function guardarNoNavegador(valor: string) {
  (await cookies()).set(COOKIE_LOCAL, valor, {
    maxAge: UM_ANO,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

/**
 * "Onde você mora?": cidade e bairro e, se a pessoa quiser, o CEP de casa.
 * Com o CEP, o servidor acha o ponto (sem número) e guarda só uma grade de
 * ~300 m: na conta (para valer em qualquer aparelho) ou neste navegador.
 */
export async function salvarLocal(cidade: string, bairro: string, cep?: string | null): Promise<Resultado> {
  let local = criarLocal(String(cidade), String(bairro ?? ""), "busca");
  if (!local) return { ok: false, erro: "Escolha uma cidade da lista." };

  const c = limparCep(typeof cep === "string" ? cep : "");
  if (c) {
    if (!cepValido(c)) return { ok: false, erro: "O CEP tem 8 números." };
    const r = await consultarCep(c);
    if (!r.ok) return { ok: false, erro: r.erro };
    if (!r.ponto) return { ok: false, erro: "Não achamos esse CEP no mapa. Escolha só a cidade e o bairro." };
    local = criarLocal(r.endereco.cidade, String(bairro ?? "") || r.endereco.bairro || "", "casa", {
      cep: c,
      ponto: arredondarCasa(r.ponto),
    });
    if (!local) return { ok: false, erro: "Por enquanto o Publike funciona em Goiânia e região." };

    const usuario = MODO_DEMO ? null : await obterUsuario();
    if (usuario) {
      const supabase = await criarClienteServidor();
      const { error } = await supabase.from("casas").upsert(
        {
          cep: c,
          cidade: local.cidade,
          bairro: local.bairro,
          local: `SRID=4326;POINT(${local.ponto!.lng} ${local.ponto!.lat})`,
        },
        { onConflict: "perfil_id" },
      );
      if (!error) {
        // vale a casa da conta; o navegador não precisa guardar nada
        (await cookies()).delete(COOKIE_LOCAL);
        refresh();
        return { ok: true };
      }
      // sem perfil ainda (ou o banco falhou): guarda neste navegador
    }
  } else if (!MODO_DEMO && (await obterUsuario())) {
    // trocou o CEP por só cidade e bairro: esquece a casa da conta
    const supabase = await criarClienteServidor();
    await supabase.from("casas").delete().not("perfil_id", "is", null);
  }

  await guardarNoNavegador(valorCookieLocal(local));
  refresh();
  return { ok: true };
}

/** Esquece o que foi escolhido (volta a usar o perfil, ou o centro de Goiânia). */
export async function esquecerLocal(): Promise<Resultado> {
  (await cookies()).delete(COOKIE_LOCAL);
  if (!MODO_DEMO && (await obterUsuario())) {
    const supabase = await criarClienteServidor();
    await supabase.from("casas").delete().not("perfil_id", "is", null);
  }
  refresh();
  return { ok: true };
}
