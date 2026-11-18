// A documentação técnica do Admin (18/11/2026, Marcelo: "reúna tudo de informação técnica e crie uma opção no admin
// para eu revisitar"): o que o próprio projeto já escreve sobre si, lido dos arquivos e organizado para ler e buscar.
// Aqui só o que transforma o texto (sem ler arquivo): as notas do AGENTS.md, o comentário do começo de cada migração,
// os horários dos robôs e as tarefas das filas. Quem lê os arquivos é src/lib/servidor/documentacao.ts.

export type NotaTecnica = {
  /** para o endereço (#nota-...) */
  id: string;
  secao: string;
  titulo: string;
  /** a data citada no começo da nota (AAAA-MM-DD), para "mudou por último" */
  data: string | null;
  /** o texto da nota, sem o "- " do começo; as linhas de baixo (sub-itens) seguem com o recuo */
  linhas: string[];
};

export type SecaoTecnica = { id: string; titulo: string; intro: string[]; notas: NotaTecnica[] };

/** "Ação & Reação" → "acao-reacao" (para os ids). */
export function slugTecnico(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** "18/11/2026" (o primeiro do texto) → "2026-11-18"; também "13/10" sem o ano, não. */
export function dataDoTexto(texto: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(20\d{2})/.exec(texto);
  if (!m) return null;
  const [, d, mes, ano] = m;
  const dia = Number(d);
  const nMes = Number(mes);
  if (dia < 1 || dia > 31 || nMes < 1 || nMes > 12) return null;
  return `${ano}-${String(nMes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/**
 * O título da nota: o negrito do começo ("**Volte a contratar**") ou o começo do texto, cortado na primeira frase, nos
 * dois pontos ou no parêntese (o que vier antes, até 90 letras).
 */
export function tituloDaNota(texto: string): string {
  const negrito = /^\*\*(.+?)\*\*/.exec(texto);
  const base = (negrito ? negrito[1] : texto).replace(/`|\*\*/g, "").trim();
  const cortes = [base.indexOf(":"), base.indexOf(" ("), base.search(/[.!?]\s/)].filter((i) => i > 3 && i <= 90);
  if (cortes.length) return base.slice(0, Math.min(...cortes)).replace(/[.:]$/, "").trim();
  if (base.length <= 90) return base.replace(/[.:]$/, "");
  return `${base.slice(0, 87).trimEnd()}…`;
}

/**
 * As notas do AGENTS.md por seção ("## ..."): cada item "- " é uma nota, com as linhas recuadas de baixo; o que não é
 * item é o texto de abertura da seção. A primeira seção (o aviso do Next.js para quem programa) fica de fora.
 */
export function lerNotasTecnicas(md: string): SecaoTecnica[] {
  const secoes: SecaoTecnica[] = [];
  let secao: SecaoTecnica | null = null;
  let nota: NotaTecnica | null = null;
  const ids = new Set<string>();
  const idUnico = (base: string) => {
    let id = base || "nota";
    for (let i = 2; ids.has(id); i++) id = `${base}-${i}`;
    ids.add(id);
    return id;
  };
  for (const linha of md.split(/\r?\n/)) {
    const titulo = /^##\s+(.+)$/.exec(linha);
    if (titulo) {
      nota = null;
      secao = { id: idUnico(`secao-${slugTecnico(titulo[1])}`), titulo: titulo[1].trim(), intro: [], notas: [] };
      secoes.push(secao);
      continue;
    }
    if (!secao || /^#\s/.test(linha)) continue;
    const item = /^- (.+)$/.exec(linha);
    if (item) {
      const texto = item[1];
      nota = {
        id: idUnico(`nota-${slugTecnico(tituloDaNota(texto))}`),
        secao: secao.titulo,
        titulo: tituloDaNota(texto),
        data: dataDoTexto(texto.slice(0, 200)) ?? dataDoTexto(secao.titulo),
        linhas: [texto],
      };
      secao.notas.push(nota);
      continue;
    }
    if (nota && /^\s+\S/.test(linha)) {
      nota.linhas.push(linha);
      continue;
    }
    if (!linha.trim()) {
      nota = null;
      continue;
    }
    nota = null;
    secao.intro.push(linha.trim());
  }
  // o aviso do Next.js (escrito pelo next dev) é para quem programa, não para revisitar
  return secoes.filter((s) => !/next\.js you know/i.test(s.titulo) && (s.notas.length || s.intro.length));
}

export type MigracaoTecnica = {
  arquivo: string;
  titulo: string;
  data: string | null;
  /** o comentário do começo do arquivo, em linhas (sem o "-- ") */
  descricao: string[];
};

/** O comentário do começo de uma migração: as linhas "--" seguidas, sem as de enfeite ("-- ====="). */
export function lerMigracao(arquivo: string, sql: string): MigracaoTecnica {
  const descricao: string[] = [];
  for (const linha of sql.split(/\r?\n/)) {
    if (!linha.startsWith("--")) {
      // as linhas em branco antes do comentário passam; a primeira linha de código encerra
      if (descricao.length || linha.trim()) break;
      continue;
    }
    const texto = linha.replace(/^--\s?/, "").replace(/\s+$/, "");
    if (/^[=\-·\s]{3,}$/.test(texto)) continue;
    descricao.push(texto);
    if (descricao.length >= 40) break;
  }
  while (descricao.length && !descricao[0].trim()) descricao.shift();
  while (descricao.length && !descricao.at(-1)?.trim()) descricao.pop();
  const primeira = descricao.find((l) => l.trim()) ?? arquivo;
  const titulo = tituloDaNota(primeira.trim());
  return { arquivo, titulo, data: dataDoTexto(descricao.slice(0, 3).join(" ")), descricao };
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const NOS_DIAS = ["aos domingos", "às segundas", "às terças", "às quartas", "às quintas", "às sextas", "aos sábados"];

/**
 * O horário do robô em palavras, no horário de Brasília (o cron do GitHub e o da Vercel são em UTC, e Brasília fica 3
 * horas atrás o ano todo). O que não der para dizer em palavras volta como veio, com "(UTC)".
 */
export function descreverCron(cron: string): string {
  const partes = cron.trim().split(/\s+/);
  if (partes.length !== 5) return `${cron} (UTC)`;
  const [min, hora, dia, mes, semana] = partes;
  const cada = /^\*\/(\d+)$/.exec(min);
  if (cada && hora === "*" && dia === "*" && mes === "*" && semana === "*") return `a cada ${cada[1]} minutos`;
  if (/^\d+$/.test(min) && hora === "*" && dia === "*" && mes === "*" && semana === "*") {
    return `de hora em hora (no minuto ${min})`;
  }
  if (!/^\d+$/.test(min) || !/^\d+$/.test(hora) || dia !== "*" || mes !== "*") return `${cron} (UTC)`;
  const h = (Number(hora) - 3 + 24) % 24;
  // o horário de Brasília pode cair no dia de antes (03h UTC é meia-noite aqui)
  const voltaUmDia = Number(hora) < 3;
  const horario = `${String(h).padStart(2, "0")}h${min.padStart(2, "0")}`;
  if (semana === "*") return `todo dia às ${horario}`;
  const intervalo = /^(\d)-(\d)$/.exec(semana);
  const dias = (
    intervalo
      ? Array.from({ length: Number(intervalo[2]) - Number(intervalo[1]) + 1 }, (_, i) => Number(intervalo[1]) + i)
      : semana.split(",").map(Number)
  )
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 7)
    .map((d) => ((voltaUmDia ? d + 6 : d) % 7));
  if (!dias.length) return `${cron} (UTC)`;
  if (dias.length === 1) return `${dias[0] === 0 || dias[0] === 6 ? "todo" : "toda"} ${DIAS[dias[0]]}, às ${horario}`;
  if (intervalo && dias.length >= 3) return `de ${DIAS[dias[0]]} a ${DIAS[dias.at(-1) as number]}, às ${horario}`;
  const nomes = dias.map((d) => NOS_DIAS[d]);
  return `${nomes.slice(0, -1).join(", ")} e ${nomes.at(-1)}, às ${horario}`;
}

export type RoboTecnico = {
  arquivo: string;
  nome: string;
  horarios: string[];
  /** dá para rodar na hora pelo botão "Run workflow" do GitHub */
  naHora: boolean;
  /** roda a cada push (a conferência do código) */
  aCadaPush: boolean;
  descricao: string[];
};

/** Uma tarefa do GitHub Actions: o nome, os horários, se roda na hora e o comentário do começo. */
export function lerRobo(arquivo: string, yml: string): RoboTecnico {
  const descricao: string[] = [];
  for (const linha of yml.split(/\r?\n/)) {
    if (!linha.startsWith("#")) {
      if (descricao.length || linha.trim()) break;
      continue;
    }
    descricao.push(linha.replace(/^#\s?/, ""));
  }
  const nome = /^name:\s*["']?(.+?)["']?\s*$/m.exec(yml)?.[1] ?? arquivo;
  const horarios = [...yml.matchAll(/cron:\s*["']([^"']+)["']/g)].map((m) => m[1]);
  return { arquivo, nome, horarios, naHora: /workflow_dispatch/.test(yml), aCadaPush: /^\s+push:/m.test(yml), descricao };
}

export type TarefaDasFilas = { funcao: string; descricao: string[]; /** a posição na rodada (1, 2, 3...) */ ordem: number };

/**
 * As tarefas da rota das filas (/api/filas), na ordem em que rodam, com o comentário de cima de cada uma. A rota
 * chama `comTempo(() => tarefa(...))` ou `await tarefa(...)`; o comentário é o bloco "//" logo acima.
 */
export function lerTarefasDasFilas(ts: string): TarefaDasFilas[] {
  const corpo = ts.slice(ts.indexOf("export async function GET"));
  const tarefas: TarefaDasFilas[] = [];
  const vistas = new Set<string>();
  let comentario: string[] = [];
  for (const linha of corpo.split(/\r?\n/)) {
    const texto = linha.trim();
    if (texto.startsWith("//")) {
      comentario.push(texto.replace(/^\/\/\s?/, ""));
      continue;
    }
    const chamada =
      /comTempo\(\(\)\s*=>\s*([a-zA-Z]+)\(/.exec(texto) ?? /^(?:const \w+ = )?await ([a-zA-Z]+)\(/.exec(texto);
    if (chamada && !["comTempo", "autorizado"].includes(chamada[1])) {
      const funcao = chamada[1];
      // a mesma tarefa chamada duas vezes (a campanha geral do impulso antes de tudo): uma linha só, com os dois textos
      const ja = tarefas.find((t) => t.funcao === funcao);
      if (ja) ja.descricao.push(...comentario);
      else if (!vistas.has(funcao)) tarefas.push({ funcao, descricao: comentario, ordem: tarefas.length + 1 });
      vistas.add(funcao);
    }
    if (texto) comentario = [];
  }
  return tarefas;
}

/** O texto sem acento e em minúsculas, para buscar. */
export function paraBuscar(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Todas as palavras da busca aparecem no texto (sem acento, sem diferença de maiúscula). */
export function bateComBusca(texto: string, busca: string) {
  const palavras = paraBuscar(busca).split(/\s+/).filter(Boolean);
  if (!palavras.length) return true;
  const alvo = paraBuscar(texto);
  return palavras.every((p) => alvo.includes(p));
}
