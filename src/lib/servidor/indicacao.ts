import "server-only";
import { cookies } from "next/headers";
import { COOKIE_INDICACAO, lerCookieDeIndicacao } from "@/lib/indicacao";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// A indicação (migração 20270311120000; src/lib/indicacao.ts). Sem a migração, tudo devolve vazio.

type Cliente = Awaited<ReturnType<typeof criarClienteServidor>>;

/** Depois de curtir: grava quem indicou, se a pessoa chegou por um link de indicação da mesma empresa. */
export async function registrarIndicacaoDaCurtida(supabase: Cliente, anuncioId: string) {
  const lido = lerCookieDeIndicacao((await cookies()).get(COOKIE_INDICACAO)?.value);
  if (!lido) return;
  const { error } = await supabase.rpc("registrar_indicacao", {
    p_anuncio: anuncioId,
    p_codigo: lido.codigo,
    p_origem: lido.origem,
  });
  if (error && error.code !== "PGRST202") console.error(`Publike: falha ao gravar a indicação: ${error.message}`);
}

export type LinkDeIndicacao = {
  id: string;
  nome: string;
  codigo: string;
  dePessoa: boolean;
  indicados: number;
  contratados: number;
};

/** Os links de indicação de uma vaga da conta. null: sem a migração. */
export async function linksDeIndicacaoDaVaga(anuncioId: string): Promise<LinkDeIndicacao[] | null> {
  const { data, error } = await (await criarClienteServidor()).rpc("links_indicacao_da_vaga", { p_anuncio: anuncioId });
  if (error) return null;
  return (data ?? []).map((l) => ({
    id: l.id,
    nome: l.nome,
    codigo: l.codigo,
    dePessoa: l.de_pessoa,
    indicados: Number(l.indicados),
    contratados: Number(l.contratados),
  }));
}

/** Quem indicou cada candidato da vaga (perfil → nome de quem indicou). */
export async function indicacoesDaVaga(anuncioId: string): Promise<Map<string, string>> {
  const { data, error } = await (await criarClienteServidor()).rpc("indicacoes_da_vaga", { p_anuncio: anuncioId });
  if (error || !data) return new Map();
  return new Map(data.map((l) => [l.perfil_id, l.indicado_por]));
}

/** Para o Hoje: quantos indicados (e contratados por indicação) cada vaga tem. */
export async function indicadosDasVagas(anuncios: string[]): Promise<Map<string, { indicados: number; contratados: number }>> {
  if (!anuncios.length) return new Map();
  const { data, error } = await (await criarClienteServidor()).rpc("indicados_das_vagas", {
    p_anuncios: anuncios.slice(0, 200),
  });
  if (error || !data) return new Map();
  return new Map(
    data.map((l) => [l.anuncio_id, { indicados: Number(l.indicados), contratados: Number(l.contratados) }]),
  );
}
