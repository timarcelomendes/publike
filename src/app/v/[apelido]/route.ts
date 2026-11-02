import { type NextRequest, NextResponse } from "next/server";
import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";

// O endereço curto da página de carreiras (publike.org/v/apelido, claude/plano-pagina-de-vagas.md, parte 3): leva
// para a página de vagas da conta, com a origem do link (utm) junto. Apelido que não existe (ou de conta que não
// está mais liberada): a busca de vagas.

export async function GET(request: NextRequest, ctx: RouteContext<"/v/[apelido]">) {
  const { apelido } = await ctx.params;
  const busca = request.nextUrl.search;
  let conta: string | null = null;
  if (!MODO_DEMO && /^[a-z0-9-]{3,30}$/i.test(apelido)) {
    const { data } = await criarClientePublico().rpc("conta_do_apelido", { p_apelido: apelido.toLowerCase() });
    conta = typeof data === "string" ? data : null;
  }
  const destino = conta ? `/perfil/${conta}/vagas${busca}` : "/vagas";
  return NextResponse.redirect(new URL(destino, request.url), { status: 307 });
}
