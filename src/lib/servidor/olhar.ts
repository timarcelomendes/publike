import "server-only";
import { NextResponse } from "next/server";

// Ver como o dono (migração 20270919120000): os dois pedidos que começam e param de olhar. O token novo (o gancho do
// Auth põe "conta" e "papel": "olhar") é o que faz o site e o banco mostrarem a conta do dono.

export const PAPEL_OLHAR = "olhar";
export const CAMINHO_PARAR_DE_OLHAR = "/admin/olhar/parar";

/** O "papel" do token (o gancho do Auth), sem conferir a assinatura: só para decidir o que mostrar ou recusar. */
export function papelDoToken(token: string | undefined): string | null {
  try {
    const corpo = JSON.parse(Buffer.from((token ?? "").split(".")[1] ?? "", "base64url").toString("utf8"));
    return typeof corpo?.papel === "string" ? corpo.papel : null;
  } catch {
    return null;
  }
}

/** Volta para a tela do pedido (303: o navegador abre com GET). */
export function irPara(request: Request, caminho: string) {
  const r = NextResponse.redirect(new URL(caminho, request.url), 303);
  r.headers.set("Cache-Control", "no-store");
  return r;
}
