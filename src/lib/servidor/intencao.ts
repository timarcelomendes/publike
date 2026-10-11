import "server-only";
import { cookies } from "next/headers";
import { COOKIE_INTENCAO, lerIntencao, type Intencao } from "@/lib/intencao";

/** O que a pessoa disse que quer fazer no Publike (neste navegador). */
export async function obterIntencao(): Promise<Intencao | null> {
  return lerIntencao((await cookies()).get(COOKIE_INTENCAO)?.value);
}
