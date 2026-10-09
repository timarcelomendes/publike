import "server-only";
import { cnpjValido, formatarCnae, limparCnpj, type ConsultaCnpj, type DadosCnpj } from "@/lib/cnpj";

// Consulta de CNPJ na BrasilAPI (grátis, sem chave), que serve os dados
// abertos da Receita Federal. A base é atualizada uma vez por mês: empresa
// aberta há pouco tempo pode ainda não aparecer.
// Nunca guardamos nem mostramos o quadro de sócios, o telefone ou o e-mail
// que vêm na resposta.

const ENDERECO = (process.env.BRASILAPI_URL || "https://brasilapi.com.br").replace(/\/+$/, "");

type RespostaBrasilApi = {
  cnpj?: string;
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

function texto(v: unknown) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function resumir(c: string, d: RespostaBrasilApi): DadosCnpj {
  const situacao = (texto(d.descricao_situacao_cadastral) ?? "DESCONHECIDA").toUpperCase();
  const cnaes = [d.cnae_fiscal, ...(d.cnaes_secundarios ?? []).map((s) => s.codigo)].map((x) =>
    String(x ?? "").replace(/\D/g, "").padStart(7, "0"),
  );
  return {
    cnpj: c,
    razaoSocial: texto(d.razao_social) ?? "",
    nomeFantasia: texto(d.nome_fantasia),
    situacao,
    ativa: situacao === "ATIVA",
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

export async function consultarCnpj(valor: string): Promise<ConsultaCnpj> {
  const c = limparCnpj(valor);
  if (!cnpjValido(c)) return { ok: false, motivo: "invalido" };
  try {
    const resposta = await fetch(`${ENDERECO}/api/cnpj/v1/${c}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (resposta.status === 404) return { ok: false, motivo: "nao_encontrado" };
    if (!resposta.ok) return { ok: false, motivo: "indisponivel" };
    return { ok: true, dados: resumir(c, (await resposta.json()) as RespostaBrasilApi) };
  } catch {
    return { ok: false, motivo: "indisponivel" };
  }
}
