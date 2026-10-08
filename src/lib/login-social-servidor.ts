import "server-only";
import fs from "node:fs";
import path from "node:path";
import { cacheLife } from "next/cache";
import { SUPABASE_CHAVE, SUPABASE_URL } from "./config";
import { REDES, REDES_ATIVAS, type BotaoRede, type RedeSocial } from "./login-social";

/**
 * Provedores que estão ligados no Supabase (Authentication → Sign In / Providers).
 * Guardado por alguns minutos. Se o Supabase não responder, devolve null e
 * valem só as variáveis do .env.local.
 */
async function provedoresNoSupabase(): Promise<Record<string, boolean> | null> {
  "use cache";
  cacheLife("minutes");
  try {
    const resposta = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_CHAVE },
      signal: AbortSignal.timeout(3000),
    });
    if (!resposta.ok) return null;
    const dados = (await resposta.json()) as { external?: Record<string, boolean> };
    return dados.external ?? null;
  } catch {
    return null;
  }
}

/**
 * Logo oficial da rede no botão, se o arquivo existir em public/marcas/
 * (google.svg, facebook.svg, linkedin.svg ou .png; veja o README).
 * Sem o arquivo, o botão mostra só o texto.
 */
function logoDaRede(rede: RedeSocial): string | null {
  for (const extensao of ["svg", "png"]) {
    const arquivo = `${rede}.${extensao}`;
    if (fs.existsSync(path.join(process.cwd(), "public", "marcas", arquivo))) return `/marcas/${arquivo}`;
  }
  return null;
}

/**
 * Botões de rede social da tela de entrar: os ligados no .env.local que também
 * estão ativos no Supabase. Assim um botão nunca leva a uma página de erro do Supabase.
 */
export async function redesParaEntrar(): Promise<BotaoRede[]> {
  if (REDES_ATIVAS.length === 0) return [];
  const noSupabase = await provedoresNoSupabase();
  return REDES_ATIVAS.filter((rede) => !noSupabase || noSupabase[REDES[rede].provedor] !== false).map((rede) => ({
    rede,
    nome: REDES[rede].nome,
    logo: logoDaRede(rede),
  }));
}
