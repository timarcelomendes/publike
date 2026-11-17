import { timingSafeEqual } from "node:crypto";
import { after } from "next/server";
import { materiasDepoisDaCarga } from "@/lib/servidor/materias-receita";
import { acessoFila } from "@/lib/servidor/filas";
import { pracasDosSalarios } from "@/lib/salarios";
import type { Json } from "@/lib/supabase/tipos-banco";

// A base de empresas da Receita (claude/plano-base-de-empresas-da-receita.md, parte 0): o robô do GitHub
// (.github/workflows/empresas.yml) pergunta o que o site já tem e as cidades das praças (GET) e manda a carga do mês em
// lotes (POST { acao: "lote" | "meis" | "cnaes" | "fim", ... }). O robô dos salários manda o que cada ramo contrata
// (POST { acao: "ramos", linhas }) e quantas pessoas cada ramo contratou em cada cidade, em lotes
// (POST { acao: "ramos_cidades", linhas, de, ate, limpar }). Sempre com "Authorization: Bearer <CRON_SECRET>", o mesmo segredo das filas.
export const maxDuration = 60;

function autorizado(cabecalho: string | null) {
  const segredo = (process.env.CRON_SECRET || "").trim();
  if (segredo.length < 16 || !cabecalho) return false;
  const esperado = Buffer.from(`Bearer ${segredo}`);
  const veio = Buffer.from(cabecalho);
  return esperado.length === veio.length && timingSafeEqual(esperado, veio);
}

const SEM_MIGRACAO = "Rode antes a migração 20270602120000_empresas_da_receita.sql no Supabase.";
const MES = /^\d{4}-\d{2}-01$/;

export async function GET(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  const acesso = acessoFila();
  if (!acesso) return Response.json({ ok: false, erro: "Falta a chave do servidor." }, { status: 503 });
  const { data, error } = await acesso.cliente.rpc("servidor_empresas_situacao", { p_chave: acesso.chave });
  if (error) {
    const sem = error.code === "PGRST202";
    if (!sem) console.error("Publike: falha ao ler a base de empresas:", error.message);
    return Response.json({ ok: false, erro: sem ? SEM_MIGRACAO : "Falha ao ler a base de empresas." }, { status: 503 });
  }
  return Response.json({ ok: true, situacao: data, pracas: pracasDosSalarios() });
}

type Corpo = { acao?: unknown; mes?: unknown; linhas?: unknown; resumo?: unknown; de?: unknown; ate?: unknown; limpar?: unknown };

export async function POST(request: Request) {
  if (!autorizado(request.headers.get("authorization"))) {
    return Response.json({ ok: false, erro: "Não autorizado." }, { status: 401 });
  }
  const corpo = (await request.json().catch(() => null)) as Corpo | null;
  const acao = corpo?.acao;
  const mes = typeof corpo?.mes === "string" && MES.test(corpo.mes) ? corpo.mes : null;
  const linhas = Array.isArray(corpo?.linhas) && corpo.linhas.length > 0 ? (corpo.linhas as Json) : null;
  const precisaMes = acao === "lote" || acao === "meis" || acao === "fim";
  const precisaLinhas = acao === "lote" || acao === "meis" || acao === "cnaes" || acao === "ramos" || acao === "ramos_cidades";
  if (
    !corpo ||
    !["lote", "meis", "cnaes", "fim", "ramos", "ramos_cidades"].includes(String(acao)) ||
    (precisaMes && !mes) ||
    (acao === "ramos_cidades" && !(typeof corpo.de === "string" && MES.test(corpo.de) && typeof corpo.ate === "string" && MES.test(corpo.ate))) ||
    (precisaLinhas && !linhas)
  ) {
    return Response.json(
      { ok: false, erro: "Mande { acao, mes, linhas } (os arquivos do scripts/empresas/receita.mjs)." },
      { status: 400 },
    );
  }
  const acesso = acessoFila();
  if (!acesso) return Response.json({ ok: false, erro: "Falta a chave do servidor." }, { status: 503 });
  const p_chave = acesso.chave;
  const c = acesso.cliente;
  const { data, error } =
    acao === "lote"
      ? await c.rpc("servidor_empresas_lote", { p_chave, p_mes: mes!, p_linhas: linhas! })
      : acao === "meis"
        ? await c.rpc("servidor_empresas_meis", { p_chave, p_mes: mes!, p_linhas: linhas! })
        : acao === "cnaes"
          ? await c.rpc("servidor_ramos_nomes", { p_chave, p_linhas: linhas! })
          : acao === "ramos"
            ? await c.rpc("servidor_ramos_salvar", { p_chave, p_linhas: linhas! })
            : acao === "ramos_cidades"
              ? await c.rpc("servidor_ramos_cidades_salvar", {
                  p_chave,
                  p_linhas: linhas!,
                  p_de: String(corpo.de),
                  p_ate: String(corpo.ate),
                  p_limpar: corpo.limpar === true,
                })
              : await c.rpc("servidor_empresas_fim", {
                p_chave,
                p_mes: mes!,
                p_resumo: (corpo.resumo && typeof corpo.resumo === "object" ? corpo.resumo : {}) as Json,
              });
  if (error) {
    if (error.code === "PGRST202") return Response.json({ ok: false, erro: SEM_MIGRACAO }, { status: 503 });
    const invalida = error.code === "22023" || error.code === "P0002";
    if (!invalida) console.error(`Publike: falha na base de empresas (${String(acao)}):`, error.message);
    return Response.json({ ok: false, erro: error.message }, { status: invalida ? 400 : 500 });
  }
  // a carga terminou: as matérias do mês viram rascunho em Admin › Notícias (uma vez por mês, depois da resposta)
  if (acao === "fim") after(() => materiasDepoisDaCarga().catch((e) => console.error("Publike: matérias do mês:", e)));
  // e os centros dos bairros do mapa dos talentos (migração 20270630120000), com os endereços novos
  if (acao === "fim") {
    after(async () => {
      const { error: e } = await c.rpc("servidor_centros_dos_bairros", { p_chave });
      if (e && e.code !== "PGRST202") console.error("Publike: centros dos bairros:", e.message);
    });
  }
  return Response.json({ ok: true, resultado: data });
}
