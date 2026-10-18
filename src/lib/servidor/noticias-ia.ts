import "server-only";
import { randomBytes } from "node:crypto";
import { chamarIA, ErroIA, iaConfigurada, lerJson } from "@/lib/ia/openai";
import { LISTA_TEMAS_NOTICIA, normalizarUrl, slugDaNoticia, type TemaNoticia } from "@/lib/noticias";
import { acessoFila } from "./filas";
import { buscarFoto, fotosConfiguradas } from "./fotos-noticias";

// A IA procura notícias sobre trabalho em Goiânia e região e escreve um resumo
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
  /** o que buscar no banco de fotos, em inglês */
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
  return `Você é o editor de notícias do Publike, um site grátis de vagas e serviços de Goiânia e região (Goiás). Hoje é ${hoje}.

Procure na internet notícias publicadas nos últimos 7 dias sobre trabalho, emprego e mercado de trabalho. Primeiro as de Goiânia e da região metropolitana (Aparecida de Goiânia, Senador Canedo, Trindade, Goianira, Anápolis e vizinhas) e de Goiás; depois as do Brasil que mudam algo para quem trabalha, presta serviço ou contrata aqui. Vale qualquer notícia desse assunto, por exemplo:
- vagas: feirões e mutirões de emprego, Sine, Mais Empregos, empresas que vão abrir, ampliar ou contratar;
- demissões, fechamento de empresas, greves e acordos de categorias (com o que muda para o trabalhador);
- salários: salário mínimo, pisos e reajustes de categorias, renda média;
- números do emprego e da economia de Goiás e do Brasil (Caged, IBGE, desemprego, informalidade) e dos setores que mais empregam aqui (comércio, serviços, construção, indústria, agronegócio);
- direitos e leis: CLT, jornada e escala de trabalho, FGTS, seguro-desemprego, férias, 13º, INSS e aposentadoria de quem trabalha;
- trabalho por conta própria: MEI, autônomos, trabalho por aplicativo, crédito e apoio para pequeno negócio;
- qualificação: cursos gratuitos (Senai, Senac, Cotec, IFG, prefeituras), jovem aprendiz, estágio, primeiro emprego;
- concursos e processos seletivos com inscrições abertas;
- inclusão no trabalho: mulheres, pessoas com deficiência, pessoas acima de 50 anos;
- tecnologia e mudanças no jeito de trabalhar (inteligência artificial, trabalho remoto) quando afetam empregos de verdade.

Regras:
- Só notícias reais que você abriu nesta busca. "fonte_url" é o endereço exato da matéria, nunca a página inicial do site.
- Prefira fontes oficiais (goias.gov.br, goiania.go.gov.br, gov.br) e jornais (O Popular, Jornal Opção, Mais Goiás, g1 Goiás). Para lei, direito e benefício, só fonte oficial do governo.
- Escreva com as suas palavras, sem copiar frases da matéria. Linguagem simples, frases curtas, sem gíria, para quem lê no celular.
- Não invente data, valor, endereço, horário nem requisito: se a matéria não diz, não diga.
- "titulo": até 100 caracteres, direto ("Feirão oferece 800 vagas em Aparecida neste sábado").
- "resumo": uma ou duas frases (até 250 caracteres).
- "corpo": dois a quatro parágrafos curtos, separados por uma linha em branco, com o que, quando, onde e como participar.
- "pratico": uma frase com o que a pessoa faz com isso ("Leve RG, CPF e carteira de trabalho."). Vazio se não houver.
- "cidade": a cidade da notícia ou "" se for de Goiás ou do Brasil todo.
- "tema": vagas (vagas, feirões, contratações), cursos, concursos, direitos (leis, benefícios, salário mínimo), eventos, ou mercado (números, economia, setores, demissões, greves, tecnologia e o resto).
- "fonte_data": a data da matéria no formato AAAA-MM-DD, ou "" se não souber.
- "foto_busca": duas a quatro palavras em inglês para achar uma foto de banco que combine com o assunto, como numa notícia de jornal ("construction workers", "job fair crowd", "students classroom"). Sem nome de pessoa, de empresa ou de lugar.
- No máximo 8 notícias, das mais úteis para as menos, com pelo menos metade de Goiás quando houver. Nada de notícia de crime, política partidária, fofoca, propaganda ou vaga de um único anúncio. Se não achar nada que preste, devolva a lista vazia.`;
}

export type ResultadoBusca = { ok: true; novas: number; pulou?: string } | { ok: false; erro: string };

export async function buscarNoticias({ forcar = false, agora = Date.now() } = {}): Promise<ResultadoBusca> {
  const acesso = acessoFila();
  if (!acesso)
    return { ok: false, erro: "Falta a chave do servidor (PUBLIKE_CHAVE_SERVIDOR) para gravar as notícias." };
  if (!iaConfigurada()) return { ok: false, erro: "Falta a chave da IA no servidor (OPENAI_API_KEY)." };
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
  try {
    const r = await chamarIA({
      modelo: contexto.modelo ?? "",
      sistema: instrucoes(hojeEmBrasilia(agora)),
      mensagem: lista
        ? `Estas já estão na nossa lista. Não traga de novo, nem outra matéria sobre o mesmo assunto:\n${lista}`
        : "Ainda não temos nenhuma notícia na lista.",
      maxTokens: 5000,
      esquema: { nome: "noticias", schema: ESQUEMA },
      buscaNaWeb: { cidade: "Goiânia", regiao: "Goiás" },
      tempoLimite: 180_000,
    });
    if (r.parada)
      throw new ErroIA(r.parada === "limite" ? "A resposta da IA ficou longa demais." : "A IA não respondeu.");
    itens = lerJson<{ noticias: ItemIA[] }>(r.texto).noticias ?? [];
    fontes = r.fontes;
  } catch (e) {
    const erro = e instanceof ErroIA ? e.message : "A busca de notícias falhou.";
    await cliente.rpc("servidor_salvar_noticias", { p_chave: chave, p_itens: [], p_erro: erro });
    return { ok: false, erro };
  }

  // Só entra matéria que a busca abriu de verdade (a IA não pode inventar endereço),
  // que ainda não está na lista e que não é velha.
  const abertas = new Set(fontes.map(normalizarUrl));
  const limiteData = hojeEmBrasilia(agora - 20 * 86400e3);
  const aceitas = itens
    .filter((i) => {
      const url = normalizarUrl(i.fonte_url ?? "");
      if (!/^https:\/\//.test(url) || !abertas.has(url) || jaVistas.has(url)) return false;
      if (new URL(url).pathname.length < 2) return false;
      if (i.fonte_data && /^\d{4}-\d{2}-\d{2}$/.test(i.fonte_data) && i.fonte_data < limiteData) return false;
      return LISTA_TEMAS_NOTICIA.includes(i.tema);
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
  const { data: novas, error } = await cliente.rpc("servidor_salvar_noticias", {
    p_chave: chave,
    p_itens: comFoto,
    p_erro: descartadas
      ? `${descartadas} sugestão(ões) da IA ficaram de fora (fonte não confirmada, repetida ou antiga).`
      : null,
  });
  if (error) return { ok: false, erro: "Não deu para guardar as notícias." };
  await completar();
  return { ok: true, novas: novas ?? 0 };
}

/** Foto para as notícias que ainda não têm (as antigas e as que o banco de fotos não achou antes). */
async function completarFotos(
  cliente: NonNullable<ReturnType<typeof acessoFila>>["cliente"],
  chave: string,
  semFoto: { id: string; titulo: string; tema: TemaNoticia }[],
  usadas: Set<string>,
) {
  if (!fotosConfiguradas() || !semFoto.length) return;
  const fotos = [];
  for (const n of semFoto) {
    const foto = await buscarFoto("", n.tema, usadas);
    if (foto) fotos.push({ id: n.id, ...foto });
  }
  if (fotos.length) await cliente.rpc("servidor_fotos_noticias", { p_chave: chave, p_fotos: fotos });
}
