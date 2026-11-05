import "server-only";
import { randomBytes } from "node:crypto";
import { chamarIA, ErroIA, iaConfigurada, lerJson } from "@/lib/ia/openai";
import { LISTA_TEMAS_NOTICIA, normalizarUrl, slugDaNoticia, type TemaNoticia } from "@/lib/noticias";
import { acessoFila } from "./filas";
import { buscarFoto, fotosConfiguradas } from "./fotos-noticias";

// As notícias são da praça principal (Goiânia e região, com as fontes de Goiás). Com outra praça,
// a busca roda uma vez para cada uma, com as cidades e as fontes de lá.
// A IA procura notícias sobre trabalho no Brasil e em Goiânia e região e escreve um resumo
// curto de cada uma. Tudo entra como rascunho: só vai para o site quando o
// admin aprova. Roda pelo agendamento do servidor (/api/noticias/buscar) ou
// pelo botão "Buscar agora" do admin.

/** Intervalo mínimo entre duas buscas automáticas. */
const INTERVALO_MIN = 3 * 3600e3;

type ItemIA = {
  titulo: string;
  resumo: string;
  corpo: string;
  pratico: string;
  tema: TemaNoticia;
  cidade: string;
  fonte_nome: string;
  fonte_url: string;
  fonte_data: string;
  /** o que buscar nas fotos livres (Openverse), em inglês */
  foto_busca: string;
};

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["noticias"],
  properties: {
    noticias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "titulo",
          "resumo",
          "corpo",
          "pratico",
          "tema",
          "cidade",
          "fonte_nome",
          "fonte_url",
          "fonte_data",
          "foto_busca",
        ],
        properties: {
          titulo: { type: "string" },
          resumo: { type: "string" },
          corpo: { type: "string" },
          pratico: { type: "string" },
          tema: { type: "string", enum: LISTA_TEMAS_NOTICIA },
          cidade: { type: "string" },
          fonte_nome: { type: "string" },
          fonte_url: { type: "string" },
          fonte_data: { type: "string" },
          foto_busca: { type: "string" },
        },
      },
    },
  },
};

function hojeEmBrasilia(agora: number) {
  return new Date(agora - 3 * 3600e3).toISOString().slice(0, 10);
}

function instrucoes(hoje: string) {
  const ano = hoje.slice(0, 4);
  return `Você é o editor de notícias do Publike, um site grátis de vagas e serviços de Goiânia e região (Goiás) para quem procura trabalho, presta serviço ou contrata. Hoje é ${hoje}.

Procure na internet notícias publicadas nos últimos 7 dias sobre emprego, mão de obra, leis do trabalho e oportunidades. Vale o Brasil todo: o que muda a vida de quem trabalha ou contrata em qualquer lugar do país (leis, salário mínimo, benefícios, números do emprego, concursos nacionais, programas do governo) é tão importante quanto as notícias de Goiás. As de Goiânia, da região metropolitana (Aparecida de Goiânia, Senador Canedo, Trindade, Goianira, Anápolis e vizinhas) e de Goiás entram quando houver.

Faça várias buscas diferentes, uma por assunto, por exemplo:
- "Caged emprego ${ano}", "desemprego IBGE Pnad", "mercado de trabalho Brasil";
- "projeto de lei trabalhista", "fim da escala 6x1", "jornada de trabalho Câmara Senado", "CLT mudança";
- "salário mínimo ${Number(ano) + 1}", "reajuste piso categoria", "FGTS saque", "seguro-desemprego", "INSS trabalhador";
- "concurso público inscrições abertas", "processo seletivo inscrições";
- "cursos gratuitos qualificação profissional", "jovem aprendiz", "programa primeiro emprego", "Pé-de-Meia";
- "MEI ${ano}", "trabalho por aplicativo regulamentação", "crédito pequeno negócio";
- "feirão de emprego Goiânia", "vagas Sine Goiás", "empresa vai contratar Goiás".

Vale qualquer notícia desse assunto:
- vagas e contratações: feirões e mutirões de emprego, Sine, empresas que vão abrir, ampliar ou contratar muita gente, contratações de fim de ano;
- leis e direitos: projetos e leis que mudam a CLT, a jornada, a escala de trabalho, FGTS, seguro-desemprego, férias, 13º, INSS, aposentadoria, trabalho por aplicativo; decisões da Justiça do Trabalho que valem para muita gente;
- salários e renda: salário mínimo, pisos e reajustes de categorias, renda média;
- números do emprego e da economia (Caged, IBGE, desemprego, informalidade) e dos setores que mais empregam (comércio, serviços, construção, indústria, agronegócio);
- demissões, fechamento de empresas, greves e acordos de categorias, com o que muda para o trabalhador;
- falta de mão de obra e profissões em alta;
- trabalho por conta própria: MEI, autônomos, aplicativos, crédito e apoio para pequeno negócio;
- qualificação: cursos gratuitos (Senai, Senac, Sebrae, institutos federais, governos), jovem aprendiz, estágio, primeiro emprego;
- concursos e processos seletivos com inscrições abertas (nacionais ou de Goiás);
- inclusão no trabalho: mulheres, pessoas com deficiência, pessoas acima de 50 anos, jovens;
- tecnologia e mudanças no jeito de trabalhar (inteligência artificial, trabalho remoto) quando afetam empregos de verdade.

Regras:
- Só notícias reais que você abriu nesta busca. "fonte_url" é o endereço exato da matéria, nunca a página inicial do site.
- Fontes boas: as oficiais (gov.br, Ministério do Trabalho, Agência Brasil, Agência Senado, Agência Câmara, TST, IBGE, goias.gov.br, goiania.go.gov.br) e os jornais grandes (g1, Folha, Estadão, O Globo, UOL, CNN Brasil, Valor, InfoMoney, Exame, O Popular, Jornal Opção, Mais Goiás). Para lei e benefício, prefira a fonte oficial ou um jornal grande; nunca blog ou site de "dicas".
- Projeto de lei não é lei: diga em que pé está (proposto, aprovado na Câmara, no Senado, sancionado) e não diga que já vale.
- Escreva com as suas palavras, sem copiar frases da matéria. Linguagem simples, frases curtas, sem gíria, para quem lê no celular.
- Não invente data, valor, endereço, horário nem requisito: se a matéria não diz, não diga.
- "titulo": até 100 caracteres, direto ("Feirão oferece 800 vagas em Aparecida neste sábado").
- "resumo": uma ou duas frases (até 250 caracteres).
- "corpo": dois a quatro parágrafos curtos, separados por uma linha em branco, com o que muda, para quem, quando e o que fazer.
- "pratico": uma frase com o que a pessoa faz com isso ("Leve RG, CPF e carteira de trabalho."). Vazio se não houver.
- "cidade": a cidade da notícia ou "" se for de Goiás ou do Brasil todo.
- "tema": vagas (vagas, feirões, contratações), cursos, concursos, direitos (leis, benefícios, salário mínimo), eventos, ou mercado (números, economia, setores, demissões, greves, tecnologia e o resto).
- "fonte_data": a data da matéria no formato AAAA-MM-DD, ou "" se não souber.
- "foto_busca": duas a quatro palavras em inglês para achar uma foto real que combine com o assunto, como numa notícia de jornal ("construction workers", "job fair crowd", "students classroom"). Sem nome de pessoa, de empresa ou de lugar.
- De 4 a 8 notícias, das mais úteis para as menos, misturando os assuntos. Uma notícia nova sobre um assunto que já está na lista vale quando traz um fato novo (o projeto foi votado, saiu o resultado, abriu a inscrição). Nada de notícia de crime, política partidária, fofoca, propaganda ou vaga de um único anúncio. Só devolva a lista vazia se de fato não houver nada novo.`;
}

export type ResultadoBusca = { ok: true; novas: number; pulou?: string } | { ok: false; erro: string };

export async function buscarNoticias({ forcar = false, agora = Date.now() } = {}): Promise<ResultadoBusca> {
  const acesso = acessoFila();
  if (!acesso)
    return { ok: false, erro: "Falta a chave do servidor (PUBLIKE_CHAVE_SERVIDOR) para gravar as notícias." };
  if (!iaConfigurada()) {
    return { ok: false, erro: "Falta a chave da IA no servidor (OPENAI_API_KEY ou ANTHROPIC_API_KEY)." };
  }
  const { cliente, chave } = acesso;

  const { data: ctx, error: erroCtx } = await cliente.rpc("servidor_noticias_contexto", { p_chave: chave });
  if (erroCtx || !ctx) return { ok: false, erro: "Não deu para ler a configuração. A migração das notícias já rodou?" };
  const contexto = ctx as {
    ligada: boolean;
    modelo: string | null;
    ultima_busca: string | null;
    recentes: { titulo: string; fonte_url: string }[];
    sem_foto?: { id: string; titulo: string; tema: TemaNoticia }[];
    fotos_usadas?: string[];
  };
  const usadas = new Set(contexto.fotos_usadas ?? []);
  // as notícias que ainda estão sem foto ganham uma (também quando a busca de notícias não roda agora)
  const completar = () => completarFotos(cliente, chave, contexto.sem_foto ?? [], usadas);
  if (!forcar) {
    if (!contexto.ligada) {
      await completar();
      return { ok: true, novas: 0, pulou: "A busca de notícias está desligada no admin." };
    }
    if (contexto.ultima_busca && agora - Date.parse(contexto.ultima_busca) < INTERVALO_MIN) {
      await completar();
      return { ok: true, novas: 0, pulou: "A última busca foi há pouco." };
    }
  }

  const jaVistas = new Set(contexto.recentes.map((r) => normalizarUrl(r.fonte_url)));
  const lista = contexto.recentes
    .slice(0, 40)
    .map((r) => `- ${r.titulo} (${r.fonte_url})`)
    .join("\n");

  let itens: ItemIA[] = [];
  let fontes: string[] = [];
  let buscas: number | undefined;
  try {
    const r = await chamarIA({
      funcionalidade: "admin",
      modelo: contexto.modelo ?? "",
      sistema: instrucoes(hojeEmBrasilia(agora)),
      mensagem: lista
        ? `Estas já estão na nossa lista. Não traga a mesma matéria de novo, nem outra igual sem fato novo:\n${lista}`
        : "Ainda não temos nenhuma notícia na lista.",
      maxTokens: 5000,
      esquema: { nome: "noticias", schema: ESQUEMA },
      // várias buscas: uma por assunto (Brasil e Goiás)
      buscaNaWeb: { cidade: "Goiânia", regiao: "Goiás", maxBuscas: 10 },
      tempoLimite: 180_000,
    });
    if (r.parada)
      throw new ErroIA(r.parada === "limite" ? "A resposta da IA ficou longa demais." : "A IA não respondeu.");
    itens = lerJson<{ noticias: ItemIA[] }>(r.texto).noticias ?? [];
    fontes = r.fontes;
    buscas = r.buscas;
  } catch (e) {
    const erro = e instanceof ErroIA ? e.message : "A busca de notícias falhou.";
    await cliente.rpc("servidor_salvar_noticias", { p_chave: chave, p_itens: [], p_erro: erro });
    return { ok: false, erro };
  }

  // Só entra matéria que a busca abriu de verdade (a IA não pode inventar endereço),
  // que ainda não está na lista e que não é velha.
  const abertas = new Set(fontes.map(normalizarUrl));
  const limiteData = hojeEmBrasilia(agora - 20 * 86400e3);
  // por que cada sugestão ficou de fora (vai no aviso do admin)
  const fora = { fonte: 0, repetida: 0, antiga: 0, tema: 0 };
  const aceitas = itens
    .filter((i) => {
      const url = normalizarUrl(i.fonte_url ?? "");
      if (!/^https:\/\//.test(url) || !abertas.has(url)) return void fora.fonte++, false;
      if (jaVistas.has(url)) return void fora.repetida++, false;
      if (new URL(url).pathname.length < 2) return void fora.fonte++, false;
      if (i.fonte_data && /^\d{4}-\d{2}-\d{2}$/.test(i.fonte_data) && i.fonte_data < limiteData)
        return void fora.antiga++, false;
      if (!LISTA_TEMAS_NOTICIA.includes(i.tema)) return void fora.tema++, false;
      return true;
    })
    .slice(0, 8)
    .map((i) => ({
      slug: slugDaNoticia(i.titulo, randomBytes(3).toString("hex")),
      titulo: i.titulo.trim().slice(0, 140),
      resumo: i.resumo.trim().slice(0, 300),
      corpo: i.corpo.trim().slice(0, 3000),
      pratico: i.pratico.trim().slice(0, 400),
      tema: i.tema,
      cidade: i.cidade.trim().slice(0, 60),
      fonte_nome: (i.fonte_nome.trim() || new URL(i.fonte_url).hostname.replace(/^www\./, "")).slice(0, 120),
      fonte_url: i.fonte_url.trim(),
      fonte_data: /^\d{4}-\d{2}-\d{2}$/.test(i.fonte_data) ? i.fonte_data : "",
      foto_busca: (i.foto_busca ?? "").trim(),
    }));
  // a foto de cada uma (uma de cada vez: duas notícias não ficam com a mesma)
  const comFoto = [];
  for (const { foto_busca, ...a } of aceitas) {
    comFoto.push({ ...a, ...((await buscarFoto(foto_busca, a.tema, usadas)) ?? {}) });
  }

  const descartadas = itens.length - aceitas.length;
  // o que a IA fez, para entender uma busca que voltou vazia
  const fez = `${buscas !== undefined ? `${buscas} busca(s), ` : ""}${fontes.length} página(s) aberta(s), ${itens.length} sugestão(ões)`;
  const motivos = [
    fora.fonte && `${fora.fonte} sem a fonte confirmada`,
    fora.repetida && `${fora.repetida} já na lista`,
    fora.antiga && `${fora.antiga} antiga(s)`,
    fora.tema && `${fora.tema} fora dos temas`,
  ].filter(Boolean);
  const aviso = descartadas
    ? `A IA fez ${fez}; ${descartadas} ficaram de fora (${motivos.join(", ")}).`
    : aceitas.length === 0
      ? `A IA fez ${fez}.`
      : null;
  if (!aceitas.length) console.warn(`Publike: busca de notícias sem nada novo: ${aviso}`);
  const { data: novas, error } = await cliente.rpc("servidor_salvar_noticias", {
    p_chave: chave,
    p_itens: comFoto,
    p_erro: aviso,
  });
  if (error) return { ok: false, erro: "Não deu para guardar as notícias." };
  await completar();
  return { ok: true, novas: novas ?? 0 };
}

/** Foto para as notícias que ainda não têm (as antigas e as que a busca de fotos não achou antes). */
async function completarFotos(
  cliente: NonNullable<ReturnType<typeof acessoFila>>["cliente"],
  chave: string,
  semFoto: { id: string; titulo: string; tema: TemaNoticia }[],
  usadas: Set<string>,
) {
  if (!fotosConfiguradas() || !semFoto.length) return;
  const fotos = [];
  // o Openverse sem chave aceita 20 buscas por minuto: 5 notícias por vez
  for (const n of semFoto.slice(0, 5)) {
    const foto = await buscarFoto("", n.tema, usadas);
    if (foto) fotos.push({ id: n.id, ...foto });
  }
  if (fotos.length) await cliente.rpc("servidor_fotos_noticias", { p_chave: chave, p_fotos: fotos });
}
