// A página de uma vaga na Gupy (claude/plano-candidatura-no-site-da-empresa.md). A Gupy não publica o dado
// `JobPosting`: tudo vem no dado da própria página (`__NEXT_DATA__`, em `props.pageProps.job`). É o formato interno
// dela, que pode mudar sem aviso: quando o Publike deixa de entender, quem chamou avisa a equipe
// (servidor_alerta 'formato_gupy', uma vez, até voltar a funcionar). Sem banco e sem rede: dá para testar
// (scripts/testar-candidatura.ts).

import type { Regime } from "./tipos";
import { temContatoNoTexto } from "./validacao";

/** A vaga lida da página da Gupy. */
export type VagaDaGupy = {
  /** o link limpo da vaga: https://<empresa>.gupy.io/jobs/<número> */
  link: string;
  titulo: string;
  /** a descrição, as responsabilidades, os requisitos e as informações adicionais, em texto (sem contato) */
  descricao: string;
  /** a descrição passou de 3.000 letras e ficou o começo */
  descricaoCortada: boolean;
  /** linhas tiradas da descrição por terem telefone, e-mail ou site */
  linhasComContato: number;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  /** o tipo da vaga na Gupy ("vacancy_type_effective") */
  tipo: string | null;
  /** presencial, remoto ou híbrido ("on-site", "remote", "hybrid") */
  modelo: string | null;
  /** a vaga também é para pessoas com deficiência */
  pcd: boolean;
  /** a situação na Gupy: "published" está aberta; "closed", "canceled", "frozen"... fechada */
  situacao: string;
  /** o fim da publicação na Gupy ("2026-12-21") */
  expiraEm: string | null;
  /** o nome da empresa na página de carreiras */
  empresa: string | null;
};

export type LeituraDaGupy = { ok: true; vaga: VagaDaGupy } | { ok: false; formato: string };

/** O link é de uma vaga na Gupy (https://<empresa>.gupy.io/jobs/<número>). */
export function ehVagaDaGupy(link: string | null | undefined): boolean {
  return linkLimpoDaGupy(link) !== null;
}

/** O link da vaga sem o resto (`?jobBoardSource=...`): https://<empresa>.gupy.io/jobs/<número>. */
export function linkLimpoDaGupy(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    const u = new URL(link.trim());
    const host = u.hostname.toLowerCase();
    const vaga = u.pathname.match(/^\/jobs\/(\d{1,15})\/?$/);
    if (u.protocol !== "https:" || !/^[a-z0-9-]+\.gupy\.io$/.test(host) || !vaga) return null;
    return `https://${host}/jobs/${vaga[1]}`;
  } catch {
    return null;
  }
}

/** O tipo de contratação de cada tipo de vaga da Gupy (o que não está aqui, a equipe escolhe). */
const REGIME_DA_GUPY: Record<string, Regime> = {
  vacancy_type_effective: "clt",
  vacancy_type_internship: "estagio",
  vacancy_type_apprentice: "aprendiz",
  vacancy_type_trainee: "trainee",
  vacancy_type_temporary: "temporario",
  vacancy_type_summer: "temporario",
  vacancy_legal_entity: "pj",
  vacancy_type_autonomous: "autonomo",
  vacancy_type_freelancer: "freelance",
  vacancy_type_associate: "outro",
  vacancy_type_outsource: "outro",
  vacancy_type_lecturer: "outro",
  vacancy_type_volunteer: "outro",
  vacancy_type_talent_pool: "outro",
};

export function regimeDaGupy(tipo: string | null): Regime | null {
  return (tipo && REGIME_DA_GUPY[tipo]) || null;
}

const MODELO_DA_GUPY: Record<string, "presencial" | "remoto" | "hibrido"> = {
  "on-site": "presencial",
  remote: "remoto",
  hybrid: "hibrido",
};

export function modeloDaGupy(modelo: string | null): "presencial" | "remoto" | "hibrido" | null {
  return (modelo && MODELO_DA_GUPY[modelo]) || null;
}

const ENTIDADES: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  bull: "•",
  middot: "·",
  ordm: "º",
  ordf: "ª",
  deg: "°",
  laquo: "«",
  raquo: "»",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
};

function entidade(nome: string): string {
  if (nome[0] === "#") {
    const n = nome[1] === "x" || nome[1] === "X" ? Number.parseInt(nome.slice(2), 16) : Number.parseInt(nome.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
  }
  return ENTIDADES[nome.toLowerCase()] ?? `&${nome};`;
}

/** O HTML de um campo da vaga em linhas de texto (os itens de lista com "•"). */
export function linhasDoHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  const t = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<\/?(p|div|h[1-6]|li|ul|ol|blockquote|tr|section)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (_, e: string) => entidade(e));
  return t
    .split("\n")
    .map((l) => l.replace(/[\s ​]+/g, " ").trim())
    .filter((l) => l && l !== "•");
}

const MAX_DESCRICAO = 3000;

/** Os campos de texto da vaga, na ordem da página da Gupy (o título só entra quando o campo não começa com um). */
const SECOES: { campo: string; titulo: string | null }[] = [
  { campo: "description", titulo: null },
  { campo: "responsibilities", titulo: "Responsabilidades e atribuições:" },
  { campo: "prerequisites", titulo: "Requisitos e qualificações:" },
  { campo: "relevantExperiences", titulo: "Informações adicionais:" },
];

/**
 * A descrição para o Publike: os campos da Gupy em texto, sem as linhas com telefone, e-mail ou site (o Publike não
 * deixa contato na descrição) e até 3.000 letras (corta entre linhas).
 */
export function descricaoDaGupy(job: Record<string, unknown>): {
  texto: string;
  cortada: boolean;
  linhasComContato: number;
} {
  let linhasComContato = 0;
  const blocos: string[][] = [];
  for (const s of SECOES) {
    const valor = job[s.campo];
    const linhas = linhasDoHtml(typeof valor === "string" ? valor : null).filter((l) => {
      if (!temContatoNoTexto(l)) return true;
      linhasComContato++;
      return false;
    });
    if (!linhas.length) continue;
    blocos.push(s.titulo && !linhas[0].endsWith(":") ? [s.titulo, ...linhas] : linhas);
  }
  let texto = "";
  let cortada = false;
  for (const bloco of blocos) {
    for (const [i, linha] of bloco.entries()) {
      const juntar = texto ? (i === 0 ? "\n\n" : "\n") : "";
      if (texto.length + juntar.length + linha.length > MAX_DESCRICAO) {
        cortada = true;
        break;
      }
      texto += juntar + linha;
    }
    if (cortada) break;
  }
  return { texto, cortada, linhasComContato };
}

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** O CEP no fim do endereço ("BR-153, Goiânia, Goiás, Brasil, 74850-370"). */
export function cepDoEndereco(endereco: string | null): string | null {
  const m = endereco?.match(/\b(\d{5})-?(\d{3})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

/**
 * Lê a vaga do HTML da página da Gupy. `formato`: o que faltou (a Gupy mudou a página); a equipe recebe o aviso com
 * esse texto.
 */
export function lerPaginaDaGupy(html: string, link: string): LeituraDaGupy {
  const script = html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!script) return { ok: false, formato: "a página da vaga não tem mais o dado __NEXT_DATA__" };
  let dados: unknown;
  try {
    dados = JSON.parse(script[1]);
  } catch {
    return { ok: false, formato: "o dado __NEXT_DATA__ da página não é mais JSON" };
  }
  const props = (dados as { props?: { pageProps?: Record<string, unknown> } } | null)?.props?.pageProps;
  const job = props?.job;
  if (!job || typeof job !== "object" || Array.isArray(job))
    return { ok: false, formato: "o dado da página não tem mais a vaga em props.pageProps.job" };
  const j = job as Record<string, unknown>;
  const titulo = texto(j.name);
  const situacao = texto(j.status);
  if (!titulo || !situacao) return { ok: false, formato: "a vaga em props.pageProps.job não tem mais name e status" };
  const { texto: descricao, cortada, linhasComContato } = descricaoDaGupy(j);
  const endereco = texto(j.addressLine);
  const pagina = j.careerPage as { name?: unknown } | null | undefined;
  const empresa = j.company as { name?: unknown } | null | undefined;
  const expira = texto(j.expiresAt);
  return {
    ok: true,
    vaga: {
      link: linkLimpoDaGupy(link) ?? link,
      titulo: titulo.replace(/\s+/g, " ").slice(0, 90),
      descricao,
      descricaoCortada: cortada,
      linhasComContato,
      cidade: texto(j.addressCity),
      uf: texto(j.addressStateShortName),
      cep: cepDoEndereco(endereco),
      tipo: texto(j.jobType),
      modelo: texto(j.workplaceType),
      pcd: j.handicapped === true,
      situacao,
      expiraEm: expira && /^\d{4}-\d{2}-\d{2}/.test(expira) ? expira.slice(0, 10) : null,
      empresa: texto(pagina?.name) ?? texto(empresa?.name),
    },
  };
}

/** A vaga fechou na Gupy: a situação não é "published" ou a publicação venceu antes de hoje ("2026-11-13"). */
export function fechadaNaGupy(v: Pick<VagaDaGupy, "situacao" | "expiraEm">, hoje: string): string | null {
  if (v.situacao !== "published") return `a vaga fechou na Gupy (situação: ${v.situacao})`;
  if (v.expiraEm && v.expiraEm < hoje) return `a publicação na Gupy venceu em ${v.expiraEm.split("-").reverse().join("/")}`;
  return null;
}
