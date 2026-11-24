"use server";

import { refresh } from "next/cache";
import { after } from "next/server";
import { mensagemDeErro } from "@/lib/erros";
import { processarFilas } from "@/lib/servidor/filas";
import { acessoDaEquipe } from "@/lib/supabase/admin";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// A promoção de lançamento (migração 20270918120000; Admin › Recursos pagos): a equipe publike.org libera os recursos
// pagos de uma conta até uma data, sem custo, e tira quando quiser. No computador do dono, pela chave secreta; no
// site no ar, pelo login de quem é da equipe (as funções `equipe_*` conferem).

const TELA = "/admin/recursos-pagos";
const FORA = "Só a equipe do Publike usa esta tela.";
const RECURSOS = ["copiloto", "testes", "video", "automacoes", "salarios"];
const NOME: Record<string, string> = {
  copiloto: "Triagem com IA",
  testes: "Teste Prático",
  video: "Entrevista em vídeo",
  automacoes: "Automações",
  salarios: "Consulta de salários",
};

export type ContaAchada = {
  id: string;
  nome: string;
  tipo: string;
  email: string | null;
  cnpj: string | null;
  /** os recursos que a conta já usa agora (migração 20270918130000; sem ela, vazio) */
  ja_tem?: string[] | null;
};

export async function buscarContasDaPromocao(
  busca: string,
): Promise<{ ok: true; contas: ContaAchada[] } | { ok: false; erro: string }> {
  const acesso = await acessoDaEquipe(TELA);
  if (!acesso) return { ok: false, erro: FORA };
  const q = String(busca ?? "")
    .trim()
    .slice(0, 80);
  if (q.length < 2) return { ok: true, contas: [] };
  const { data, error } = await acesso.cliente.rpc("equipe_buscar_contas", {
    p_busca: q,
  });
  if (error) {
    if (error.code === "PGRST202")
      return {
        ok: false,
        erro: "Rode antes a migração 20270918120000_promocao_de_lancamento.sql.",
      };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  return { ok: true, contas: (data ?? []) as ContaAchada[] };
}

const MOTIVO: Record<string, string> = {
  assina: "já assina",
  sem_prazo: "já tem sem prazo",
  ate_mais_tarde: "já tem até mais tarde",
};

export async function liberarPromocao(
  contaId: string,
  recursos: string[],
  ate: string,
): Promise<Resultado> {
  const acesso = await acessoDaEquipe(TELA);
  if (!acesso) return { ok: false, erro: FORA };
  const lista = Array.isArray(recursos)
    ? recursos.filter((r) => RECURSOS.includes(r))
    : [];
  if (!UUID.test(contaId)) return { ok: false, erro: "Escolha a conta." };
  if (!lista.length) return { ok: false, erro: "Escolha ao menos um recurso." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ate))
    return { ok: false, erro: "Escolha a data de fim." };
  const { data, error } = await acesso.cliente.rpc("equipe_liberar_promocao", {
    p_conta: contaId,
    p_recursos: lista,
    p_ate: ate,
  });
  if (error) {
    if (error.code === "PGRST202")
      return {
        ok: false,
        erro: "Rode antes a migração 20270918120000_promocao_de_lancamento.sql.",
      };
    return { ok: false, erro: mensagemDeErro(error) };
  }
  const r = data as {
    liberados: string[];
    pulados: { recurso: string; motivo: string }[];
  };
  // o aviso no sino já está gravado; o e-mail e o celular saem pelas filas
  if (r.liberados.length) after(processarFilas);
  refresh();
  const [a, m, d] = ate.split("-");
  const pulados = r.pulados.map(
    (p) => `${NOME[p.recurso] ?? p.recurso} (${MOTIVO[p.motivo] ?? p.motivo})`,
  );
  if (!r.liberados.length)
    return { ok: false, erro: `Nada mudou: ${pulados.join(", ")}.` };
  return {
    ok: true,
    mensagem:
      `Liberado até ${d}/${m}/${a}: ${r.liberados.map((x) => NOME[x] ?? x).join(", ")}. A conta recebeu o aviso.` +
      (pulados.length ? ` Ficaram como estavam: ${pulados.join(", ")}.` : ""),
  };
}

export async function tirarPromocao(
  contaId: string,
  recurso: string,
): Promise<Resultado> {
  const acesso = await acessoDaEquipe(TELA);
  if (!acesso) return { ok: false, erro: FORA };
  if (!UUID.test(contaId) || !RECURSOS.includes(recurso))
    return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await acesso.cliente.rpc("equipe_tirar_promocao", {
    p_conta: contaId,
    p_recurso: recurso,
  });
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return data
    ? { ok: true, mensagem: "A promoção acabou agora." }
    : { ok: false, erro: "Essa liberação não é da promoção." };
}
