"use server";

import { cnpjValido, limparCnpj, type ConsultaCnpj } from "@/lib/cnpj";
import { MODO_DEMO } from "@/lib/config";
import { obterUsuario } from "@/lib/dados";
import { consultarCnpj } from "@/lib/servidor/brasilapi";
import { criarClienteServidor } from "@/lib/supabase/servidor";

/**
 * Busca os dados públicos do CNPJ para preencher o perfil. Só para quem está logado. Olha primeiro a base da Receita
 * do Publike (as empresas ativas das praças, carregadas todo mês: claude/plano-base-de-empresas-da-receita.md, parte
 * 3) e, sem ela, a BrasilAPI (o MEI, as cidades de fora e as empresas abertas depois da última carga).
 */
export async function buscarDadosCnpj(cnpj: string): Promise<ConsultaCnpj> {
  if (MODO_DEMO || typeof cnpj !== "string") return { ok: false, motivo: "indisponivel" };
  if (!(await obterUsuario())) return { ok: false, motivo: "indisponivel" };
  const c = limparCnpj(cnpj.slice(0, 30));
  if (cnpjValido(c)) {
    const banco = await criarClienteServidor();
    const { data } = await banco.rpc("buscar_empresas_receita", { p_texto: c, p_limite: 1 });
    const e = data?.[0];
    if (e && e.cnpj === c) {
      return {
        ok: true,
        dados: {
          cnpj: c,
          razaoSocial: e.razao_social ?? e.nome,
          nomeFantasia: e.nome,
          situacao: "ATIVA",
          ativa: true,
          atividade: e.ramo,
          cnae: e.cnae,
          agenciaDeEmprego: e.agencia,
          municipio: e.cidade,
          uf: e.uf,
          bairro: e.bairro,
          cep: e.cep,
          logradouro: e.logradouro,
          numero: e.numero,
          abertura: e.data_abertura,
          mei: e.mei,
        },
      };
    }
  }
  return consultarCnpj(cnpj.slice(0, 30));
}
