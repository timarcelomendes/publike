import { pdfDaNota } from "@/lib/servidor/faturas";

// O PDF da nota fiscal da fatura (só da conta logada), entregue pelo Publike.
export async function GET(_request: Request, { params }: RouteContext<"/painel/faturas/[id]/nota">) {
  const { id } = await params;
  const nota = await pdfDaNota(id);
  if (!nota) return new Response("Nota fiscal não encontrada.", { status: 404 });
  const nome = `nota-fiscal-publike${nota.numero ? `-${nota.numero.replace(/[^0-9A-Za-z-]/g, "")}` : ""}.pdf`;
  return new Response(nota.pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
