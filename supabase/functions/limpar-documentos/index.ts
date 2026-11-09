// Limpar os documentos da admissão vencidos (claude/plano-seguranca.md, item 2).
//
// Antes, o site apagava pelo Storage sem login, e o banco abria os arquivos marcados para qualquer visitante por
// 15 minutos (uma regra do Storage para "anon"). Aqui a limpeza roda dentro do Supabase, com a chave secreta que o
// próprio Supabase dá às Edge Functions: o site só pede, e ninguém de fora vê os arquivos.
//
// Quem chama precisa mandar a chave do servidor (a mesma das filas) no cabeçalho "x-publike-chave"; o banco confere
// (privado.exigir_servidor). Publicar com "Verify JWT" desligado: a conferência é a da chave.

import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "documentos-admissao";

function chaveSecreta() {
  const antiga = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (antiga) return antiga;
  // as chaves novas do Supabase chegam num JSON ({"default": "sb_secret_..."})
  try {
    const novas = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}") as Record<string, string>;
    return novas.default ?? Object.values(novas)[0] ?? "";
  } catch {
    return "";
  }
}

function chavePublica() {
  const antiga = Deno.env.get("SUPABASE_ANON_KEY");
  if (antiga) return antiga;
  try {
    const novas = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}") as Record<string, string>;
    return novas.default ?? Object.values(novas)[0] ?? "";
  } catch {
    return "";
  }
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

Deno.serve(async (pedido) => {
  if (pedido.method !== "POST") return json({ erro: "Use POST." }, 405);
  const chaveDoServidor = pedido.headers.get("x-publike-chave") ?? "";
  if (chaveDoServidor.length < 32) return json({ erro: "Sem a chave do servidor." }, 401);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const secreta = chaveSecreta();
  const publica = chavePublica();
  if (!url || !secreta || !publica) return json({ erro: "A função está sem as chaves do Supabase." }, 500);
  const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };
  // o pedido ao banco vai com a chave do servidor e sem privilégio: o banco confere a chave
  const banco = createClient(url, publica, opcoes);
  // só o Storage usa a chave secreta, e só para apagar os caminhos que o banco devolveu
  const storage = createClient(url, secreta, opcoes).storage;

  const { data, error } = await banco.rpc("servidor_documentos_vencidos", { p_chave: chaveDoServidor, p_limite: 200 });
  if (error) {
    const negado = error.code === "42501";
    return json({ erro: negado ? "Chave do servidor inválida." : error.message }, negado ? 401 : 500);
  }
  const linhas = (data ?? []) as { proposta_id: string; caminho: string }[];
  const caminhos = linhas.map((l) => l.caminho).filter((c) => typeof c === "string" && c.length > 0);
  if (caminhos.length) {
    const { error: erroApagar } = await storage.from(BUCKET).remove(caminhos);
    if (erroApagar) return json({ erro: `Não deu para apagar: ${erroApagar.message}` }, 500);
  }
  const propostas = [...new Set(linhas.map((l) => l.proposta_id))];
  const { error: erroMarcar } = await banco.rpc("servidor_documentos_apagados", {
    p_chave: chaveDoServidor,
    p_propostas: propostas,
  });
  if (erroMarcar) return json({ erro: `Apagou, mas não marcou: ${erroMarcar.message}`, apagados: caminhos.length }, 500);
  return json({ apagados: caminhos.length });
});
