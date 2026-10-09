// Configuração lida das variáveis de ambiente (.env.local).
// Sem as chaves do Supabase o site roda em "modo demonstração".

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_CHAVE =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const MODO_DEMO = !(SUPABASE_URL && SUPABASE_CHAVE);

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");

export const MAPA_ESTILO =
  process.env.NEXT_PUBLIC_MAPA_ESTILO || "https://tiles.openfreemap.org/styles/positron";

export const CONTATO_EMAIL = process.env.NEXT_PUBLIC_CONTATO_EMAIL || "";

/** Formas de entrar. E-mail sempre funciona; as outras precisam ser ativadas no Supabase (veja o README). */
export const LOGIN_GOOGLE = process.env.NEXT_PUBLIC_LOGIN_GOOGLE === "true";
export const LOGIN_FACEBOOK = process.env.NEXT_PUBLIC_LOGIN_FACEBOOK === "true";
export const LOGIN_LINKEDIN = process.env.NEXT_PUBLIC_LOGIN_LINKEDIN === "true";
export const LOGIN_CELULAR = process.env.NEXT_PUBLIC_LOGIN_CELULAR === "true";
/**
 * ID do cliente OAuth do Google (é público). Com ele, o login do Google usa o
 * botão oficial no próprio site, e a janela do Google mostra o Publike em vez
 * do endereço do Supabase. Sem ele, o botão leva para a página do Google.
 */
export const GOOGLE_CLIENT_ID = (process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "").trim();

// Chave pública do Cloudflare Turnstile (verificação contra robôs no pedido do
// link de acesso e do código por SMS). Vazia: o formulário funciona sem ela.
// A chave secreta fica só no Supabase (Authentication > Attack Protection).
export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "").trim();

/** Praça Cívica, centro de Goiânia: ponto de partida das buscas. */
export const CENTRO_GOIANIA = { lat: -16.6806, lng: -49.2563 } as const;

/** Caixa da região metropolitana (a mesma regra do banco). */
export const REGIAO = { latMin: -17.5, latMax: -15.9, lngMin: -50.3, lngMax: -48.4 } as const;

export const MENSAGEM_DEMO =
  "Este é o modo demonstração: nada é salvo. Para publicar de verdade, conecte o Supabase (veja o README).";
