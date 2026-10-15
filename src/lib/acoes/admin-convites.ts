"use server";

import { refresh } from "next/cache";
import { STATUS_CONVITE, type NovoConvite, type StatusConvite } from "@/lib/convites";
import { mensagemDeErro } from "@/lib/erros";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import type { Resultado } from "@/lib/tipos";
import { UUID } from "@/lib/validacao";

// Convites às empresas: importar a lista, marcar a situação e anotar. Só no admin.

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";
const TEL = /^\d{10,11}$/;

function conferir(n: NovoConvite): NovoConvite | null {
  const nome = String(n?.nome ?? "").trim();
  if (nome.length < 2 || nome.length > 120) return null;
  const lista = (v: unknown, max: number, tam: number) =>
    Array.isArray(v)
      ? v
          .map((x) => String(x).trim().slice(0, tam))
          .filter(Boolean)
          .slice(0, max)
      : [];
  const whatsapp = lista(n.whatsapp, 5, 11).filter((t) => TEL.test(t));
  const telefones = lista(n.telefones, 5, 11).filter((t) => TEL.test(t));
  const email =
    typeof n.email === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(n.email) ? n.email.slice(0, 200) : null;
  return {
    nome,
    tipo: n.tipo === "agencia" ? "agencia" : "empresa",
    vagas: lista(n.vagas, 20, 80),
    whatsapp,
    telefones,
    email,
    observacao: typeof n.observacao === "string" && n.observacao.trim() ? n.observacao.trim().slice(0, 500) : null,
  };
}

/** Importa as empresas do arquivo. Quem já está na lista (mesmo nome) fica como está. */
export async function importarConvites(itens: NovoConvite[]): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!Array.isArray(itens) || !itens.length)
    return { ok: false, erro: "O arquivo não tem nenhuma empresa para importar." };
  if (itens.length > 500) return { ok: false, erro: "São mais de 500 empresas: divida o arquivo em partes." };
  const limpos = itens.map(conferir).filter((n): n is NovoConvite => Boolean(n));

  const { data: atuais, error: erroLer } = await c.from("convites").select("nome");
  if (erroLer)
    return { ok: false, erro: mensagemDeErro(erroLer, "Não deu para ler a lista. A migração dos convites já rodou?") };
  const chave = (s: string) => s.trim().toLowerCase();
  const existentes = new Set((atuais ?? []).map((a) => chave(a.nome)));
  const novos = limpos.filter((n) => !existentes.has(chave(n.nome)));
  if (novos.length) {
    const { error } = await c.from("convites").insert(novos);
    if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para importar agora.") };
  }
  refresh();
  const repetidas = limpos.length - novos.length;
  return {
    ok: true,
    mensagem:
      `${novos.length === 1 ? "1 empresa entrou" : `${novos.length} empresas entraram`} na lista.` +
      (repetidas ? ` ${repetidas === 1 ? "1 já estava" : `${repetidas} já estavam`} e ficaram como estavam.` : ""),
  };
}

/** Muda a situação do convite (e guarda quando foi enviado). */
export async function mudarConvite(id: string, status: StatusConvite): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id) || !STATUS_CONVITE.includes(status)) return { ok: false, erro: "Pedido inválido." };
  const { data: antes } = await c.from("convites").select("status, enviada_em").eq("id", id).maybeSingle();
  if (!antes) return { ok: false, erro: "Este convite não existe mais. Atualize a página." };
  const mudanca: { status: StatusConvite; enviada_em?: string } = { status };
  if (status === "enviada" && !antes.enviada_em) mudanca.enviada_em = new Date().toISOString();
  const { error } = await c.from("convites").update(mudanca).eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}

export async function anotarConvite(id: string, nota: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c
    .from("convites")
    .update({ nota: nota.trim().slice(0, 500) || null })
    .eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  return { ok: true, mensagem: "Anotação salva." };
}

export async function apagarConvite(id: string): Promise<Resultado> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(id)) return { ok: false, erro: "Pedido inválido." };
  const { error } = await c.from("convites").delete().eq("id", id);
  if (error) return { ok: false, erro: mensagemDeErro(error) };
  refresh();
  return { ok: true };
}
