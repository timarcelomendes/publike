import "server-only";
import { cookies } from "next/headers";
import { cache } from "react";
import { obterMeuPerfil } from "@/lib/dados";
import { COOKIE_SO_OLHAR } from "@/lib/so-olhar";

/** Empresa, comércio ou agência vendo o Publike como pessoa, só olhando (o cookie vale só para elas). */
export const soOlharComoPessoa = cache(async (): Promise<boolean> => {
  if ((await cookies()).get(COOKIE_SO_OLHAR)?.value !== "1") return false;
  const perfil = await obterMeuPerfil().catch(() => null);
  return Boolean(perfil && perfil.tipo !== "pessoa");
});
