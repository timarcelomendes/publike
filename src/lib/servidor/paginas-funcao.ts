import "server-only";
import { cacheLife } from "next/cache";
import { MODO_DEMO } from "@/lib/config";
import {
  FUNCOES_DAS_PAGINAS,
  funcaoDaListaPeloCbo,
  funcaoDaListaPeloSlug,
  type FuncaoDaPagina,
} from "@/lib/funcoes-das-paginas";
import { cidadeDoSlug, slugDaCidade } from "@/lib/paginas-busca";
import { PRACAS } from "@/lib/pracas";
import { faixaDoBanco, regiaoDaCidade, type FaixaSalarial } from "@/lib/salarios";
import { criarClientePublico } from "@/lib/supabase/servidor";
import { anunciosNoAr, type AnuncioNoAr } from "./paginas-busca";

// As páginas de vaga por função e cidade (claude/plano-vagas-por-funcao.md): as vagas no ar com a função (a CBO que
// o site acha para cada vaga) e a faixa de salário do Novo Caged na região. Tudo público e guardado em cache. Só as
// funções da lista (src/lib/funcoes-das-paginas.ts) têm página.

/** A função de cada vaga no ar da praça (id → CBO), guardada como as vagas (15 minutos). */
export async function funcoesDasVagasDaPraca(cidade: string): Promise<Record<string, string>> {
  "use cache";
  cacheLife("default");
  if (MODO_DEMO) return {};
  const vagas = await anunciosNoAr("vaga", cidade);
  if (!vagas.length) return {};
  const { data, error } = await criarClientePublico().rpc("funcoes_das_vagas", { p_ids: vagas.map((v) => v.id) });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler a função das vagas:", error.message);
    return {};
  }
  return Object.fromEntries((data ?? []).filter((f) => f.cbo).map((f) => [f.anuncio_id, f.cbo as string]));
}

/** A faixa de salário da função na região da cidade (a da praça; sem dado nela, a de Goiás), ou null. */
export async function faixaDaFuncaoNaCidade(cbo: string, cidade: string): Promise<FaixaSalarial | null> {
  "use cache";
  // a faixa muda uma vez por mês (o robô do Caged)
  cacheLife("days");
  if (MODO_DEMO) return null;
  const { data, error } = await criarClientePublico().rpc("salario_da_funcao", {
    p_cbo: cbo,
    p_regiao: regiaoDaCidade(cidade) ?? "go",
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao ler a faixa de salário:", error.message);
    return null;
  }
  return data?.[0] ? faixaDoBanco(data[0]) : null;
}

/** A função do endereço (só as da lista têm página; o proxy responde 404 ao resto), ou null. */
export async function funcaoDoEndereco(slug: string): Promise<FuncaoDaPagina | null> {
  return funcaoDaListaPeloSlug(slug);
}

/** A função de uma vaga (para o "Mais vagas de frentista em Goiânia" da página da vaga), ou null. */
export async function funcaoDaVaga(anuncioId: string, cidade: string): Promise<FuncaoDaPagina | null> {
  return funcaoDaListaPeloCbo((await funcoesDasVagasDaPraca(cidade))[anuncioId]);
}

/** As vagas no ar da função na cidade, e a função de cada vaga da cidade (para as parecidas). */
export async function vagasDaFuncao(
  cbo: string,
  cidade: string,
): Promise<{
  vagas: AnuncioNoAr[];
  funcoesDaCidade: Map<string, number>;
}> {
  const [todas, funcoes] = await Promise.all([anunciosNoAr("vaga", cidade), funcoesDasVagasDaPraca(cidade)]);
  const daCidade = todas.filter((a) => a.cidade === cidade);
  const funcoesDaCidade = new Map<string, number>();
  for (const a of daCidade) {
    const c = funcoes[a.id];
    if (c) funcoesDaCidade.set(c, (funcoesDaCidade.get(c) ?? 0) + 1);
  }
  return { vagas: daCidade.filter((a) => funcoes[a.id] === cbo), funcoesDaCidade };
}

// Página só de salário (sem vaga no ar) entra no Google só na cidade que dá nome à praça: em Aparecida, Trindade ou
// Senador Canedo, a faixa é a mesma da região de Goiânia, e páginas iguais em cidades vizinhas o Google trata como
// repetidas. Lá, a página da função entra quando tem vaga.
const CIDADES_DO_SALARIO: string[] = PRACAS.map((p) => p.cidade);

/** A página vai para o Google: tem vaga no ar, ou é da lista, numa cidade de praça, com a faixa do Caged. */
export function paginaDaFuncaoIndexavel(
  funcao: FuncaoDaPagina,
  cidade: string,
  vagas: number,
  faixa: FaixaSalarial | null,
) {
  if (vagas > 0) return true;
  return Boolean(faixa) && funcaoDaListaPeloCbo(funcao.cbo) !== null && CIDADES_DO_SALARIO.includes(cidade);
}

/** As páginas de função para o sitemap: as com vaga no ar e as da lista com faixa nas cidades de praça. */
export async function paginasDeFuncao(): Promise<{ cidade: string; funcao: FuncaoDaPagina; vagas: number }[]> {
  const lista = new Map<string, { cidade: string; funcao: FuncaoDaPagina; vagas: number }>();
  for (const praca of PRACAS) {
    const [todas, funcoes] = await Promise.all([
      anunciosNoAr("vaga", praca.cidade),
      funcoesDasVagasDaPraca(praca.cidade),
    ]);
    for (const a of todas) {
      const cbo = funcoes[a.id];
      if (!cbo || !cidadeDoSlug(slugDaCidade(a.cidade))) continue;
      const funcao = funcaoDaListaPeloCbo(cbo);
      if (!funcao) continue;
      const chave = `${a.cidade}|${funcao.slug}`;
      const atual = lista.get(chave);
      lista.set(chave, { cidade: a.cidade, funcao, vagas: (atual?.vagas ?? 0) + 1 });
    }
  }
  for (const cidade of CIDADES_DO_SALARIO) {
    // aos poucos, para não abrir dezenas de consultas juntas (o banco é pequeno)
    for (let i = 0; i < FUNCOES_DAS_PAGINAS.length; i += 10) {
      const lote = FUNCOES_DAS_PAGINAS.slice(i, i + 10);
      const faixas = await Promise.all(lote.map((f) => faixaDaFuncaoNaCidade(f.cbo, cidade)));
      lote.forEach((f, j) => {
        const chave = `${cidade}|${f.slug}`;
        if (faixas[j] && !lista.has(chave)) lista.set(chave, { cidade, funcao: f, vagas: 0 });
      });
    }
  }
  return [...lista.values()];
}
