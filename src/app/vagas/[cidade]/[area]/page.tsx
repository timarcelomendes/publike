import { notFound } from "next/navigation";
import { lerBusca, metadadosDaBusca, PaginaDeBusca } from "@/components/pagina-busca";
import { lerFuncao, metadadosDaFuncao, PaginaDeFuncao } from "@/components/pagina-funcao";
import { metadadosDosProgramas, PaginaDosProgramas } from "@/components/pagina-programas";
import { lerRecentes, metadadosDasRecentes, PaginaDasRecentes } from "@/components/pagina-recentes";
import { CATEGORIAS } from "@/lib/constantes";
import { areaDoSlug, CIDADES_PRINCIPAIS, SLUG_PROGRAMAS, SLUG_RECENTES, slugDaCidade } from "@/lib/paginas-busca";
import { paginasDeFuncao } from "@/lib/servidor/paginas-funcao";

// Página para o Google: uma área numa cidade (ex.: /vagas/goiania/limpeza) ou, no mesmo lugar, uma função
// (/vagas/goiania/frentista; claude/plano-vagas-por-funcao.md), ou as vagas novas (/vagas/goiania/ultimos-3-dias;
// claude/plano-vagas-dos-ultimos-3-dias.md), ou estágio e aprendiz (claude/plano-estagio-e-jovem-aprendiz.md). O nome
// decide: os dois nomes fixos, área, depois função.
// As páginas já montadas no build (17/11/2026, "deixe a performance invejável"): as áreas, as vagas novas e o estágio
// das cidades principais e as funções do sitemap (são a entrada do Google e dos anúncios). Montadas, saem prontas do
// cache, com o título e o texto no começo do HTML; as outras continuam abrindo na hora.
export async function generateStaticParams() {
  const fixas = CIDADES_PRINCIPAIS.flatMap((c) =>
    [...CATEGORIAS.map((a) => a.slug), SLUG_RECENTES, SLUG_PROGRAMAS].map((area) => ({ cidade: slugDaCidade(c), area })),
  );
  const funcoes = (await paginasDeFuncao().catch(() => [])).map((f) => ({
    cidade: slugDaCidade(f.cidade),
    area: f.funcao.slug,
  }));
  const vistas = new Set<string>();
  return [...fixas, ...funcoes].filter((p) => {
    const chave = `${p.cidade}/${p.area}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

export async function generateMetadata({ params }: PageProps<"/vagas/[cidade]/[area]">) {
  const { cidade, area } = await params;
  if (area === SLUG_RECENTES) return metadadosDasRecentes(lerRecentes(cidade));
  if (area === SLUG_PROGRAMAS) return metadadosDosProgramas(lerRecentes(cidade));
  if (areaDoSlug(area)) return metadadosDaBusca(lerBusca("vaga", cidade, area));
  const funcao = await lerFuncao(cidade, area);
  if (!funcao) notFound();
  return metadadosDaFuncao(funcao);
}

// Sem Suspense (17/11/2026): com o generateStaticParams, a página sai pronta do cache, com o título no começo do HTML
export default function Pagina({ params }: PageProps<"/vagas/[cidade]/[area]">) {
  return <AreaOuFuncao params={params} />;
}

async function AreaOuFuncao({ params }: { params: PageProps<"/vagas/[cidade]/[area]">["params"] }) {
  const { cidade, area } = await params;
  if (area === SLUG_RECENTES) return <PaginaDasRecentes cidade={lerRecentes(cidade)} />;
  if (area === SLUG_PROGRAMAS) return <PaginaDosProgramas cidade={lerRecentes(cidade)} />;
  if (areaDoSlug(area)) return <PaginaDeBusca {...lerBusca("vaga", cidade, area)} />;
  const funcao = await lerFuncao(cidade, area);
  if (!funcao) notFound();
  return <PaginaDeFuncao {...funcao} />;
}
