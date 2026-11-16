import "server-only";
import { CONTEUDOS } from "@/lib/conteudos";
import { lerDadosDoConteudo, mesmaEstrutura, textoDoBloco, type DadosDoConteudo } from "@/lib/conteudos/atualizacao";
import { chamarIA, iaConfigurada, lerJson } from "@/lib/ia/openai";
import { conteudoAtual } from "./conteudos-atuais";
import { acessoFila } from "./filas";

// Os números dos conteúdos em dia (16/11/2026; migração 20270705120000). Uma vez por dia (/api/conteudos/atualizar,
// Vercel Cron), até 2 artigos com número, cada um no máximo a cada 7 dias: a IA procura na web o dado oficial mais
// novo (o Novo Caged, a PNAD e as estimativas do IBGE) e, se achar número novo, devolve o artigo inteiro com os
// números trocados, os mesmos blocos na mesma ordem. Fica como rascunho em Admin › Conteúdos: o site só muda quando o
// admin publica.

/** Quantos artigos por rodada (cada um é uma busca na web da IA). */
const POR_RODADA = 2;

type Resposta = {
  mudou: boolean;
  resultado: string;
  motivo: string;
  titulo: string;
  descricao: string;
  blocos_json: string;
  fontes_json: string;
};

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mudou", "resultado", "motivo", "titulo", "descricao", "blocos_json", "fontes_json"],
  properties: {
    mudou: { type: "boolean" },
    resultado: { type: "string" },
    motivo: { type: "string" },
    titulo: { type: "string" },
    descricao: { type: "string" },
    blocos_json: { type: "string" },
    fontes_json: { type: "string" },
  },
};

function instrucoes(hoje: string) {
  return `Hoje é ${hoje}. Você mantém em dia os números de um artigo do Publike, um site grátis de vagas de Goiânia e região.
O artigo vem em JSON (titulo, descricao, blocos e fontes). Pesquise na web se saiu dado oficial MAIS NOVO do que o do artigo para os números dele: o Novo Caged (Ministério do Trabalho), a PNAD Contínua e as estimativas de população do IBGE, ou a fonte oficial que o artigo cita. Prefira gov.br, ibge.gov.br e jornais conhecidos de Goiás.
- Se não houver dado mais novo para nenhum número, responda "mudou": false, diga em "resultado" o que conferiu (fonte e período mais recente) e repita titulo e descricao como estão, com blocos_json e fontes_json vazios ("").
- Se houver, responda "mudou": true e o artigo INTEIRO atualizado: troque os números, os períodos ("de janeiro a setembro") e as frases que dependem deles; mantenha exatamente os mesmos blocos, na mesma ordem e do mesmo tipo (t), o mesmo jeito de escrever, os mesmos links e as chamadas. Não invente número: use só o que achou na fonte. Número que não tem dado novo fica como está.
- "blocos_json": o JSON da lista de blocos (o mesmo formato). "fontes_json": o JSON da lista de fontes, com as novas (titulo, url https e data dd/mm/aaaa) no lugar das que ficaram velhas; o "fonte" de cada bloco "numero" aponta para a fonte certa (começa em 1).
- "titulo" e "descricao": troque só o número e o período, se estiverem neles.
- "motivo": uma ou duas frases para quem revisa, com o que mudou e de onde veio (ex.: "Caged de setembro: 50.529 → 56.112, de janeiro a setembro").
- "resultado": uma frase curta com o que você conferiu.`;
}

type ResultadoRodada = { ok: true; conferidos: { slug: string; resultado: string; rascunho: boolean }[] } | { ok: false; erro: string };

/** Os que aparecem na página inicial e os números do emprego: conferidos primeiro. */
const PRIMEIRO = ["emprego-em-goias-2026", "emprego-perto-de-casa-goiania", "publicar-vaga-gratis-goiania", "desemprego-goias-4-por-cento"];

/** Os artigos com número em destaque (os que têm o que atualizar), os de PRIMEIRO na frente. */
function comNumeros() {
  const todos = CONTEUDOS.filter((c) => c.blocos.some((b) => b.t === "numero")).map((c) => c.slug);
  return [...PRIMEIRO.filter((s) => todos.includes(s)), ...todos.filter((s) => !PRIMEIRO.includes(s))];
}

export async function atualizarConteudos({ agora = Date.now() } = {}): Promise<ResultadoRodada> {
  const acesso = acessoFila();
  if (!acesso) return { ok: false, erro: "Falta a chave do servidor (PUBLIKE_CHAVE_SERVIDOR)." };
  if (!iaConfigurada()) return { ok: false, erro: "Falta a chave da IA no servidor." };
  const { cliente, chave } = acesso;
  const { data: fila, error } = await cliente.rpc("servidor_conteudos_para_conferir", {
    p_chave: chave,
    p_slugs: comNumeros(),
    p_quantos: POR_RODADA,
  });
  if (error) return { ok: false, erro: `Não deu para ler a fila dos conteúdos: ${error.message}` };
  const hoje = new Date(agora).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const conferidos: { slug: string; resultado: string; rascunho: boolean }[] = [];

  for (const slug of fila ?? []) {
    const atual = await conteudoAtual(slug);
    if (!atual) continue;
    let resultado = "";
    let rascunho: DadosDoConteudo | null = null;
    let motivo = "";
    let falhou = false;
    try {
      const r = await chamarIA({
        funcionalidade: "admin",
        modelo: "",
        sistema: instrucoes(hoje),
        mensagem: JSON.stringify({
          titulo: atual.titulo,
          descricao: atual.descricao,
          blocos: atual.blocos,
          fontes: atual.fontes,
        }),
        maxTokens: 12000,
        esquema: { nome: "conteudo", schema: ESQUEMA },
        buscaNaWeb: { cidade: "Goiânia", regiao: "Goiás", maxBuscas: 4 },
        tempoLimite: 200_000,
      });
      const a = lerJson<Resposta>(r.texto);
      resultado = a.resultado.trim().slice(0, 500);
      if (a.mudou) {
        const dados = lerDadosDoConteudo({
          titulo: a.titulo,
          descricao: a.descricao,
          blocos: JSON.parse(a.blocos_json),
          fontes: JSON.parse(a.fontes_json),
        });
        const igual =
          dados &&
          dados.titulo === atual.titulo &&
          dados.descricao === atual.descricao &&
          dados.blocos.every((b, i) => textoDoBloco(b) === textoDoBloco(atual.blocos[i]));
        if (!dados || !mesmaEstrutura(atual.blocos, dados.blocos)) {
          resultado = `A IA achou número novo, mas devolveu o artigo num formato diferente; nada mudou. (${resultado})`;
        } else if (igual) {
          resultado = `A IA disse que mudou, mas o texto veio igual; nada mudou. (${resultado})`;
        } else {
          rascunho = dados;
          motivo = a.motivo.trim().slice(0, 600);
        }
      }
    } catch (e) {
      // a falha não conta como conferido: tenta de novo na próxima rodada
      falhou = true;
      resultado = `Não deu para conferir agora: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
    }
    if (falhou) {
      console.error(`Publike: conteúdo ${slug}: ${resultado}`);
      conferidos.push({ slug, resultado, rascunho: false });
      continue;
    }
    const { error: erroGravar } = await cliente.rpc("servidor_conteudo_conferido", {
      p_chave: chave,
      p_slug: slug,
      p_resultado: resultado,
      p_dados: rascunho as never,
      p_motivo: rascunho ? motivo : null,
    });
    if (erroGravar) console.error(`Publike: falha ao guardar a conferência de ${slug}:`, erroGravar.message);
    conferidos.push({ slug, resultado, rascunho: Boolean(rascunho) });
  }
  return { ok: true, conferidos };
}
