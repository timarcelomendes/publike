// Partes da vaga que a empresa monta do jeito dela:
// - perguntas (requisitos personalizados): a empresa dá o nome e o tipo de resposta; o
//   candidato responde ao curtir e a resposta aparece em Candidatos e na planilha;
// - benefícios a mais, além dos prontos;
// - horário montado: escala, dias, turnos e uma observação.
// Serve para o formulário (navegador), a validação e as páginas (servidor).

export const TIPOS_PERGUNTA = {
  sim_nao: { nome: "Sim ou não", exemplo: "Tem disponibilidade para viajar?" },
  texto: { nome: "Resposta curta", exemplo: "Qual sistema de caixa você já usou?" },
  numero: { nome: "Número", exemplo: "Quantos anos de experiência com vendas?" },
  opcoes: { nome: "Escolher uma opção", exemplo: "Qual turno prefere?" },
} as const;
export type TipoPergunta = keyof typeof TIPOS_PERGUNTA;
export const LISTA_TIPOS_PERGUNTA = Object.keys(TIPOS_PERGUNTA) as TipoPergunta[];

export type Pergunta = {
  /** curto e fixo: a resposta do candidato fica guardada por ele */
  id: string;
  nome: string;
  tipo: TipoPergunta;
  /** só no tipo "opcoes": de 2 a 8 */
  opcoes: string[];
  obrigatoria: boolean;
  /**
   * Triagem (só quem publicou vê; fica em vaga_triagem, fora da vaga pública): a resposta
   * que a empresa procura, em "sim ou não" e "escolher uma opção", e se quem responder
   * diferente fica de fora.
   */
  esperada?: string | null;
  eliminatoria?: boolean;
};

/** A triagem de cada pergunta, pelo id. */
export type Triagem = Record<string, { esperada: string; eliminatoria: boolean }>;

/** A resposta de cada pergunta, pelo id: "sim"/"nao", o texto, o número ou a opção escolhida. */
export type Respostas = Record<string, string>;

export const LIMITES_EXTRA = {
  perguntas: 8,
  nomePergunta: 120,
  opcoes: 8,
  nomeOpcao: 40,
  resposta: 200,
  beneficiosExtras: 10,
  nomeBeneficio: 40,
  turnos: 4,
  obsHorario: 120,
};

export function novoIdPergunta() {
  return `p${Math.random().toString(36).slice(2, 8)}`;
}

const ID = /^[a-z0-9]{2,12}$/;
const limpo = (t: unknown, max: number) => (typeof t === "string" ? t.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Lê as perguntas que vieram do formulário (JSON). Devolve as válidas ou o erro para o campo. */
export function lerPerguntas(bruto: unknown): { ok: true; perguntas: Pergunta[] } | { ok: false; erro: string } {
  if (bruto == null || bruto === "") return { ok: true, perguntas: [] };
  let lista: unknown;
  try {
    lista = typeof bruto === "string" ? JSON.parse(bruto) : bruto;
  } catch {
    return { ok: false, erro: "Não deu para ler as perguntas. Tente de novo." };
  }
  if (!Array.isArray(lista)) return { ok: false, erro: "Não deu para ler as perguntas. Tente de novo." };
  if (lista.length > LIMITES_EXTRA.perguntas)
    return { ok: false, erro: `No máximo ${LIMITES_EXTRA.perguntas} perguntas.` };
  const perguntas: Pergunta[] = [];
  const ids = new Set<string>();
  for (const item of lista) {
    const p = (item ?? {}) as Record<string, unknown>;
    const nome = limpo(p.nome, LIMITES_EXTRA.nomePergunta);
    // pergunta sem nome é a linha que a pessoa abriu e deixou em branco: fica de fora
    if (!nome) continue;
    if (nome.length < 3) return { ok: false, erro: `A pergunta “${nome}” ficou curta demais.` };
    const tipo = p.tipo as TipoPergunta;
    if (!LISTA_TIPOS_PERGUNTA.includes(tipo)) return { ok: false, erro: `Escolha o tipo de resposta de “${nome}”.` };
    const id = typeof p.id === "string" && ID.test(p.id) && !ids.has(p.id) ? p.id : novoIdPergunta();
    ids.add(id);
    let opcoes: string[] = [];
    if (tipo === "opcoes") {
      opcoes = [
        ...new Set(
          (Array.isArray(p.opcoes) ? p.opcoes : []).map((o) => limpo(o, LIMITES_EXTRA.nomeOpcao)).filter(Boolean),
        ),
      ];
      if (opcoes.length < 2) return { ok: false, erro: `Dê pelo menos 2 opções para “${nome}”.` };
      if (opcoes.length > LIMITES_EXTRA.opcoes)
        return { ok: false, erro: `No máximo ${LIMITES_EXTRA.opcoes} opções em “${nome}”.` };
    }
    const esperada =
      tipo === "sim_nao"
        ? p.esperada === "sim" || p.esperada === "nao"
          ? p.esperada
          : null
        : tipo === "opcoes" && typeof p.esperada === "string" && opcoes.includes(p.esperada)
          ? p.esperada
          : null;
    perguntas.push({
      id,
      nome,
      tipo,
      opcoes,
      obrigatoria: p.obrigatoria === true,
      esperada,
      eliminatoria: esperada !== null && p.eliminatoria === true,
    });
  }
  return { ok: true, perguntas };
}

/** Separa o que é público (a pergunta) do que só quem publicou vê (a triagem). */
export function separarTriagem(perguntas: Pergunta[]): { publicas: Pergunta[]; triagem: Triagem } {
  const triagem: Triagem = {};
  const publicas = perguntas.map(({ esperada, eliminatoria, ...p }) => {
    if (esperada) triagem[p.id] = { esperada, eliminatoria: Boolean(eliminatoria) };
    return p;
  });
  return { publicas, triagem };
}

/** Junta a triagem às perguntas (formulário de editar e nota de aderência). */
export function juntarTriagem(perguntas: Pergunta[], triagem: unknown): Pergunta[] {
  const t = (triagem && typeof triagem === "object" ? triagem : {}) as Record<string, unknown>;
  return perguntas.map((p) => {
    const item = (t[p.id] ?? null) as { esperada?: unknown; eliminatoria?: unknown } | null;
    const esperada = typeof item?.esperada === "string" ? item.esperada : null;
    const vale =
      esperada !== null && (p.tipo === "sim_nao" ? ["sim", "nao"].includes(esperada) : p.opcoes.includes(esperada));
    return { ...p, esperada: vale ? esperada : null, eliminatoria: vale && item?.eliminatoria === true };
  });
}

/** O que veio do banco (jsonb): só o que tem forma de pergunta. */
export function perguntasDoBanco(valor: unknown): Pergunta[] {
  const r = lerPerguntas(Array.isArray(valor) ? valor : []);
  return r.ok ? r.perguntas : [];
}

/**
 * Confere as respostas do candidato. As obrigatórias precisam estar lá; as outras podem
 * ficar vazias. O que não é pergunta da vaga é descartado.
 */
export function lerRespostas(
  perguntas: Pergunta[],
  bruto: unknown,
): { ok: true; respostas: Respostas } | { ok: false; erro: string; faltando: string[] } {
  const entrada = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const respostas: Respostas = {};
  const faltando: string[] = [];
  for (const p of perguntas) {
    let v = limpo(entrada[p.id], LIMITES_EXTRA.resposta);
    if (p.tipo === "sim_nao" && v !== "sim" && v !== "nao") v = "";
    if (p.tipo === "opcoes" && !p.opcoes.includes(v)) v = "";
    if (p.tipo === "numero" && v) {
      const n = Number(v.replace(",", "."));
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
        return { ok: false, erro: `Responda “${p.nome}” com um número.`, faltando: [p.id] };
      }
      v = String(n);
    }
    if (v) respostas[p.id] = v;
    else if (p.obrigatoria) faltando.push(p.id);
  }
  if (faltando.length) {
    return {
      ok: false,
      erro: faltando.length === 1 ? "Responda à pergunta marcada." : "Responda às perguntas marcadas.",
      faltando,
    };
  }
  return { ok: true, respostas };
}

/** A resposta para ler: "Sim", "Não", "3", "Manhã". Vazio quando não respondeu. */
export function textoDaResposta(p: Pergunta, valor: string | undefined) {
  if (!valor) return "";
  if (p.tipo === "sim_nao") return valor === "sim" ? "Sim" : valor === "nao" ? "Não" : "";
  if (p.tipo === "numero") return Number(valor).toLocaleString("pt-BR");
  return valor;
}

export function respostasDoBanco(valor: unknown): Respostas {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
  return Object.fromEntries(
    Object.entries(valor as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}

// ---------------------------------------------------------------- benefícios a mais

export function lerBeneficiosExtras(valores: unknown[]): { ok: true; lista: string[] } | { ok: false; erro: string } {
  const lista = [...new Set(valores.map((v) => limpo(v, LIMITES_EXTRA.nomeBeneficio + 1)).filter(Boolean))];
  if (lista.length > LIMITES_EXTRA.beneficiosExtras) {
    return { ok: false, erro: `No máximo ${LIMITES_EXTRA.beneficiosExtras} benefícios a mais.` };
  }
  const longo = lista.find((b) => b.length > LIMITES_EXTRA.nomeBeneficio);
  if (longo) return { ok: false, erro: `Encurte “${longo.slice(0, 20)}…”: até ${LIMITES_EXTRA.nomeBeneficio} letras.` };
  return { ok: true, lista };
}

/** Os benefícios escritos à mão nas vagas antigas ("bônus, uniforme") viram itens. */
export function beneficiosAntigos(texto: string | null | undefined) {
  return (texto ?? "")
    .split(/[,;]| e (?=[a-zà-ú])/i)
    .map((b) => b.trim())
    .filter((b) => b.length >= 2)
    .slice(0, LIMITES_EXTRA.beneficiosExtras)
    .map((b) => b.slice(0, LIMITES_EXTRA.nomeBeneficio));
}

// ---------------------------------------------------------------- horário montado

export const ESCALAS = ["5x2", "6x1", "12x36", "5x1", "4x2"] as const;
export type Escala = (typeof ESCALAS)[number];

export const DIAS_SEMANA = [
  { valor: "seg", curto: "Seg", nome: "segunda" },
  { valor: "ter", curto: "Ter", nome: "terça" },
  { valor: "qua", curto: "Qua", nome: "quarta" },
  { valor: "qui", curto: "Qui", nome: "quinta" },
  { valor: "sex", curto: "Sex", nome: "sexta" },
  { valor: "sab", curto: "Sáb", nome: "sábado" },
  { valor: "dom", curto: "Dom", nome: "domingo" },
] as const;
export type DiaSemana = (typeof DIAS_SEMANA)[number]["valor"];
const ORDEM_DIAS = DIAS_SEMANA.map((d) => d.valor) as DiaSemana[];

export type Turno = { inicio: string; fim: string };
export type HorarioDetalhe = { escala: Escala | null; dias: DiaSemana[]; turnos: Turno[]; obs: string };

export const HORARIO_VAZIO: HorarioDetalhe = { escala: null, dias: [], turnos: [], obs: "" };

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function lerHorario(bruto: unknown): { ok: true; horario: HorarioDetalhe | null } | { ok: false; erro: string } {
  if (bruto == null || bruto === "") return { ok: true, horario: null };
  let h: Record<string, unknown>;
  try {
    h = (typeof bruto === "string" ? JSON.parse(bruto) : bruto) as Record<string, unknown>;
  } catch {
    return { ok: false, erro: "Não deu para ler o horário. Tente de novo." };
  }
  if (!h || typeof h !== "object") return { ok: true, horario: null };
  const escala = ESCALAS.includes(h.escala as Escala) ? (h.escala as Escala) : null;
  const dias = ORDEM_DIAS.filter((d) => Array.isArray(h.dias) && h.dias.includes(d));
  const turnos: Turno[] = [];
  for (const t of Array.isArray(h.turnos) ? h.turnos : []) {
    const { inicio, fim } = (t ?? {}) as Record<string, unknown>;
    // linha aberta e deixada em branco: fica de fora
    if (!inicio && !fim) continue;
    if (typeof inicio !== "string" || typeof fim !== "string" || !HORA.test(inicio) || !HORA.test(fim)) {
      return { ok: false, erro: "Preencha o começo e o fim de cada turno." };
    }
    if (inicio === fim) return { ok: false, erro: "O turno precisa começar e terminar em horas diferentes." };
    turnos.push({ inicio, fim });
  }
  if (turnos.length > LIMITES_EXTRA.turnos) return { ok: false, erro: `No máximo ${LIMITES_EXTRA.turnos} turnos.` };
  const obs = limpo(h.obs, LIMITES_EXTRA.obsHorario + 1);
  if (obs.length > LIMITES_EXTRA.obsHorario)
    return { ok: false, erro: `A observação tem até ${LIMITES_EXTRA.obsHorario} letras.` };
  if (!escala && !dias.length && !turnos.length && !obs) return { ok: true, horario: null };
  return { ok: true, horario: { escala, dias, turnos, obs } };
}

export function horarioDoBanco(valor: unknown): HorarioDetalhe | null {
  const r = lerHorario(valor && typeof valor === "object" ? valor : null);
  return r.ok ? r.horario : null;
}

/** "08:00" → "8h"; "08:30" → "8h30". */
function hora(h: string) {
  const [hh, mm] = h.split(":");
  return `${Number(hh)}h${mm === "00" ? "" : mm}`;
}

/** "Seg a sex", "Seg, qua e sex", "Todos os dias". */
export function textoDosDias(dias: DiaSemana[]) {
  if (!dias.length) return "";
  if (dias.length === 7) return "Todos os dias";
  const pos = dias.map((d) => ORDEM_DIAS.indexOf(d)).sort((a, b) => a - b);
  const grupos: number[][] = [];
  for (const p of pos) {
    const g = grupos[grupos.length - 1];
    if (g && p === g[g.length - 1] + 1) g.push(p);
    else grupos.push([p]);
  }
  const curto = (i: number) => DIAS_SEMANA[i].curto.toLowerCase();
  const partes = grupos.flatMap((g) => (g.length >= 3 ? [`${curto(g[0])} a ${curto(g[g.length - 1])}`] : g.map(curto)));
  const juntas = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}` : partes[0];
  return juntas.charAt(0).toUpperCase() + juntas.slice(1);
}

/** O horário numa frase, para a vaga, o cartão e a planilha: "Seg a sex, 8h às 12h e 13h às 17h · Escala 5x2". */
export function textoDoHorario(h: HorarioDetalhe) {
  const turnos = h.turnos.map((t) => `${hora(t.inicio)} às ${hora(t.fim)}`);
  const quando = [
    textoDosDias(h.dias),
    turnos.length > 1 ? `${turnos.slice(0, -1).join(", ")} e ${turnos[turnos.length - 1]}` : turnos[0],
  ]
    .filter(Boolean)
    .join(", ");
  return [quando, h.escala ? `Escala ${h.escala}` : "", h.obs].filter(Boolean).join(" · ");
}
