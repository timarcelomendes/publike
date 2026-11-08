import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { lerPedidos, TOKEN_CLIENTE, type Pedido } from "@/lib/pedidos-do-cliente";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// O cliente da agência pede a vaga e acompanha o prazo (migração 20270307120000): as leituras. Sem a migração, as
// funções devolvem null e as telas somem.

export type PortalDoCliente = {
  hoje: string;
  agencia: { nome: string; foto: string | null };
  cliente: { nome: string; cidade: string | null; bairro: string | null; endereco: string | null };
  pedidos: Pedido[];
};

const objeto = (x: unknown) => (x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null);
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** O que o link do cliente mostra. null: link que não vale (ou desligado). "erro": não deu para ler. */
export async function portalDoCliente(token: string): Promise<PortalDoCliente | null | "erro"> {
  if (MODO_DEMO || !TOKEN_CLIENTE.test(token)) return null;
  const { data, error } = await (await criarClienteServidor()).rpc("portal_do_cliente", { p_token: token });
  if (error) {
    if (error.code === "PGRST202") return null;
    console.error(`Publike: falha ao abrir o link do cliente: ${error.message}`);
    return "erro";
  }
  const o = objeto(data);
  const agencia = objeto(o?.agencia);
  const cliente = objeto(o?.cliente);
  if (!o || !agencia || !cliente) return null;
  return {
    hoje: typeof o.hoje === "string" ? o.hoje : new Date().toISOString().slice(0, 10),
    agencia: { nome: texto(agencia.nome) ?? "A agência", foto: texto(agencia.foto) },
    cliente: {
      nome: texto(cliente.nome) ?? "Cliente",
      cidade: texto(cliente.cidade),
      bairro: texto(cliente.bairro),
      endereco: texto(cliente.endereco),
    },
    pedidos: lerPedidos(o.pedidos),
  };
}

export type PedidosDaAgencia = {
  hoje: string;
  pedidos: Pedido[];
  /** por cliente, nos últimos 90 dias: dos pedidos com prazo que já venceram ou tiveram finalistas, quantos no prazo */
  noPrazo: Map<string, { noPrazo: number; total: number }>;
};

/** Os pedidos da agência logada (de um cliente, ou de todos). null: sem a migração ou não deu para ler. */
export async function pedidosDaAgencia(cliente?: string | null): Promise<PedidosDaAgencia | null> {
  if (MODO_DEMO) return null;
  const { data, error } = await (await criarClienteServidor()).rpc("pedidos_da_agencia", {
    p_cliente: cliente && UUID.test(cliente) ? cliente : null,
  });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler os pedidos dos clientes: ${error.message}`);
    return null;
  }
  const o = objeto(data);
  if (!o) return null;
  const noPrazo = new Map<string, { noPrazo: number; total: number }>();
  for (const [id, v] of Object.entries(objeto(o.no_prazo) ?? {})) {
    const x = objeto(v);
    if (x) noPrazo.set(id, { noPrazo: Number(x.no_prazo) || 0, total: Number(x.total) || 0 });
  }
  return {
    hoje: typeof o.hoje === "string" ? o.hoje : new Date().toISOString().slice(0, 10),
    pedidos: lerPedidos(o.pedidos),
    noPrazo,
  };
}

export type ResumoDosPedidos = { novos: number; perto: number; atrasados: number };

/** Os pedidos novos e os prazos perto ou vencidos, para o menu e o Hoje. null: sem a migração. */
export async function resumoDosPedidos(): Promise<ResumoDosPedidos | null> {
  if (MODO_DEMO) return null;
  const { data, error } = await (await criarClienteServidor()).rpc("resumo_dos_pedidos");
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler o resumo dos pedidos: ${error.message}`);
    return null;
  }
  const o = objeto(data);
  return o ? { novos: Number(o.novos) || 0, perto: Number(o.perto) || 0, atrasados: Number(o.atrasados) || 0 } : null;
}

export type LinkDoCliente = { token: string; ativo: boolean; aberto_em: string | null; aberturas: number };

export function lerLinkDoCliente(data: unknown): LinkDoCliente | null {
  const o = objeto(data);
  return o && typeof o.token === "string" && TOKEN_CLIENTE.test(o.token)
    ? { token: o.token, ativo: o.ativo !== false, aberto_em: texto(o.aberto_em), aberturas: Number(o.aberturas) || 0 }
    : null;
}

/** O link do cliente (cria na primeira vez). null: sem a migração ou não deu. */
export async function linkDoCliente(cliente: string): Promise<LinkDoCliente | null> {
  if (MODO_DEMO || !UUID.test(cliente)) return null;
  const { data, error } = await (await criarClienteServidor()).rpc("link_do_cliente", { p_cliente: cliente });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler o link do cliente: ${error.message}`);
    return null;
  }
  return lerLinkDoCliente(data);
}

/** Um pedido da agência logada, para o Publicar vir preenchido. */
export async function pedidoDaAgencia(id: string): Promise<Pedido | null> {
  if (!UUID.test(id)) return null;
  const r = await pedidosDaAgencia(null);
  return r?.pedidos.find((p) => p.id === id) ?? null;
}
