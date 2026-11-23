"use server";

import { randomBytes } from "node:crypto";
import { type EmpresaEsperando, empresasComGenteEsperando, empresasEsperandoPeloBanco, type PessoaEsperando } from "@/lib/admin/dados";
import { mensagemDeErro } from "@/lib/erros";
import { tempoRelativo } from "@/lib/formato";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { possoVerTela } from "@/lib/servidor/telas-do-admin";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";
import { linkDoAceite } from "@/lib/whatsapp-oficial";

const FORA = "Só a equipe do Publike usa esta tela.";

/** No site no ar, a equipe publike.org (migração 20270915130000): o cliente de quem entrou, e as funções `equipe_*`. */
async function clienteDaEquipe() {
  return (await possoVerTela("/admin/esperando")) ? await criarClienteServidor() : null;
}

/**
 * A mensagem para a empresa com gente esperando (Admin › Esperando): quem curtiu e espera o aceite, quem
 * deu match e ainda não recebeu mensagem, e o link para responder. Conta sem e-mail de login (nunca
 * entrou): o link de acesso (/acesso/<token>, 30 dias), como no "Mandar acesso pelo WhatsApp"; com
 * e-mail, a caixa de entrada (entra como sempre). O admin manda pelo próprio WhatsApp.
 */
export async function mensagemParaEmpresaEsperando(
  contaId: string,
): Promise<{ ok: true; whatsapp: string | null; mensagem: string } | { ok: false; erro: string }> {
  if (!UUID.test(contaId)) return { ok: false, erro: "Pedido inválido." };
  const c = await clienteAdminOuNulo();
  const equipe = c ? null : await clienteDaEquipe();
  if (!c && !equipe) return { ok: false, erro: FORA };
  const agora = Date.now();
  const [empresa] = await (c
    ? empresasComGenteEsperando(c, agora, contaId)
    : empresasEsperandoPeloBanco(equipe!, contaId).then((l): EmpresaEsperando[] => l ?? [])
  ).catch((): EmpresaEsperando[] => []);
  if (!empresa) return { ok: false, erro: "Ninguém está esperando esta empresa agora. Atualize a página." };

  const site = urlDosEmails() ?? "https://publike.org";
  let link = `${site}/painel/caixa${empresa.esperando.length ? "?aba=novos" : ""}`;
  let comoEntrar = "Para ver os currículos e responder:";
  // a conta sem e-mail (nunca entrou pelo site): o link de acesso, como no "Mandar acesso pelo WhatsApp"
  let token: string | null = null;
  if (c) {
    const { data: u } = await c.auth.admin.getUserById(contaId);
    if (u?.user && !u.user.email) {
      token = randomBytes(32).toString("hex");
      const { error } = await c.from("acessos_conta").insert({ token, perfil_id: contaId });
      if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para gerar o link de acesso.") };
    }
  } else {
    const { data, error } = await equipe!.rpc("equipe_link_de_acesso_esperando", { p_conta: contaId });
    if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para gerar o link de acesso.") };
    token = data ?? null;
  }
  if (token) {
    link = `${site}/acesso/${token}`;
    comoEntrar =
      "Para ver os currículos e responder, abra este link e coloque o e-mail da empresa (é por ele que vocês entram, sem senha; o link vale 30 dias):";
  }

  const linha = (p: PessoaEsperando, verbo: string) =>
    `• ${p.nome}, na vaga de ${p.vaga} (${verbo} ${tempoRelativo(p.desde, agora)})`;
  const partes = [`Olá, pessoal da ${empresa.nome}! Aqui é do Publike.`];
  if (empresa.esperando.length) {
    partes.push(
      `${empresa.esperando.length === 1 ? "Tem 1 pessoa esperando" : `Tem ${empresa.esperando.length} pessoas esperando`} a resposta de vocês:\n${empresa.esperando.map((p) => linha(p, "curtiu")).join("\n")}`,
    );
  }
  if (empresa.semConversa.length) {
    partes.push(
      `${empresa.semConversa.length === 1 ? "Deu match com 1 pessoa, que espera" : `Deu match com ${empresa.semConversa.length} pessoas, que esperam`} o contato de vocês:\n${empresa.semConversa.map((p) => linha(p, "deu match")).join("\n")}`,
    );
  }
  partes.push(`${comoEntrar}\n${link}`);
  // o aceite pela conversa (migração 20270915120000): um toque e os próximos candidatos chegam pelo WhatsApp
  partes.push(`Para receber os próximos candidatos direto no WhatsApp, toque aqui e envie a mensagem:\n${linkDoAceite()}`);
  partes.push("Qualquer dúvida, é só responder aqui.");
  return { ok: true, whatsapp: empresa.whatsapp, mensagem: partes.join("\n\n") };
}

/**
 * A equipe abriu o WhatsApp (ou copiou a mensagem) para a empresa: guarda a hora, para a lista mostrar
 * "avisada há…" e ninguém mandar de novo sem querer. Sem a migração 20261121120000, só avisa que não guardou.
 */
export async function marcarEmpresaAvisada(
  contaId: string,
  pessoas: number,
): Promise<{ ok: true; avisadaEm: string } | { ok: false; erro: string }> {
  if (!UUID.test(contaId)) return { ok: false, erro: "Pedido inválido." };
  const c = await clienteAdminOuNulo();
  const equipe = c ? null : await clienteDaEquipe();
  if (!c && !equipe) return { ok: false, erro: FORA };
  const args = { p_conta: contaId, p_pessoas: Math.max(0, Math.round(pessoas) || 0) };
  const { data, error } = c
    ? await c.rpc("admin_marcar_empresa_avisada", args)
    : await equipe!.rpc("equipe_marcar_empresa_avisada", args);
  if (error || !data) {
    return {
      ok: false,
      erro: mensagemDeErro(error, "Não deu para guardar o aviso (falta a migração 20261121120000?)."),
    };
  }
  return { ok: true, avisadaEm: data };
}
