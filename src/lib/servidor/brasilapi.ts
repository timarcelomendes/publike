import "server-only";
import { cnpjValido, formatarCnae, limparCnpj, type ConsultaCnpj, type DadosCnpj } from "@/lib/cnpj";

// Consulta de CNPJ nos dados abertos da Receita Federal, de graça e sem chave:
//   1. BrasilAPI (brasilapi.com.br), que lê a base do Minha Receita;
//   2. se ela falhar ou não achar, a API pública do CNPJ.ws (até 3 consultas
//      por minuto por servidor).
// As bases são atualizadas uma vez por mês: empresa aberta há pouco tempo pode
// ainda não aparecer. Nunca guardamos nem mostramos o quadro de sócios, o
// telefone ou o e-mail que vêm nas respostas.

const BRASILAPI = (process.env.BRASILAPI_URL || "https://brasilapi.com.br").replace(/\/+$/, "");
const CNPJ_WS = (process.env.CNPJ_WS_URL || "https://publica.cnpj.ws").replace(/\/+$/, "");

type RespostaBrasilApi = {
  razao_social?: string;
  nome_fantasia?: string | null;
  descricao_situacao_cadastral?: string | null;
  cnae_fiscal?: number | string | null;
  cnae_fiscal_descricao?: string | null;
  cnaes_secundarios?: { codigo?: number | string }[] | null;
  municipio?: string | null;
  uf?: string | null;
  bairro?: string | null;
  data_inicio_atividade?: string | null;
  opcao_pelo_mei?: boolean | null;
};

type AtividadeCnpjWs = { id?: string; subclasse?: string; descricao?: string };
type RespostaCnpjWs = {
  razao_social?: string;
  simples?: { mei?: string | null } | null;
  estabelecimento?: {
    nome_fantasia?: string | null;
    situacao_cadastral?: string | null;
    atividade_principal?: AtividadeCnpjWs | null;
    atividades_secundarias?: AtividadeCnpjWs[] | null;
    cidade?: { nome?: string } | null;
    estado?: { sigla?: string } | null;
    bairro?: string | null;
    data_inicio_atividade?: string | null;
  } | null;
};

function texto(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function situacao(v: unknown) {
  return (texto(v) ?? "DESCONHECIDA").toUpperCase();
}

function daBrasilApi(c: string, d: RespostaBrasilApi): DadosCnpj {
  const cnaes = [d.cnae_fiscal, ...(d.cnaes_secundarios ?? []).map((s) => s.codigo)].map((x) =>
    String(x ?? "").replace(/\D/g, "").padStart(7, "0"),
  );
  const s = situacao(d.descricao_situacao_cadastral);
  return {
    cnpj: c,
    razaoSocial: texto(d.razao_social) ?? "",
    nomeFantasia: texto(d.nome_fantasia),
    situacao: s,
    ativa: s === "ATIVA",
    atividade: texto(d.cnae_fiscal_descricao),
    cnae: formatarCnae(d.cnae_fiscal),
    agenciaDeEmprego: cnaes.some((x) => x.startsWith("78")),
    municipio: texto(d.municipio),
    uf: texto(d.uf),
    bairro: texto(d.bairro),
    abertura: texto(d.data_inicio_atividade),
    mei: d.opcao_pelo_mei === true,
  };
}

function doCnpjWs(c: string, d: RespostaCnpjWs): DadosCnpj {
  const e = d.estabelecimento ?? {};
  const principal = e.atividade_principal ?? null;
  const atividades = [principal, ...(e.atividades_secundarias ?? [])];
  const s = situacao(e.situacao_cadastral);
  return {
    cnpj: c,
    razaoSocial: texto(d.razao_social) ?? "",
    nomeFantasia: texto(e.nome_fantasia),
    situacao: s,
    ativa: s === "ATIVA",
    atividade: texto(principal?.descricao),
    cnae: texto(principal?.subclasse) ?? formatarCnae(principal?.id),
    agenciaDeEmprego: atividades.some((a) => String(a?.id ?? "").replace(/\D/g, "").startsWith("78")),
    municipio: texto(e.cidade?.nome),
    uf: texto(e.estado?.sigla),
    bairro: texto(e.bairro),
    abertura: texto(e.data_inicio_atividade),
    mei: texto(d.simples?.mei)?.toLowerCase() === "sim",
  };
}

async function buscar<T>(url: string): Promise<{ status: number; corpo: T | null }> {
  try {
    const r = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    return { status: r.status, corpo: r.ok ? ((await r.json()) as T) : null };
  } catch {
    return { status: 0, corpo: null };
  }
}

// O formulário consulta enquanto a pessoa digita e o servidor confere de novo
// ao salvar: guardar a resposta por uma hora poupa as duas APIs.
const LEMBRANCA = new Map<string, { quando: number; consulta: ConsultaCnpj }>();
const UMA_HORA = 3600 * 1000;

export async function consultarCnpj(valor: string): Promise<ConsultaCnpj> {
  const c = limparCnpj(valor);
  if (!cnpjValido(c)) return { ok: false, motivo: "invalido" };
  const guardada = LEMBRANCA.get(c);
  if (guardada && Date.now() - guardada.quando < UMA_HORA) return guardada.consulta;

  let consulta: ConsultaCnpj;
  const brasil = await buscar<RespostaBrasilApi>(`${BRASILAPI}/api/cnpj/v1/${c}`);
  if (brasil.corpo) {
    consulta = { ok: true, dados: daBrasilApi(c, brasil.corpo) };
  } else {
    // a BrasilAPI caiu ou não tem o CNPJ: tenta a outra base
    const ws = await buscar<RespostaCnpjWs>(`${CNPJ_WS}/cnpj/${c}`);
    if (ws.corpo) consulta = { ok: true, dados: doCnpjWs(c, ws.corpo) };
    else if (brasil.status === 404 && (ws.status === 404 || ws.status === 400)) consulta = { ok: false, motivo: "nao_encontrado" };
    else if (brasil.status === 404) consulta = { ok: false, motivo: "nao_encontrado" };
    else consulta = { ok: false, motivo: "indisponivel" };
  }
  // "indisponível" não fica guardado: na próxima tentativa, consulta de novo
  if (consulta.ok || consulta.motivo === "nao_encontrado") {
    if (LEMBRANCA.size > 500) LEMBRANCA.clear();
    LEMBRANCA.set(c, { quando: Date.now(), consulta });
  }
  return consulta;
}
