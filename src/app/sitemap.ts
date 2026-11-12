import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { MODO_DEMO, SITE_URL } from "@/lib/config";
import { CATEGORIAS } from "@/lib/constantes";
import { CONTEUDOS } from "@/lib/conteudos";
import { noticiasPublicadas } from "@/lib/servidor/noticias";
import {
  caminhoDaBusca,
  caminhoDasRecentes,
  caminhoDosProgramas,
  caminhoDoBairro,
  cidadeDoSlug,
  CIDADES_PRINCIPAIS,
  REGIMES_PROGRAMAS,
  slugDaCidade,
} from "@/lib/paginas-busca";
import { cidadeDePraca, PRACAS } from "@/lib/pracas";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { paginasDeFuncao } from "@/lib/servidor/paginas-funcao";
import { caminhoDaFuncao } from "@/lib/funcoes-das-paginas";
import { CASOS_RESCISAO } from "@/lib/rescisao-casos";
import { criarClientePublico } from "@/lib/supabase/servidor";
import type { TipoAnuncio } from "@/lib/tipos";

/** Páginas de busca por cidade e área: as cidades principais sempre; o resto, se tiver anúncio. */
async function paginasDeBusca(): Promise<MetadataRoute.Sitemap> {
  const lista: MetadataRoute.Sitemap = [];
  for (const tipo of ["vaga", "servico"] as TipoAnuncio[]) {
    // os anúncios de todas as praças
    const anuncios = (await Promise.all(PRACAS.map((p) => anunciosNoAr(tipo, p.cidade)))).flat();
    const cidades = new Set(CIDADES_PRINCIPAIS);
    for (const a of anuncios) if (cidadeDoSlug(slugDaCidade(a.cidade))) cidades.add(a.cidade);
    for (const cidade of cidades) {
      const daCidade = anuncios.filter((a) => a.cidade === cidade);
      lista.push({
        url: `${SITE_URL}${caminhoDaBusca(tipo, cidade)}`,
        changeFrequency: "hourly",
        priority: cidadeDePraca(cidade) ? 0.9 : 0.8,
      });
      // as vagas novas da cidade (/vagas/goiania/ultimos-3-dias), nas cidades principais
      if (tipo === "vaga" && CIDADES_PRINCIPAIS.includes(cidade)) {
        lista.push({ url: `${SITE_URL}${caminhoDasRecentes(cidade)}`, changeFrequency: "daily", priority: 0.7 });
      }
      // estágio e jovem aprendiz: Goiânia sempre (o conteúdo se sustenta); as outras, com vaga assim no ar
      const temPrograma = daCidade.some((a) => REGIMES_PROGRAMAS.includes(a.regime ?? ""));
      if (tipo === "vaga" && (cidade === "Goiânia" || temPrograma)) {
        lista.push({ url: `${SITE_URL}${caminhoDosProgramas(cidade)}`, changeFrequency: "daily", priority: 0.6 });
      }
      // os bairros com vaga no ar (só vagas: /vagas/goiania/bairro/setor-bueno)
      if (tipo === "vaga") {
        const bairros = new Set(
          daCidade.filter((a) => a.bairro && a.bairro !== cidade).map((a) => slugDaCidade(a.bairro as string)),
        );
        for (const slug of bairros) {
          const b = daCidade.find((a) => a.bairro && slugDaCidade(a.bairro) === slug)?.bairro as string;
          lista.push({ url: `${SITE_URL}${caminhoDoBairro(cidade, b)}`, changeFrequency: "daily", priority: 0.6 });
        }
      }
      for (const c of CATEGORIAS) {
        if (c.slug === "outros" || !daCidade.some((a) => a.categoria === c.slug)) continue;
        lista.push({
          url: `${SITE_URL}${caminhoDaBusca(tipo, cidade, c.slug)}`,
          changeFrequency: "daily",
          priority: 0.7,
        });
      }
    }
  }
  return lista;
}

/**
 * As páginas de quem contrata (empresa ou comércio, nunca pessoa física) com vaga no ar: o perfil e "Vagas de …", que
 * respondem a quem procura "vagas na <empresa>". O perfil de pessoa fica fora do sitemap.
 */
async function paginasDasEmpresas(
  anuncios: { autor_id: string; tipo: string; atualizado_em: string }[],
): Promise<MetadataRoute.Sitemap> {
  const ultima = new Map<string, string>();
  for (const a of anuncios) {
    if (a.tipo !== "vaga") continue;
    if (!ultima.has(a.autor_id) || (ultima.get(a.autor_id) as string) < a.atualizado_em) ultima.set(a.autor_id, a.atualizado_em);
  }
  const ids = [...ultima.keys()];
  const empresas = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await criarClientePublico()
      .from("perfis")
      .select("id, tipo")
      .in("id", ids.slice(i, i + 200))
      .neq("tipo", "pessoa");
    for (const p of data ?? []) empresas.add(p.id);
  }
  return [...empresas].flatMap((id) => {
    const lastModified = new Date(ultima.get(id) as string).toISOString();
    return [
      { url: `${SITE_URL}/perfil/${id}/vagas`, lastModified, changeFrequency: "daily" as const, priority: 0.6 },
      { url: `${SITE_URL}/perfil/${id}`, lastModified, changeFrequency: "weekly" as const, priority: 0.4 },
    ];
  });
}

// Lista as páginas para o Google, incluindo os anúncios no ar.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const paginas: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/descobrir`, changeFrequency: "hourly", priority: 0.7 },
    { url: `${SITE_URL}/como-funciona`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/missao`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/gratis`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/empresas`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/empresas/fim-da-6x1`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/profissionais`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/privacidade`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/cookies`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/regras`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/conteudos`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/curriculo-simples`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/seguro-desemprego`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/calculadora-rescisao`, changeFrequency: "monthly", priority: 0.7 },
    ...CASOS_RESCISAO.map((c) => ({
      url: `${SITE_URL}/calculadora-rescisao/${c.slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    { url: `${SITE_URL}/noticias`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/novidades`, changeFrequency: "weekly", priority: 0.4 },
    { url: `${SITE_URL}/ajuda`, changeFrequency: "monthly", priority: 0.4 },
    ...CONTEUDOS.map((c) => ({
      url: `${SITE_URL}/conteudos/${c.slug}`,
      lastModified: c.publicado,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
  if (MODO_DEMO) return paginas;

  const { data } = await criarClientePublico()
    .from("anuncios")
    .select("id, atualizado_em, autor_id, tipo")
    .eq("status", "ativo")
    .gt("expira_em", new Date().toISOString())
    .order("criado_em", { ascending: false })
    .limit(5000);

  return [
    ...paginas,
    ...(await paginasDeBusca()),
    ...(await paginasDasEmpresas(data ?? [])),
    // as vagas por função e cidade: com vaga no ar, ou só com o salário nas cidades de praça
    ...(await paginasDeFuncao().catch(() => [])).map((f) => ({
      url: `${SITE_URL}${caminhoDaFuncao(f.cidade, f.funcao.slug)}`,
      changeFrequency: "daily" as const,
      priority: f.vagas > 0 ? 0.7 : 0.5,
    })),
    ...(await noticiasPublicadas(500)).map((n) => ({
      url: `${SITE_URL}/noticias/${n.slug}`,
      lastModified: n.publicar_em ? new Date(n.publicar_em).toISOString() : undefined,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...(data ?? []).map((a) => ({
      url: `${SITE_URL}/anuncio/${a.id}`,
      // data no formato curto e padrão (o Google lê melhor que microssegundos com fuso)
      lastModified: new Date(a.atualizado_em).toISOString(),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
