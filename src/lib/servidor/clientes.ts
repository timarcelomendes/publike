import "server-only";
import { paraVaga, type Cliente, type ClienteParaVaga, type NumerosDoCliente } from "@/lib/clientes";
import { MODO_DEMO } from "@/lib/config";
import { esperaResposta } from "@/lib/constantes";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";

// Leituras dos clientes da agência (só a própria agência lê: RLS).

const CAMPOS =
  "id, nome, cnpj, confidencial, cidade, bairro, cep, endereco, lat, lng, responsavel, telefone, email, nota, arquivado_em, criado_em, atualizado_em";

/** Os clientes da agência logada, pelo nome (os arquivados também). null: não deu para ler. */
export async function listarMeusClientes(): Promise<Cliente[] | null> {
  if (MODO_DEMO) return [];
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("clientes_agencia").select(CAMPOS).order("nome");
  if (error) {
    console.error(`Publike: falha ao ler os clientes: ${error.message}`);
    return null;
  }
  return data ?? [];
}

/** Um cliente da agência logada (null se não existe ou é de outra conta). */
export async function obterMeuCliente(id: string): Promise<Cliente | null> {
  if (MODO_DEMO || !UUID.test(id)) return null;
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from("clientes_agencia").select(CAMPOS).eq("id", id).maybeSingle();
  return data ?? null;
}

/**
 * Os clientes para o formulário da vaga: os da lista e, se pedido, um arquivado (o da vaga
 * que está sendo editada). null: sem a lista (o formulário fica só com o nome escrito à mão).
 */
export async function clientesParaVaga(incluir: string | null = null): Promise<ClienteParaVaga[] | null> {
  const todos = await listarMeusClientes();
  if (!todos) return null;
  return todos.filter((c) => !c.arquivado_em || c.id === incluir).map(paraVaga);
}

/** O cliente de uma vaga da agência logada (editar e "publicar parecida"). */
export async function clienteDaVaga(anuncioId: string): Promise<string | null> {
  if (MODO_DEMO || !UUID.test(anuncioId)) return null;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from("anuncios").select("cliente_id").eq("id", anuncioId).maybeSingle();
  return error ? null : (data?.cliente_id ?? null);
}

/** O cliente de uma vaga da agência logada, com o nome (a página da vaga no painel e o quadro). */
export async function clienteDaVagaComNome(anuncioId: string): Promise<{ id: string; nome: string } | null> {
  const id = await clienteDaVaga(anuncioId);
  const cliente = id ? await obterMeuCliente(id) : null;
  return cliente ? { id: cliente.id, nome: cliente.nome } : null;
}

/** O cliente de cada vaga da conta (só as vagas com cliente): id da vaga → id do cliente. */
export async function clientesDasVagas(autorId: string): Promise<Map<string, string>> {
  if (MODO_DEMO) return new Map();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("anuncios")
    .select("id, cliente_id")
    .eq("autor_id", autorId)
    .eq("tipo", "vaga")
    .not("cliente_id", "is", null);
  if (error) {
    console.error(`Publike: falha ao ler os clientes das vagas: ${error.message}`);
    return new Map();
  }
  return new Map((data ?? []).flatMap((a) => (a.cliente_id ? [[a.id, a.cliente_id] as const] : [])));
}

/** Para quem é a vaga da agência: o cliente (se tem), o nome que aparece e se é confidencial. */
export type EmpresaNaVaga = { cliente: string | null; contratante: string | null; confidencial: boolean };

/** A empresa de cada vaga da conta (Minhas vagas e a planilha de candidatos). */
export async function empresasDasVagas(autorId: string): Promise<Map<string, EmpresaNaVaga>> {
  if (MODO_DEMO) return new Map();
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from("anuncios")
    .select("id, cliente_id, contratante, contratante_confidencial")
    .eq("autor_id", autorId)
    .eq("tipo", "vaga");
  if (error) {
    console.error(`Publike: falha ao ler as empresas das vagas: ${error.message}`);
    return new Map();
  }
  return new Map(
    (data ?? []).map((a) => [
      a.id,
      { cliente: a.cliente_id, contratante: a.contratante, confidencial: a.contratante_confidencial },
    ]),
  );
}

/** Os números de cada cliente: vagas, no ar, candidatos, para responder e contratados. */
export function numerosDosClientes(
  clienteDe: Map<string, string>,
  vagas: { id: string; status: string; expira_em: string }[],
  candidatos: { anuncio_id: string; status: string; etapa: string; aceita_em?: string | null }[] | null,
  agora: number,
): Map<string, NumerosDoCliente> {
  const numeros = new Map<string, NumerosDoCliente>();
  const de = (cliente: string) => {
    let n = numeros.get(cliente);
    if (!n) {
      n = { vagas: 0, noAr: 0, candidatos: 0, responder: 0, contratados: 0 };
      numeros.set(cliente, n);
    }
    return n;
  };
  for (const v of vagas) {
    const cliente = clienteDe.get(v.id);
    if (!cliente) continue;
    const n = de(cliente);
    n.vagas++;
    if (v.status === "ativo" && new Date(v.expira_em).getTime() > agora) n.noAr++;
  }
  for (const c of candidatos ?? []) {
    const cliente = clienteDe.get(c.anuncio_id);
    if (!cliente) continue;
    const n = de(cliente);
    n.candidatos++;
    if (esperaResposta(c)) n.responder++;
    if (c.etapa === "contratado" && c.status === "match") n.contratados++;
  }
  return numeros;
}
