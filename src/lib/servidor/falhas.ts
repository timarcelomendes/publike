import "server-only";
import { unstable_rethrow } from "next/navigation";
import { headers } from "next/headers";
import { after } from "next/server";
import { MENSAGEM_DEMO, MODO_DEMO } from "@/lib/config";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import type { EstadoForm } from "@/lib/tipos";
import type { EtapaFalha, OndeFalha } from "@/lib/falhas";

// Falhas ao publicar vaga e ao salvar currículo: ficam em privado.falhas_cadastro e o banco
// avisa a equipe por e-mail (erro do sistema na hora; erro de preenchimento quando a pessoa
// trava). Registrar nunca atrasa a resposta nem vira outro erro para a pessoa.

type ErroBanco = { code?: string; message?: string; hint?: string | null; details?: string | null } | null | undefined;

export type DadosFalha = {
  onde: OndeFalha;
  etapa: EtapaFalha;
  /** o que a pessoa viu */
  mensagem: string;
  /** o erro técnico */
  detalhe?: string | null;
  codigo?: string | null;
  campos?: string[];
  pagina?: string | null;
};

/** Mensagens que o próprio banco escreve para a pessoa (regra do Publike, não pane). */
const CODIGOS_DE_REGRA = new Set(["P0001", "P0002", "22023"]);

export function textoDoErro(e: unknown) {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 1000);
  return String(e).slice(0, 1000);
}

/** Só o caminho da página (sem o domínio e sem a busca, que pode ter dado pessoal). */
function soCaminho(endereco: string | null) {
  if (!endereco) return null;
  try {
    return new URL(endereco).pathname.slice(0, 300);
  } catch {
    return endereco.split("?")[0].slice(0, 300);
  }
}

/**
 * Registra a falha depois de responder (com after()). O cliente do banco e os cabeçalhos são
 * lidos agora, ainda dentro do pedido.
 */
export async function registrarFalha(d: DadosFalha) {
  if (MODO_DEMO) return;
  try {
    const h = await headers();
    const supabase = await criarClienteServidor();
    const pagina = d.pagina ?? soCaminho(h.get("referer"));
    const navegador = h.get("user-agent")?.slice(0, 300) ?? null;
    after(async () => {
      try {
        const { error } = await supabase.rpc("registrar_falha_cadastro", {
          p_onde: d.onde,
          p_etapa: d.etapa,
          p_mensagem: d.mensagem.slice(0, 500),
          p_detalhe: d.detalhe?.slice(0, 1000) ?? undefined,
          p_codigo: d.codigo?.slice(0, 60) ?? undefined,
          p_campos: (d.campos ?? []).slice(0, 40),
          p_pagina: pagina ?? undefined,
          p_navegador: navegador ?? undefined,
        });
        if (error) console.warn(`Publike: não deu para registrar a falha (${d.onde}/${d.etapa}): ${error.message}`);
      } catch (e) {
        console.warn("Publike: não deu para registrar a falha:", textoDoErro(e));
      }
    });
  } catch (e) {
    console.warn("Publike: não deu para registrar a falha:", textoDoErro(e));
  }
}

/** O que a ação conta ao vigia antes de devolver o erro (o resto ele descobre sozinho). */
export type Vigia = {
  /** erro do banco: guarda o código e o texto técnico */
  banco: (erro: ErroBanco) => void;
  /** outra causa (arquivo, leitura, preenchimento) */
  marcar: (etapa: EtapaFalha, detalhe?: string) => void;
  /** a vaga ou o currículo salvou, mas uma parte não (registra sem mudar a resposta) */
  parcial: (mensagem: string, erro: ErroBanco) => void;
};

export const ERRO_INESPERADO =
  "Não deu para salvar agora. A equipe do Publike já foi avisada. Tente de novo em instantes.";

/**
 * Roda a ação de salvar e registra qualquer falha: o erro devolvido ao formulário (preenchimento,
 * banco, arquivo) e o erro que estourou no meio (vira um aviso na tela, nunca a página de erro).
 * O redirect do sucesso passa direto.
 */
export async function vigiar(onde: OndeFalha, executar: (vigia: Vigia) => Promise<EstadoForm>): Promise<EstadoForm> {
  const marca: { etapa?: EtapaFalha; detalhe?: string; codigo?: string } = {};
  const vigia: Vigia = {
    banco(erro) {
      marca.codigo = erro?.code;
      marca.etapa = erro?.code && CODIGOS_DE_REGRA.has(erro.code) ? "validacao" : "banco";
      marca.detalhe = [erro?.code, erro?.message, erro?.details, erro?.hint && `hint: ${erro.hint}`]
        .filter(Boolean)
        .join(" · ");
    },
    marcar(etapa, detalhe) {
      marca.etapa = etapa;
      if (detalhe) marca.detalhe = detalhe;
    },
    parcial(mensagem, erro) {
      void registrarFalha({
        onde,
        etapa: "banco",
        mensagem,
        codigo: erro?.code,
        detalhe: [erro?.code, erro?.message, erro?.hint && `hint: ${erro.hint}`].filter(Boolean).join(" · "),
      });
    },
  };

  let resultado: EstadoForm;
  try {
    resultado = await executar(vigia);
  } catch (e) {
    // redirect e notFound seguem; o resto vira aviso na tela e chega à equipe
    unstable_rethrow(e);
    console.error(`Publike: erro inesperado ao salvar (${onde}):`, e);
    await registrarFalha({ onde, etapa: "inesperado", mensagem: ERRO_INESPERADO, detalhe: textoDoErro(e) });
    return { ok: false, erro: ERRO_INESPERADO };
  }

  if (!resultado.ok && resultado.erro !== MENSAGEM_DEMO) {
    const campos = Object.keys(resultado.erros ?? {});
    await registrarFalha({
      onde,
      etapa: marca.etapa ?? (campos.length ? "validacao" : "banco"),
      mensagem: resultado.erro ?? "(sem mensagem)",
      detalhe:
        marca.detalhe ??
        (campos.length
          ? Object.entries(resultado.erros ?? {})
              .map(([campo, msg]) => `${campo}: ${msg}`)
              .join(" | ")
          : null),
      codigo: marca.codigo,
      campos,
    });
  }
  return resultado;
}
