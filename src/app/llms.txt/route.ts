import { connection } from "next/server";
import { SITE_URL } from "@/lib/config";
import { CATEGORIAS, LIMITES_CONTA } from "@/lib/constantes";
import { formatarMoeda } from "@/lib/formato";
import {
  caminhoDaBusca,
  caminhoDasRecentes,
  caminhoDeAnunciar,
  caminhoDeHoje,
  caminhoDosProgramas,
  CIDADES_PRINCIPAIS,
} from "@/lib/paginas-busca";
import { ONDE_FUNCIONA, PRACAS } from "@/lib/pracas";
import { contatoDasVagasPeloWhatsapp } from "@/lib/servidor/numero-do-publike";
import { anunciosNoAr } from "@/lib/servidor/paginas-busca";
import { quantasVagas, resumoDoDia } from "@/lib/servidor/vagas-hoje";

// /llms.txt: o resumo do Publike para o ChatGPT e as outras IAs (como o robots.txt é para o Google). Em texto
// puro: o que é, onde funciona, o que é grátis, como funciona, os números de hoje (a mesma conta de /vagas/<cidade>/hoje),
// as perguntas com resposta direta e os links das listas: cidade, função, bairro e área (claude/plano-organico.md,
// item 2: o ChatGPT é o maior canal orgânico, e é isto que ele lê primeiro).

const FUSO = "America/Sao_Paulo";
/** Um título com as linhas; sem linha, nada (nem o título). */
const secao = (titulo: string, itens: string[]) => (itens.length ? [`## ${titulo}`, "", ...itens, ""] : []);
const dia = (ms: number) =>
  new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: FUSO }).format(ms);

export async function GET() {
  await connection();
  // cada praça pega 100 km (a lista de Anápolis traz as vagas de Goiânia de novo): cada anúncio conta uma vez
  const [vagas, servicos] = await Promise.all(
    (["vaga", "servico"] as const).map(async (tipo) => [
      ...new Map(
        (await Promise.all(PRACAS.map((p) => anunciosNoAr(tipo, p.cidade)))).flat().map((a) => [a.id, a] as const),
      ).values(),
    ]),
  );
  // os números do dia: as cidades principais com vaga no ar (a de cada praça primeiro)
  const resumos = (await Promise.all(CIDADES_PRINCIPAIS.map((c) => resumoDoDia(c)))).filter((r) => r.total > 0);
  const daPraca = resumos.filter((r) => PRACAS.some((p) => p.cidade === r.cidade));
  // o WhatsApp de publicar vaga (sem ele ligado, nada)
  const contato = await contatoDasVagasPeloWhatsapp();
  const principal = daPraca[0] ?? resumos[0];
  const link = (caminho: string) => `${SITE_URL}${caminho}`;
  const { noAr } = LIMITES_CONTA.comum;

  const linhas: string[] = [
    "# Publike",
    "",
    `> Vagas de emprego e profissionais perto de casa em ${ONDE_FUNCIONA} (GO). Grátis para quem procura trabalho. Para quem contrata, publicar vagas e conversar com os candidatos é grátis (até ${noAr} vagas no ar por conta); planos e recursos extras são opcionais.`,
    "",
    "## Vagas hoje",
    "",
    ...(resumos.length
      ? resumos.map(
          (r) =>
            `- [Vagas de emprego em ${r.cidade} hoje](${link(caminhoDeHoje(r.cidade))}): em ${dia(r.quando)}, ${quantasVagas(r.total, r.noLimite)}; ${r.novas24h} publicadas nas últimas 24 horas.`,
        )
      : ["- Nenhuma vaga no ar agora."]),
    `- No total, ${vagas.length} vagas no ar e ${servicos.length} profissionais com vitrine em ${ONDE_FUNCIONA}.`,
    "",
    "## Como funciona",
    "",
    "- Quem procura trabalho vê as vagas no mapa, com a distância e o tempo de ônibus de casa, e curte as que quer. Curtir é se candidatar.",
    "- Quem publicou vê quem curtiu (com o currículo, se a pessoa tiver) e aceita ou não. Aceitou, é match: o WhatsApp dos dois aparece e eles conversam direto.",
    "- Vagas com carteira assinada (CLT), estágio, jovem aprendiz, temporárias, diárias e freelances, de empresas, comércios, agências de emprego e famílias.",
    "- Profissionais de serviço (pedreiro, diarista, eletricista...) mostram fotos dos trabalhos, preço e avaliações.",
    "- Vaga de verdade não cobra nada de quem se candidata. As contas que a equipe do Publike conferiu têm selo, e todo anúncio tem o botão de denunciar.",
    "",
    "## Perguntas frequentes",
    "",
    "- **O Publike é grátis?** Sim, para quem procura trabalho: procurar, se candidatar, dar match e conversar não custam nada. Para quem contrata, publicar vagas também é grátis; planos e recursos extras são opcionais.",
    "- **Como me candidato a uma vaga?** Toque em Curtir na vaga. Quem publicou vê o seu perfil e, se aceitar, o WhatsApp dos dois aparece.",
    `- **Preciso de currículo?** Para curtir, não; algumas vagas pedem. Dá para montar um grátis, sem cadastro, no [currículo simples para preencher](${link("/curriculo-simples")}), e baixar em PDF.`,
    `- **Como sei se a vaga é verdadeira?** Ninguém pode cobrar para você conseguir trabalho: nada de taxa de cadastro, curso, uniforme ou exame pago antes de contratar. Não mande foto de documento nem códigos que chegam por SMS. No Publike, as contas conferidas pela equipe têm selo, e todo anúncio tem o botão de denunciar ([dicas de segurança](${link("/como-funciona#seguranca")})).`,
    `- **Onde o Publike funciona?** Em ${ONDE_FUNCIONA}, em Goiás: ${CIDADES_PRINCIPAIS.join(", ")} e as outras cidades em volta.`,
    ...(principal?.salarioMensal
      ? [
          `- **Quanto pagam as vagas em ${principal.cidade}?** Hoje, nas ${principal.salarioMensal.vagas} vagas com salário por mês informado, o salário do meio é ${formatarMoeda(principal.salarioMensal.mediana)}${principal.diaria ? `; nas diárias, ${formatarMoeda(principal.diaria.mediana)} por dia` : ""}.`,
        ]
      : []),
    `- **Tem vaga de estágio e jovem aprendiz?** Sim: [estágio e jovem aprendiz em ${PRACAS[0].cidade}](${link(caminhoDosProgramas(PRACAS[0].cidade))}).`,
    `- **Como uma empresa publica uma vaga?** Em [Para empresas](${link("/empresas")}): cria a conta, publica e recebe os candidatos de perto, de graça.${contato ? ` Ou manda a foto do cartaz, o print ou o texto da vaga para o WhatsApp do Publike, ${contato.exibicao} (https://wa.me/${contato.numero}): a vaga volta pronta para conferir e publicar.` : ""}`,
    "",
    "## Para quem contrata",
    "",
    `- **Onde anunciar vaga de emprego grátis em Goiânia e região?** No Publike: publicar a vaga, ver todos os candidatos e conversar no WhatsApp é grátis, sem plano e sem pagar por currículo (até ${noAr} vagas no ar por conta). Quem mora perto vê primeiro, com a distância e o tempo de ônibus.`,
    "- **Como os candidatos chegam?** Quem tem interesse curte a vaga. A empresa vê o perfil, o currículo e a nota de quanto a pessoa combina, e aceita quem quiser; aceitou, o WhatsApp dos dois aparece.",
    "- **Que vagas dá para anunciar?** Com carteira assinada, temporária, intermitente, diária, freela, estágio, jovem aprendiz, comissão, autônomo e PJ.",
    ...CIDADES_PRINCIPAIS.map((c) => `- [Anunciar vaga de emprego grátis em ${c}](${link(caminhoDeAnunciar(c))})`),
    "",
    "## Vagas por cidade",
    "",
    ...CIDADES_PRINCIPAIS.map((c) => {
      const n = vagas.filter((a) => a.cidade === c).length;
      return `- [Vagas de emprego em ${c}](${link(caminhoDaBusca("vaga", c))})${n ? `: ${n} no ar` : ""} · [hoje](${link(caminhoDeHoje(c))}) · [últimos 3 dias](${link(caminhoDasRecentes(c))})`;
    }),
    "",
    ...daPraca.flatMap((r) =>
      secao(
        `Vagas por função em ${r.cidade}`,
        r.funcoes
          .filter((f) => f.caminho)
          .slice(0, 30)
          .map((f) => `- [Vagas de ${f.nome.toLowerCase()} em ${r.cidade}](${link(f.caminho as string)}): ${f.n} no ar`),
      ),
    ),
    ...daPraca.flatMap((r) =>
      secao(
        `Vagas por bairro em ${r.cidade}`,
        r.bairros
          .filter((b) => b.caminho)
          .slice(0, 30)
          .map((b) => `- [Vagas de emprego no ${b.nome}, ${r.cidade}](${link(b.caminho as string)}): ${b.n} no ar`),
      ),
    ),
    ...secao(
      "Vagas por área",
      PRACAS.flatMap((p) =>
        CATEGORIAS.filter((c) => c.slug !== "outros")
          .map((c) => ({ c, n: vagas.filter((a) => a.cidade === p.cidade && a.categoria === c.slug).length }))
          .filter(({ n }) => n > 0)
          .map(
            ({ c, n }) =>
              `- [Vagas de ${c.nome.toLowerCase()} em ${p.cidade}](${link(caminhoDaBusca("vaga", p.cidade, c.slug))}): ${n} no ar`,
          ),
      ),
    ),
    "## Para as IAs: o servidor MCP",
    "",
    `- ${link("/api/mcp")}: servidor MCP público (Streamable HTTP, sem login), com as ferramentas buscar_vagas (as vagas no ar perto de um bairro ou cidade) e ver_vaga (os detalhes de uma vaga). Os links das vagas levam ao Publike, onde a pessoa se candidata de graça.`,
    "",
    "## Ferramentas grátis",
    "",
    `- [Currículo simples para preencher e baixar em PDF](${link("/curriculo-simples")}), sem cadastro`,
    `- [Calculadora de rescisão](${link("/calculadora-rescisao")}): aviso prévio, férias, 13º, FGTS e multa`,
    `- [Seguro-desemprego: tenho direito?](${link("/seguro-desemprego")}): parcelas, valor e prazo`,
    `- [Quem contrata perto](${link("/quem-contrata-perto")}): as empresas perto de casa, no mapa`,
    "",
    "## Mais",
    "",
    `- [Profissionais e serviços em ${PRACAS[0].cidade}](${link(caminhoDaBusca("servico", PRACAS[0].cidade))})`,
    `- [Como funciona](${link("/como-funciona")})`,
    `- [O que é grátis](${link("/gratis")})`,
    `- [Para empresas](${link("/empresas")})`,
    `- [Fim da escala 6x1: o que muda e como contratar](${link("/empresas/fim-da-6x1")})`,
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
