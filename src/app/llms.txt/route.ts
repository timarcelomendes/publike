import { connection } from "next/server";
import { SITE_URL } from "@/lib/config";
import { CATEGORIAS } from "@/lib/constantes";
import { caminhoDaBusca, CIDADES_PRINCIPAIS } from "@/lib/paginas-busca";
import { ONDE_FUNCIONA, PRACAS } from "@/lib/pracas";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";

// /llms.txt: o resumo do Publike para o ChatGPT e as outras IAs (como o robots.txt é para o Google). Em texto
// puro: o que é, onde funciona, que é grátis, como funciona, os números de hoje e os links das listas.

export async function GET() {
  await connection();
  const [vagas, servicos] = await Promise.all(
    (["vaga", "servico"] as const).map(async (tipo) =>
      (await Promise.all(PRACAS.map((p) => anunciosNoAr(tipo, p.cidade)))).flat(),
    ),
  );
  const link = (caminho: string) => `${SITE_URL}${caminho}`;
  const linhas: string[] = [
    "# Publike",
    "",
    `> Vagas de emprego e profissionais perto de casa em ${ONDE_FUNCIONA} (GO). Grátis para quem procura trabalho e para quem contrata: sem plano pago, sem taxa por candidato.`,
    "",
    "## Como funciona",
    "",
    "- Quem procura trabalho vê as vagas no mapa, com a distância e o tempo de ônibus de casa, e curte as que quer. Curtir é se candidatar.",
    "- Quem publicou vê quem curtiu (com o currículo, se a pessoa tiver) e aceita ou não. Aceitou, é match: o WhatsApp dos dois aparece e eles conversam direto.",
    "- Vagas com carteira assinada (CLT), estágio, temporárias, diárias e freelances, de empresas, comércios, agências e famílias.",
    "- Profissionais de serviço (pedreiro, diarista, eletricista...) mostram fotos dos trabalhos, preço e avaliações.",
    "- Vaga de verdade não cobra nada de quem se candidata. As contas que a equipe do Publike conferiu têm selo, e todo anúncio tem o botão de denunciar.",
    "",
    "## Hoje",
    "",
    `- ${vagas.length} vagas no ar e ${servicos.length} profissionais com vitrine em ${ONDE_FUNCIONA}.`,
    "",
    "## Vagas por cidade",
    "",
    ...CIDADES_PRINCIPAIS.map((c) => {
      const n = vagas.filter((a) => a.cidade === c).length;
      return `- [Vagas de emprego em ${c}](${link(caminhoDaBusca("vaga", c))})${n ? `: ${n} no ar` : ""}`;
    }),
    "",
    "## Vagas por área",
    "",
    ...PRACAS.flatMap((p) =>
      CATEGORIAS.filter((c) => c.slug !== "outros")
        .map((c) => ({ c, n: vagas.filter((a) => a.cidade === p.cidade && a.categoria === c.slug).length }))
        .filter(({ n }) => n > 0)
        .map(
          ({ c, n }) =>
            `- [Vagas de ${c.nome.toLowerCase()} em ${p.cidade}](${link(caminhoDaBusca("vaga", p.cidade, c.slug))}): ${n} no ar`,
        ),
    ),
    "",
    "## Mais",
    "",
    `- [Profissionais e serviços em ${PRACAS[0].cidade}](${link(caminhoDaBusca("servico", PRACAS[0].cidade))})`,
    `- [Como funciona](${link("/como-funciona")})`,
    `- [Por que é grátis](${link("/gratis")})`,
    `- [Para empresas](${link("/empresas")})`,
    `- [Dicas e direitos de quem trabalha](${link("/conteudos")})`,
    "",
  ];
  return new Response(linhas.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
