import "server-only";
import {
  CNHS,
  DISPONIBILIDADES,
  ESCOLARIDADES,
  ESCOLARIDADES_COM_CURSO,
  MAX_CURSOS,
  MAX_EXPERIENCIAS,
} from "@/lib/constantes";
import { MAX_HABILIDADES } from "@/lib/talentos";
import { temContato, temContatoNoTexto } from "@/lib/validacao";
import { chamarIA, ErroIA, lerJson } from "./openai";

// Lê o currículo que a pessoa já tem (PDF ou fotos da folha) e devolve os campos do currículo
// do Publike, para ela conferir antes de salvar. Só o que está escrito, sem contato nenhum.

/** Os campos do formulário, já limpos. Vazio ("" ou lista vazia) é o que o arquivo não diz. */
export type CurriculoLido = {
  titulo: string;
  habilidades: string[];
  escolaridade: string;
  curso: string;
  experiencias: { cargo: string; onde: string; inicio: string; fim: string; atual: boolean; descricao: string }[];
  cursos: string[];
  cnh: string;
  disponibilidade: string[];
};

type Resposta = CurriculoLido & { e_curriculo: boolean };

const comVazio = (l: readonly string[]) => [...l, ""];
const texto = { type: "string" } as const;
const listaDeTexto = { type: "array", items: texto } as const;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "e_curriculo",
    "titulo",
    "habilidades",
    "escolaridade",
    "curso",
    "experiencias",
    "cursos",
    "cnh",
    "disponibilidade",
  ],
  properties: {
    e_curriculo: { type: "boolean" },
    titulo: texto,
    habilidades: listaDeTexto,
    escolaridade: { type: "string", enum: comVazio(ESCOLARIDADES.map((e) => e.valor)) },
    curso: texto,
    experiencias: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["cargo", "onde", "inicio", "fim", "atual", "descricao"],
        properties: {
          cargo: texto,
          onde: texto,
          inicio: texto,
          fim: texto,
          atual: { type: "boolean" },
          descricao: texto,
        },
      },
    },
    cursos: listaDeTexto,
    cnh: { type: "string", enum: comVazio(CNHS) },
    disponibilidade: { type: "array", items: { type: "string", enum: DISPONIBILIDADES.map((d) => d.valor) } },
  },
} as const;

function instrucoes(hoje: string) {
  const escolaridades = ESCOLARIDADES.map((e) => `"${e.valor}" (${e.nome})`).join(", ");
  return `Você lê o currículo de uma pessoa que procura trabalho (um PDF ou fotos da folha) e preenche o currículo dela no Publike, um site gratuito de vagas de Goiânia e região. A pessoa confere tudo antes de salvar.

Regras:
- Use só o que está escrito. Não invente cargo, empresa, data, curso nem habilidade. O que o currículo não diz fica vazio ("" ou lista vazia).
- "e_curriculo": false se não for um currículo (outro documento, foto de outra coisa, folha ilegível); aí deixe o resto vazio.
- Nunca ponha telefone, e-mail, endereço, link, CPF, RG, data de nascimento, idade, estado civil, foto nem o nome de outras pessoas (referências) em campo nenhum.
- "titulo": a profissão ou o trabalho que a pessoa procura, curto (até 60 letras), como "Auxiliar de cozinha" ou "Motorista". Use o objetivo do currículo; sem objetivo, o cargo mais recente.
- "habilidades": até ${MAX_HABILIDADES}, curtas (até 40 letras cada), o que a pessoa sabe fazer: "Atendimento ao cliente", "Pacote Office", "Empilhadeira". Não repita os cursos.
- "escolaridade": a mais alta, desta lista: ${escolaridades}. Ensino médio cursando é "medio_incompleto"; faculdade cursando ou trancada é "superior_incompleto".
- "curso": o nome do curso técnico, da faculdade ou da pós-graduação (até 80 letras), só para técnico, superior ou pós.
- "experiencias": até ${MAX_EXPERIENCIAS}, da mais recente para a mais antiga. "cargo" (até 80 letras), "onde" (a empresa ou o lugar, até 80 letras), "inicio" e "fim" no formato AAAA-MM. Se só tiver o ano, use AAAA-01 no início e AAAA-12 no fim. "atual": true se a pessoa ainda trabalha lá ("atual", "até o momento", "emprego atual"), com "fim" "". Sem data, "". "descricao": o que a pessoa fazia, em uma ou duas frases simples (até 300 letras).
- "cursos": até ${MAX_CURSOS} cursos livres, técnicos, NR, informática ou idiomas (até 80 letras cada), com a carga horária se tiver: "Excel básico (20 h)".
- "cnh": a categoria da carteira de motorista, só se o currículo disser.
- "disponibilidade": só se o currículo disser quando a pessoa pode trabalhar.
- Hoje é ${hoje} (AAAA-MM).`;
}

// ---- limpeza: o que volta para o formulário segue as mesmas regras do salvar ----

const MES = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/;

function curto(v: unknown, max: number) {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max).trim() : "";
}

/** Sem repetir (maiúscula e minúscula contam igual), sem contato e no tamanho certo. */
function lista(v: unknown, min: number, max: number, quantos: number, contato: (t: string) => boolean) {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const item of Array.isArray(v) ? v : []) {
    const t = curto(item, max);
    const chave = t.toLowerCase();
    if (t.length < min || contato(t) || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(t);
    if (saida.length >= quantos) break;
  }
  return saida;
}

/** AAAA-MM válido e que já aconteceu; depois de hoje, vira hoje. */
function mes(v: unknown, hoje: string) {
  const t = curto(v, 7);
  if (!MES.test(t)) return "";
  return t > hoje ? hoje : t;
}

export function limparCurriculoLido(r: Partial<Resposta>, hoje: string): CurriculoLido {
  const escolaridade = ESCOLARIDADES.some((e) => e.valor === r.escolaridade) ? (r.escolaridade as string) : "";
  const titulo = curto(r.titulo, 60);
  const curso = ESCOLARIDADES_COM_CURSO.includes(escolaridade) ? curto(r.curso, 80) : "";
  const experiencias: CurriculoLido["experiencias"] = [];
  for (const x of Array.isArray(r.experiencias) ? r.experiencias : []) {
    const cargo = curto(x?.cargo, 80);
    if (cargo.length < 2 || temContato(cargo)) continue;
    const onde = curto(x?.onde, 80);
    const inicio = mes(x?.inicio, hoje);
    const atual = x?.atual === true;
    let fim = atual ? "" : mes(x?.fim, hoje);
    if (fim && inicio && fim < inicio) fim = "";
    const descricao = curto(x?.descricao, 300);
    experiencias.push({
      cargo,
      onde: temContato(onde) ? "" : onde,
      inicio,
      fim,
      atual,
      descricao: temContatoNoTexto(descricao) ? "" : descricao,
    });
    if (experiencias.length >= MAX_EXPERIENCIAS) break;
  }
  return {
    titulo: titulo.length >= 2 && !temContato(titulo) ? titulo : "",
    habilidades: lista(r.habilidades, 2, 40, MAX_HABILIDADES, temContato),
    escolaridade,
    curso: curso.length >= 2 && !temContato(curso) ? curso : "",
    experiencias,
    cursos: lista(r.cursos, 2, 80, MAX_CURSOS, temContatoNoTexto),
    cnh: (CNHS as readonly string[]).includes(r.cnh ?? "") ? (r.cnh as string) : "",
    disponibilidade: DISPONIBILIDADES.map((d) => d.valor).filter((d) => (r.disponibilidade ?? []).includes(d)),
  };
}

/** Quanto do currículo veio preenchido (para dizer se deu para ler). */
export function camposLidos(c: CurriculoLido) {
  return (
    Number(Boolean(c.titulo)) +
    c.habilidades.length +
    Number(Boolean(c.escolaridade)) +
    c.experiencias.length +
    c.cursos.length +
    Number(Boolean(c.cnh))
  );
}

/**
 * Lê o currículo: um PDF (data: URL) ou até 3 fotos (data: URL). Devolve null quando o arquivo
 * não é um currículo. Erros da IA saem como ErroIA.
 */
export async function lerCurriculoDoArquivo(
  entrada: { pdf: { nome: string; dados: string } | null; fotos: string[] },
  modelo: string,
  hoje: string,
): Promise<CurriculoLido | null> {
  const { texto: resposta, parada } = await chamarIA({
    modelo,
    sistema: instrucoes(hoje),
    mensagem: entrada.pdf
      ? "O currículo está no PDF."
      : `O currículo está ${entrada.fotos.length > 1 ? `nestas ${entrada.fotos.length} fotos, na ordem das páginas` : "nesta foto"}.`,
    arquivos: entrada.pdf ? [entrada.pdf] : undefined,
    imagens: entrada.fotos.length ? entrada.fotos : undefined,
    // a letra de uma folha fotografada é miúda
    detalhe: "high",
    maxTokens: 3000,
    esquema: { nome: "curriculo_do_arquivo", schema: ESQUEMA },
    tempoLimite: 90_000,
  });
  if (parada === "recusa") throw new ErroIA("A IA não quis ler este arquivo.");
  if (parada === "limite") throw new ErroIA("A resposta da IA ficou incompleta.");
  const r = lerJson<Partial<Resposta>>(resposta);
  if (!r.e_curriculo) return null;
  return limparCurriculoLido(r, hoje);
}
