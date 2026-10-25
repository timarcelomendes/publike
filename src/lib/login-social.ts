import type { Provider } from "@supabase/supabase-js";
import { LOGIN_CELULAR, LOGIN_FACEBOOK, LOGIN_GOOGLE, LOGIN_LINKEDIN } from "./config";

export type RedeSocial = "google" | "facebook" | "linkedin";

/** Um botão da tela de entrar: `logo` é o arquivo oficial em public/marcas/, se existir. */
export type BotaoRede = { rede: RedeSocial; nome: string; logo: string | null };

/** Redes sociais de login, na ordem dos botões. `provedor` é o nome no Supabase Auth. */
export const REDES: Record<RedeSocial, { nome: string; provedor: Provider; ativa: boolean }> = {
  google: { nome: "Google", provedor: "google", ativa: LOGIN_GOOGLE },
  facebook: { nome: "Facebook", provedor: "facebook", ativa: LOGIN_FACEBOOK },
  linkedin: { nome: "LinkedIn", provedor: "linkedin_oidc", ativa: LOGIN_LINKEDIN },
};

/** As redes ligadas no .env.local (NEXT_PUBLIC_LOGIN_GOOGLE, _FACEBOOK, _LINKEDIN). */
export const REDES_ATIVAS = (Object.keys(REDES) as RedeSocial[]).filter((rede) => REDES[rede].ativa);

/**
 * Os jeitos de entrar que estão ligados, para os textos ("o e-mail, o Google ou o LinkedIn"; com o
 * celular ligado, ele vem primeiro: o código chega por SMS). Nunca "WhatsApp": não se entra por ele.
 */
export function jeitosDeEntrar() {
  const jeitos = [
    ...(LOGIN_CELULAR ? ["o celular"] : []),
    "o e-mail",
    ...REDES_ATIVAS.map((rede) => `o ${REDES[rede].nome}`),
  ];
  return jeitos.length > 1 ? `${jeitos.slice(0, -1).join(", ")} ou ${jeitos.at(-1)}` : jeitos[0];
}

export function ehRedeSocial(valor: unknown): valor is RedeSocial {
  return typeof valor === "string" && Object.hasOwn(REDES, valor);
}
