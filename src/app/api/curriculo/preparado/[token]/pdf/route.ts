import { connection } from "next/server";
import { pdfDoCurriculo } from "@/lib/servidor/arquivos-do-curriculo";
import { curriculoParaArquivo, nomeDoPdf } from "@/lib/servidor/curriculo-pelo-whatsapp";

// O PDF de uma página do currículo montado no WhatsApp (migração 20270903120000): a Meta busca por este link quando a
// pessoa escreve "PDF" depois da prévia. Vale 7 dias, pelo token; com o nome e o número do WhatsApp, para imprimir.

export async function GET(_pedido: Request, { params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7);
  const r = await curriculoParaArquivo(token, hoje, true);
  if (!r) return new Response("Este link venceu.", { status: 404 });
  const pdf = await pdfDoCurriculo(r.curriculo, r.nome, r.telefone, hoje);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${nomeDoPdf(r.nome)}"`,
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
