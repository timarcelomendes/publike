// O cliente da agência pede a vaga e acompanha o prazo (migração 20270307120000; claude/plano-pedido-do-cliente-
// convites-e-testes.md, partes 3 e 4). Vale no navegador e no servidor.

export const TOKEN_CLIENTE = /^[0-9a-f]{64}$/;
export const DIAS_UTEIS_DO_PRAZO = 7;

export type SituacaoPedido = "recebido" | "em_selecao" | "finalistas" | "concluido" | "cancelado" | "recusado";

export const NOME_SITUACAO: Record<SituacaoPedido, string> = {
  recebido: "Recebido",
  em_selecao: "Em seleção",
  finalistas: "Finalistas enviados",
  concluido: "Concluído",
  cancelado: "Cancelado",
  recusado: "Recusado",
};

export type VagaDoPedido = {
  id: string;
  titulo: string;
  no_ar: boolean;
  candidatos: number;
  finalistas: number;
  entrevistas: number;
  contratados: number;
  link_finalistas: string | null;
};

export type Pedido = {
  id: string;
  cargo: string;
  quantidade: number;
  salario: string | null;
  horario: string | null;
  local: string | null;
  requisitos: string | null;
  para_quando: string | null;
  observacoes: string | null;
  quem_pediu: string | null;
  situacao: SituacaoPedido;
  motivo: string | null;
  finalistas_ate: string | null;
  finalistas_em: string | null;
  aceito_em: string | null;
  encerrado_em: string | null;
  criado_em: string;
  vaga: VagaDoPedido | null;
  /** só na lista da agência */
  cliente_id?: string;
  cliente?: string;
};

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/** Um pedido que veio do banco (jsonb), conferido. */
export function lerPedido(x: unknown): Pedido | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.cargo !== "string") return null;
  const situacao = (typeof o.situacao === "string" && o.situacao in NOME_SITUACAO ? o.situacao : "recebido") as SituacaoPedido;
  const v = o.vaga && typeof o.vaga === "object" ? (o.vaga as Record<string, unknown>) : null;
  return {
    id: o.id,
    cargo: o.cargo,
    quantidade: Math.max(1, numero(o.quantidade)),
    salario: texto(o.salario),
    horario: texto(o.horario),
    local: texto(o.local),
    requisitos: texto(o.requisitos),
    para_quando: texto(o.para_quando),
    observacoes: texto(o.observacoes),
    quem_pediu: texto(o.quem_pediu),
    situacao,
    motivo: texto(o.motivo),
    finalistas_ate: texto(o.finalistas_ate),
    finalistas_em: texto(o.finalistas_em),
    aceito_em: texto(o.aceito_em),
    encerrado_em: texto(o.encerrado_em),
    criado_em: typeof o.criado_em === "string" ? o.criado_em : new Date(0).toISOString(),
    vaga:
      v && typeof v.id === "string"
        ? {
            id: v.id,
            titulo: typeof v.titulo === "string" ? v.titulo : "",
            no_ar: v.no_ar === true,
            candidatos: numero(v.candidatos),
            finalistas: numero(v.finalistas),
            entrevistas: numero(v.entrevistas),
            contratados: numero(v.contratados),
            link_finalistas: typeof v.link_finalistas === "string" && TOKEN_CLIENTE.test(v.link_finalistas) ? v.link_finalistas : null,
          }
        : null,
    ...(typeof o.cliente_id === "string" ? { cliente_id: o.cliente_id } : {}),
    ...(typeof o.cliente === "string" ? { cliente: o.cliente } : {}),
  };
}

export function lerPedidos(x: unknown): Pedido[] {
  return Array.isArray(x) ? x.flatMap((p) => lerPedido(p) ?? []) : [];
}

/** Dias entre duas datas "AAAA-MM-DD" (b − a). */
export function diasEntre(a: string, b: string) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** "08/11" ou "08/11/2027" (de outro ano). */
export function dataCurta(dia: string, hoje: string) {
  const [a, m, d] = dia.slice(0, 10).split("-");
  return a === hoje.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${a}`;
}

export type Prazo = { texto: string; tom: "bom" | "perto" | "atrasado" | "neutro" };

/**
 * O prazo combinado ("Finalistas até"), em palavras: "No prazo: faltam 3 dias", "Hoje é o último dia", "Atrasado 2
 * dias". Depois dos finalistas: "Saiu no prazo" ou "Saiu 2 dias depois". Sem prazo ou encerrado sem finalistas: null.
 */
export function textoDoPrazo(p: Pick<Pedido, "situacao" | "finalistas_ate" | "finalistas_em">, hoje: string): Prazo | null {
  if (!p.finalistas_ate) return null;
  const ate = p.finalistas_ate.slice(0, 10);
  if (p.finalistas_em) {
    const quando = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(p.finalistas_em));
    const atraso = diasEntre(ate, quando);
    return atraso <= 0
      ? { texto: "Finalistas no prazo", tom: "bom" }
      : { texto: `Finalistas ${atraso === 1 ? "1 dia" : `${atraso} dias`} depois do prazo`, tom: "atrasado" };
  }
  if (p.situacao !== "em_selecao" && p.situacao !== "recebido") return null;
  const faltam = diasEntre(hoje, ate);
  if (faltam < 0) return { texto: `Atrasado ${-faltam === 1 ? "1 dia" : `${-faltam} dias`}`, tom: "atrasado" };
  if (faltam === 0) return { texto: "Hoje é o último dia do prazo", tom: "perto" };
  return { texto: `No prazo: ${faltam === 1 ? "falta 1 dia" : `faltam ${faltam} dias`}`, tom: faltam <= 2 ? "perto" : "bom" };
}

export const MAX_CAMPOS = {
  cargo: 90,
  salario: 80,
  horario: 120,
  local: 160,
  requisitos: 1500,
  observacoes: 1000,
  quem: 80,
} as const;

/** A descrição da vaga que o Publicar já traz preenchida, a partir do pedido. */
export function descricaoDoPedido(p: Pick<Pedido, "requisitos" | "horario" | "salario" | "observacoes" | "quantidade">) {
  const partes = [
    p.requisitos && `Requisitos: ${p.requisitos}`,
    p.horario && `Horário: ${p.horario}`,
    p.salario && `Salário: ${p.salario}`,
    p.quantidade > 1 && `${p.quantidade} vagas.`,
    p.observacoes,
  ].filter(Boolean);
  return partes.join("\n\n");
}

/** N dias úteis (de segunda a sexta) depois de "AAAA-MM-DD" (o mesmo de privado.dias_uteis_depois). */
export function diasUteisDepois(dia: string, dias: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  let n = 0;
  while (n < dias) {
    d.setUTCDate(d.getUTCDate() + 1);
    const semana = d.getUTCDay();
    if (semana !== 0 && semana !== 6) n++;
  }
  return d.toISOString().slice(0, 10);
}

/** O link do cliente no site. */
export function urlDoLinkDoCliente(site: string, token: string) {
  return `${site.replace(/\/+$/, "")}/cliente/${token}`;
}
