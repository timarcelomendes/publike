import { timingSafeEqual } from "node:crypto";
import esperado from "@/lib/gerado/banco-esperado.json";
import { compararBanco } from "@/lib/servidor/saude-do-banco";
import { acessoFila } from "@/lib/servidor/filas";

// Produção igual às migrações (migração 20270629110000): compara as migrações registradas e a impressão do banco de
// produção com src/lib/gerado/banco-esperado.json (a de um banco novo com todas as migrações, conferida pelo CI).
// A tarefa .github/workflows/banco.yml chama de hora em hora com "Authorization: Bearer <CRON_SECRET>"; responde 500
// quando falta migração ou algo está diferente, e o GitHub manda o e-mail.
export const maxDuration = 30;

function autorizado(cabecalho: string | null) {
  const segredo = (process.env.CRON_SECRET || "").trim();
  if (segredo.length < 16 || !cabecalho) return false;
  const certo = Buffer.from(`Bearer ${segredo}`);
  const veio = Buffer.from(cabecalho);
  return certo.length === veio.length && timingSafeEqual(certo, veio);
}

export async function GET(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  const acesso = acessoFila();
  if (!acesso) return Response.json({ ok: false, erro: "Falta a chave do servidor." }, { status: 500 });
  const { data, error } = await acesso.cliente.rpc("servidor_saude_do_banco", { p_chave: acesso.chave });
  if (error) {
    // PGRST202: a função não existe: a própria migração 20270629110000 não rodou
    const erro =
      error.code === "PGRST202"
        ? "Produção sem a migração 20270629110000_registro_e_impressao_do_banco (e talvez outras)."
        : `Não deu para ler o banco: ${error.message}`;
    return Response.json({ ok: false, erro }, { status: 500 });
  }
  const resultado = compararBanco(esperado, data);
  return Response.json(resultado, { status: resultado.ok ? 200 : 500 });
}
