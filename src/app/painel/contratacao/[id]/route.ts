import { NextResponse, type NextRequest } from "next/server";
import { obterUsuario } from "@/lib/dados";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// Aviso "quer mostrar no Publike a contratação": quem contratou vai para a vaga
// (lista de candidatos); quem foi contratado, para Minhas curtidas.
export async function GET(req: NextRequest, ctx: RouteContext<"/painel/contratacao/[id]">) {
  const { id } = await ctx.params;
  const usuario = await obterUsuario();
  if (!usuario) return NextResponse.redirect(new URL(`/entrar?next=/painel/contratacao/${id}`, req.url));
  if (UUID.test(id)) {
    const supabase = await criarClienteServidor();
    const { data } = await supabase.from("anuncios").select("autor_id").eq("id", id).maybeSingle();
    if (data?.autor_id === usuario.id) return NextResponse.redirect(new URL(`/painel/anuncio/${id}`, req.url));
  }
  return NextResponse.redirect(new URL("/painel/curtidas?etapa=contratado", req.url));
}
