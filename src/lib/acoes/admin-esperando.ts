"use server";

import { randomBytes } from "node:crypto";
import { empresasComGenteEsperando, type PessoaEsperando } from "@/lib/admin/dados";
import { mensagemDeErro } from "@/lib/erros";
import { tempoRelativo } from "@/lib/formato";
import { urlDosEmails } from "@/lib/servidor/ambiente";
import { clienteAdminOuNulo } from "@/lib/supabase/admin";
import { UUID } from "@/lib/validacao";

const FORA = "O admin só funciona no seu computador, com o site rodando em modo de desenvolvimento.";

/**
 * A mensagem para a empresa com gente esperando (Admin › Esperando): quem curtiu e espera o aceite, quem
 * deu match e ainda não recebeu mensagem, e o link para responder. Conta sem e-mail de login (nunca
 * entrou): o link de acesso (/acesso/<token>, 30 dias), como no "Mandar acesso pelo WhatsApp"; com
 * e-mail, a caixa de entrada (entra como sempre). O admin manda pelo próprio WhatsApp.
 */
export async function mensagemParaEmpresaEsperando(
  contaId: string,
): Promise<{ ok: true; whatsapp: string | null; mensagem: string } | { ok: false; erro: string }> {
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(contaId)) return { ok: false, erro: "Pedido inválido." };
  const agora = Date.now();
  const [empresa] = await empresasComGenteEsperando(c, agora, contaId).catch(() => []);
  if (!empresa) return { ok: false, erro: "Ninguém está esperando esta empresa agora. Atualize a página." };

  const site = urlDosEmails() ?? "https://publike.org";
  const { data: u } = await c.auth.admin.getUserById(contaId);
  let link = `${site}/painel/caixa${empresa.esperando.length ? "?aba=responder" : ""}`;
  let comoEntrar = "Para ver os currículos e responder:";
  if (u?.user && !u.user.email) {
    const token = randomBytes(32).toString("hex");
    const { error } = await c.from("acessos_conta").insert({ token, perfil_id: contaId });
    if (error) return { ok: false, erro: mensagemDeErro(error, "Não deu para gerar o link de acesso.") };
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
  const c = await clienteAdminOuNulo();
  if (!c) return { ok: false, erro: FORA };
  if (!UUID.test(contaId)) return { ok: false, erro: "Pedido inválido." };
  const { data, error } = await c.rpc("admin_marcar_empresa_avisada", {
    p_conta: contaId,
    p_pessoas: Math.max(0, Math.round(pessoas) || 0),
  });
  if (error || !data) {
    return {
      ok: false,
      erro: mensagemDeErro(error, "Não deu para guardar o aviso (falta a migração 20261121120000?)."),
    };
  }
  return { ok: true, avisadaEm: data };
}
