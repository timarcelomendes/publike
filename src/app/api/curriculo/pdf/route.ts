import { NextResponse } from "next/server";
import { MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// O PDF do currículo pelo próprio site (09/11/2026). O navegador manda direto para o Storage; quando isso falha
// sempre para a mesma pessoa ("Failed to fetch" dias seguidos, com o resto do site funcionando), o endereço do
// Storage está bloqueado na rede dela (operadora, antivírus, navegador de app). Aqui o arquivo passa pelo
// publike.org e vai para a mesma pasta privada da conta, com o login dela (as mesmas regras do Storage).

/** A Vercel aceita até ~4,5 MB por pedido: o PDF maior que isso continua só pelo caminho direto. */
const MAXIMO = 4 * 1024 * 1024;

export async function POST(pedido: Request) {
  if (MODO_DEMO) return NextResponse.json({ erro: "No modo demonstração o PDF não é enviado." }, { status: 400 });
  const supabase = await criarClienteServidor();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return NextResponse.json({ erro: "Entre na sua conta." }, { status: 401 });
  let pdf: FormDataEntryValue | null = null;
  try {
    pdf = (await pedido.formData()).get("pdf");
  } catch {
    return NextResponse.json({ erro: "Não deu para receber o PDF." }, { status: 400 });
  }
  if (!(pdf instanceof File) || pdf.type !== "application/pdf") {
    return NextResponse.json({ erro: "Envie um arquivo PDF." }, { status: 400 });
  }
  if (pdf.size > MAXIMO) return NextResponse.json({ erro: "O PDF passa de 4 MB." }, { status: 413 });
  const caminho = `${id}/${Date.now()}.pdf`;
  const { error } = await supabase.storage
    .from("curriculos")
    .upload(caminho, pdf, { contentType: "application/pdf", upsert: false });
  if (error) {
    console.error(`Publike: o PDF do currículo não subiu pelo site: ${error.message}`);
    return NextResponse.json({ erro: "Não deu para guardar o PDF." }, { status: 502 });
  }
  return NextResponse.json({ caminho });
}
