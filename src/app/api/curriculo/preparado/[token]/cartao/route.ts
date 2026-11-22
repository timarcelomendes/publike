import { connection } from "next/server";
import { cartaoDoCurriculo } from "@/lib/servidor/arquivos-do-curriculo";
import { curriculoParaArquivo } from "@/lib/servidor/curriculo-pelo-whatsapp";

// O cartão em imagem do currículo montado no WhatsApp (migração 20270903120000): a Meta busca por este link quando a
// pessoa escreve "cartão" depois da prévia. Vale 7 dias, pelo token; sem telefone.

export async function GET(_pedido: Request, { params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
  const r = await curriculoParaArquivo(token, hoje, false);
  if (!r) return new Response("Este link venceu.", { status: 404 });
  return cartaoDoCurriculo(r.curriculo, r.nome, hoje);
}
