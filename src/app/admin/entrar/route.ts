import { NextResponse, type NextRequest } from "next/server";
import {
  adminConfigurado,
  chaveDoAdmin,
  confereChaveDoAdmin,
  COOKIE_ADMIN,
  ENDERECO_LOCAL,
} from "@/lib/servidor/admin-chave";

// Link que o `npm run dev` mostra no terminal: grava o cookie do admin neste navegador.
export async function GET(request: NextRequest) {
  const local = ENDERECO_LOCAL.test(request.headers.get("host") ?? "");
  if (!adminConfigurado() || !local || !confereChaveDoAdmin(request.nextUrl.searchParams.get("chave"))) {
    return new NextResponse("Não encontrado", { status: 404 });
  }
  const resposta = NextResponse.redirect(new URL("/admin", request.url));
  resposta.cookies.set(COOKIE_ADMIN, chaveDoAdmin(), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  resposta.headers.set("Cache-Control", "no-store");
  resposta.headers.set("Referrer-Policy", "no-referrer");
  return resposta;
}
