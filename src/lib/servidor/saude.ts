import "server-only";
import { esperaResposta } from "@/lib/constantes";
import { nomeDaRegiao, regiaoDaCidade } from "@/lib/salarios";
import { saudeDaVaga, type MercadoDaVaga, type Saude } from "@/lib/saude-vaga";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { AnuncioCompleto } from "@/lib/tipos";
import { obterTriagens } from "./triagem";

type Curtida = { anuncio_id: string; status: string; aceita_em?: string | null; curtido_em: string };

/** A saúde de cada vaga minha, por id (Hoje e o quadro da vaga). */
export async function saudeDasVagas(
  vagas: AnuncioCompleto[],
  candidatos: Curtida[],
  agora: number,
): Promise<Map<string, Saude>> {
  const ids = vagas.map((v) => v.id);
  if (!ids.length) return new Map();
  const supabase = await criarClienteServidor();
  const [{ data: visitas }, triagens, mercados] = await Promise.all([
    supabase.from("anuncio_visitas").select("anuncio_id, total").in("anuncio_id", ids),
    obterTriagens(ids),
    mercadoDasVagas(supabase, vagas),
  ]);
  const visitasDe = new Map((visitas ?? []).map((v) => [v.anuncio_id, v.total]));
  return new Map(
    vagas.map((v) => {
      const daVaga = candidatos.filter((c) => c.anuncio_id === v.id);
      const esperandoMuito = daVaga.filter(
        (c) =>
          esperaResposta({ status: c.status, aceita_em: c.aceita_em ?? null }) &&
          agora - new Date(c.curtido_em).getTime() > 2 * 24 * 3600e3,
      ).length;
      return [
        v.id,
        saudeDaVaga(
          v,
          { visitas: visitasDe.get(v.id) ?? 0, candidatos: daVaga.length, esperandoMuito },
          triagens.get(v.id) ?? {},
          agora,
          mercados.get(v.id) ?? null,
        ),
      ];
    }),
  );
}

/**
 * A faixa do mercado de cada vaga (pela função guardada e a região da cidade: claude/plano-salario-e-curriculo.md,
 * parte 3). Sem a migração 20270131120000 ou sem a função, a vaga fica sem (a Saúde segue como antes).
 */
async function mercadoDasVagas(
  supabase: Awaited<ReturnType<typeof criarClienteServidor>>,
  vagas: AnuncioCompleto[],
): Promise<Map<string, MercadoDaVaga>> {
  const resultado = new Map<string, MercadoDaVaga>();
  const { data: funcoes, error } = await supabase.rpc("funcoes_das_vagas", { p_ids: vagas.map((v) => v.id) });
  if (error || !funcoes?.length) return resultado;
  const cboDe = new Map(funcoes.map((f) => [f.anuncio_id, f.cbo]));
  // uma consulta por função e região (as vagas de uma conta repetem bastante)
  const pedidos = new Map<string, Promise<MercadoDaVaga | null>>();
  for (const v of vagas) {
    const cbo = cboDe.get(v.id);
    const regiao = regiaoDaCidade(v.cidade);
    if (!cbo || !regiao) continue;
    const chave = `${cbo}|${regiao}`;
    if (!pedidos.has(chave))
      pedidos.set(
        chave,
        Promise.resolve(supabase.rpc("salario_da_funcao", { p_cbo: cbo, p_regiao: regiao })).then(({ data }) => {
          const f = data?.[0];
          return f ? { p25: Number(f.p25), p75: Number(f.p75), regiao: nomeDaRegiao(f.regiao as "go") } : null;
        }),
      );
  }
  for (const v of vagas) {
    const cbo = cboDe.get(v.id);
    const regiao = regiaoDaCidade(v.cidade);
    const m = cbo && regiao ? await pedidos.get(`${cbo}|${regiao}`) : null;
    if (m) resultado.set(v.id, m);
  }
  return resultado;
}
