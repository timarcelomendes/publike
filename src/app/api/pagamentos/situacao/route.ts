import { criarClienteServidor } from "@/lib/supabase/servidor";

// A tela do Pix pergunta, a cada poucos segundos, se a cobrança já foi paga (o banco só responde a da conta).
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) return Response.json({ situacao: null }, { status: 400 });
  const supabase = await criarClienteServidor();
  const { data } = await supabase.rpc("situacao_da_cobranca", { p_id: id });
  return Response.json({ situacao: data ?? null }, { headers: { "Cache-Control": "no-store" } });
}
