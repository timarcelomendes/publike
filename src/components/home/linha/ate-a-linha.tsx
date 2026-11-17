import type { ReactNode } from "react";
import { ateALinha } from "@/lib/servidor/linha";

/**
 * Um bloco do alto da linha do tempo, já começado (`bloco`), que aparece junto com a linha ou fica de fora desta vez
 * (`ateALinha`, em src/lib/servidor/linha.ts). Sem Suspense em volta: não chega depois empurrando a linha.
 */
export async function AteALinha({ bloco, chave }: { bloco: Promise<ReactNode>; chave: string }) {
  return await ateALinha(bloco, chave);
}
