import { timingSafeEqual } from "node:crypto";
import { acessoFila } from "@/lib/servidor/filas";
import { pracasDosSalarios } from "@/lib/salarios";
import type { Json } from "@/lib/supabase/tipos-banco";

// Salário do mercado (claude/plano-salario-e-curriculo.md, parte 1): o robô do GitHub (.github/workflows/salarios.yml)
// pergunta o último mês carregado e as cidades de cada praça (GET) e manda as faixas novas (POST), com
// "Authorization: Bearer <CRON_SECRET>", o mesmo segredo das filas. Sem a migração 20270131120000: 503.
export const maxDuration = 60;

function autorizado(cabecalho: string | null) {
  const segredo = (process.env.CRON_SECRET || "").trim();
  if (segredo.length < 16 || !cabecalho) return false;
  const esperado = Buffer.from(`Bearer ${segredo}`);
  const veio = Buffer.from(cabecalho);
  return esperado.length === veio.length && timingSafeEqual(esperado, veio);
}

const SEM_MIGRACAO = "Rode antes a migração 20270131120000_salarios_do_mercado.sql no Supabase.";

export async function GET(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  const acesso = acessoFila();
  if (!acesso) return Response.json({ ok: false, erro: "Falta a chave do servidor." }, { status: 503 });
  const { data, error } = await acesso.cliente.rpc("servidor_salarios_situacao", { p_chave: acesso.chave });
  if (error) {
    const sem = error.code === "PGRST202";
    if (!sem) console.error("Publike: falha ao ler a situação dos salários:", error.message);
    return Response.json({ ok: false, erro: sem ? SEM_MIGRACAO : "Falha ao ler os salários." }, { status: 503 });
  }
  return Response.json({ ok: true, situacao: data, pracas: pracasDosSalarios() });
}

const MES = /^\d{4}-\d{2}-01$/;

export async function POST(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  const corpo = (await request.json().catch(() => null)) as { de?: unknown; ate?: unknown; linhas?: unknown } | null;
  if (
    !corpo ||
    typeof corpo.de !== "string" ||
    typeof corpo.ate !== "string" ||
    !MES.test(corpo.de) ||
    !MES.test(corpo.ate) ||
    !Array.isArray(corpo.linhas) ||
    corpo.linhas.length === 0 ||
    corpo.linhas.length > 20000
  ) {
    return Response.json(
      { ok: false, erro: "Mande { de, ate, linhas } (o salarios.json do script)." },
      { status: 400 },
    );
  }
  const acesso = acessoFila();
  if (!acesso) return Response.json({ ok: false, erro: "Falta a chave do servidor." }, { status: 503 });
  const { data, error } = await acesso.cliente.rpc("servidor_salarios_salvar", {
    p_chave: acesso.chave,
    p_de: corpo.de,
    p_ate: corpo.ate,
    p_linhas: corpo.linhas as Json,
  });
  if (error) {
    if (error.code === "PGRST202") return Response.json({ ok: false, erro: SEM_MIGRACAO }, { status: 503 });
    // a lista com valor inválido volta para o robô (a tabela de antes fica como estava)
    const invalida = error.code === "22023";
    if (!invalida) console.error("Publike: falha ao salvar os salários:", error.message);
    return Response.json({ ok: false, erro: error.message }, { status: invalida ? 400 : 500 });
  }
  return Response.json({ ok: true, linhas: data });
}
