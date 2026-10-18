import { criarClientePublico } from "@/lib/supabase/servidor";

// As cópias das fotos do Pixabay (o Pixabay não deixa usar o link deles no site).
// Cache de um ano: a foto de um número nunca muda, e o banco quase não é lido.

export async function GET(_: Request, { params }: { params: Promise<{ arquivo: string }> }) {
  const m = (await params).arquivo.match(/^([a-z]+-\d{1,20})\.(jpg|png|webp)$/);
  if (!m) return new Response("Não achamos essa foto.", { status: 404 });
  const { data } = await criarClientePublico().rpc("foto_noticia", { p_id: m[1] });
  const foto = data?.[0];
  if (!foto) return new Response("Não achamos essa foto.", { status: 404 });
  return new Response(Buffer.from(foto.dados, "base64"), {
    headers: {
      "content-type": foto.tipo,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
