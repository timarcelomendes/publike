import "server-only";
import { cache } from "react";
import { MODO_DEMO } from "@/lib/config";
import { lerStatusConexao, type Conexao, type EstadoConexao } from "@/lib/conexoes";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { Database } from "@/lib/supabase/tipos-banco";
import { UUID } from "@/lib/validacao";

// Leituras das conexões (o banco decide o que cada um vê: o contato só na conexão aceita).

type Linha = Database["public"]["Functions"]["minhas_conexoes"]["Returns"][number];

/** O banco ainda sem a migração das conexões: a função não existe. */
function semMigracao(error: { code?: string }) {
  return error.code === "PGRST202" || error.code === "PGRST205" || error.code === "42P01";
}

function lerConexao(l: Linha): Conexao {
  return {
    ...l,
    status: lerStatusConexao(l.status),
    ultima_minha: l.ultima_minha === true,
    nao_lidas: l.nao_lidas ?? 0,
  };
}

/** As minhas conexões e pedidos, do mais recente (null: não deu para ler). */
export const minhasConexoes = cache(async (): Promise<Conexao[] | null> => {
  if (MODO_DEMO) return [];
  const { data, error } = await (await criarClienteServidor()).rpc("minhas_conexoes", {});
  if (error) {
    if (semMigracao(error)) return [];
    console.error(`Publike: falha ao ler as conexões: ${error.message}`);
    return null;
  }
  return (data ?? []).map(lerConexao);
});

/**
 * A conexão com uma conta (o pedido ou, aceita, os contatos; a conversa fica em Conversas). null:
 * não há conexão com ela; undefined: não deu para ler.
 */
export async function conexaoCom(outroId: string): Promise<Conexao | null | undefined> {
  if (MODO_DEMO || !UUID.test(outroId)) return null;
  const { data, error } = await (await criarClienteServidor()).rpc("minhas_conexoes", { p_outro: outroId });
  if (error) {
    if (semMigracao(error)) return null;
    console.error(`Publike: falha ao ler a conexão: ${error.message}`);
    return undefined;
  }
  const linha = data?.[0];
  return linha ? lerConexao(linha) : null;
}

/** Como está a conexão com cada conta da lista (para os botões dos cartões). */
export async function estadosDeConexao(ids: string[]): Promise<Map<string, EstadoConexao>> {
  const validos = ids.filter((id) => UUID.test(id)).slice(0, 60);
  if (MODO_DEMO || !validos.length) return new Map();
  const { data, error } = await (await criarClienteServidor()).rpc("estado_conexoes", { p_outros: validos });
  if (error) {
    if (!semMigracao(error)) console.error(`Publike: falha ao ler o estado das conexões: ${error.message}`);
    return new Map();
  }
  return new Map(
    (data ?? []).map((e) => [e.outro_id, { id: e.conexao_id, status: lerStatusConexao(e.status), pedi: e.pedi }]),
  );
}
