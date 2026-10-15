import { arquivoModelo } from "@/lib/convites";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";

// Modelo da planilha de convites (CSV com ";", abre em colunas no Excel em português).
export async function GET() {
  if (!(await clienteAdminOuNulo())) return new Response("Não encontrado", { status: 404 });
  return new Response(arquivoModelo(), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="modelo-convites-publike.csv"',
      "cache-control": "no-store",
    },
  });
}
