import { type NextRequest, NextResponse } from "next/server";
import { MODO_DEMO } from "@/lib/config";
import { criarClientePublico } from "@/lib/supabase/servidor";

// O link curto das vagas no WhatsApp do atendimento (21/11/2026; Marcelo: "deixe os links das vagas encurtado, acho que
// ocupando menos espaço é mais amigável"): publike.org/w/3f9c2b1d leva à vaga cujo id começa com esses 8 caracteres,
// com a origem do link. A letra no fim é a campanha de quem veio de um anúncio de clique para o WhatsApp (i: Instagram,
// f: Facebook, m: Meta); sem letra, o atendimento (src/lib/servidor/atendimento-whatsapp.ts, `linkDaVaga`). Vaga que
// não está mais no ar (ou código que não existe): a busca de vagas, com a mesma origem.

const CAMPANHAS: Record<string, string> = { i: "ig-whatsapp", f: "fb-whatsapp", m: "meta-whatsapp" };

export async function GET(request: NextRequest, ctx: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await ctx.params;
  const m = /^([0-9a-f]{8})([ifm])?$/.exec(codigo.toLowerCase());
  const origem = m?.[2]
    ? { utm_source: "meta-ads", utm_campaign: CAMPANHAS[m[2]] }
    : { utm_source: "whatsapp", utm_campaign: "atendimento" };
  let id: string | null = null;
  if (m && !MODO_DEMO) {
    // os ids que começam com o código (uuid em ordem: do ...-0000 ao ...-ffff); havendo dois, o mais novo
    const { data } = await criarClientePublico()
      .from("anuncios")
      .select("id")
      .gte("id", `${m[1]}-0000-0000-0000-000000000000`)
      .lte("id", `${m[1]}-ffff-ffff-ffff-ffffffffffff`)
      .order("criado_em", { ascending: false })
      .limit(1);
    id = data?.[0]?.id ?? null;
  }
  const destino = new URL(id ? `/anuncio/${id}` : "/", request.url);
  if (!id) destino.searchParams.set("tipo", "vaga");
  for (const [k, v] of Object.entries(origem)) destino.searchParams.set(k, v);
  return NextResponse.redirect(destino, { status: 307 });
}
