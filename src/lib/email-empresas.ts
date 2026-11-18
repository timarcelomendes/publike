// O e-mail às empresas (18/11/2026; migração 20270722120000): o texto que o Admin escreve vira um e-mail com cara de
// e-mail de gente (sem layout de newsletter, que cai mais no spam), com o botão "Sim, podem publicar", a assinatura e
// o "Não quero receber" no fim. Usado pelo robô e pela prévia do Admin (por isso fica fora do servidor).

export const PUBLICOS_EMAIL_EMPRESAS = {
  publike: {
    nome: "Contas do Publike",
    ajuda: "Contas de quem contrata, sem vaga no ar e com os e-mails ligados.",
  },
  agencias: { nome: "Agências da Receita", ajuda: "Agências de emprego de Goiás que ainda não têm conta no Publike." },
  abriram: {
    nome: "Abriram perto",
    ajuda: "Empresas abertas na região nos últimos 90 dias, sem conta no Publike (o MEI fica de fora).",
  },
} as const;
export type PublicoEmailEmpresas = keyof typeof PUBLICOS_EMAIL_EMPRESAS;

/** O endereço do botão (o sim) e o do "não quero receber". */
export const linkDaResposta = (site: string, token: string, sair = false) =>
  `${site}/empresas/resposta/${token}${sair ? "?sair=1" : ""}`;

/** O endereço do "parar de receber" de um toque (Gmail e Yahoo). */
export const linkDeSairUmToque = (site: string, token: string) => `${site}/api/email-empresas/sair?t=${token}`;

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** O nome da empresa no lugar de {empresa}. */
export function comEmpresa(texto: string, empresa: string) {
  return texto.replace(/\{empresa\}/g, empresa.trim() || "sua empresa");
}

/** O e-mail pronto: o assunto, o texto puro e o HTML. */
export function montarEmailEmpresas(
  { assunto, texto, remetenteNome }: { assunto: string; texto: string; remetenteNome: string },
  { empresa, token, site }: { empresa: string; token: string; site: string },
) {
  const sim = linkDaResposta(site, token);
  const sair = linkDaResposta(site, token, true);
  const corpo = comEmpresa(texto, empresa).trim();
  // a assinatura: o primeiro nome do remetente ("Marcelo, do Publike" vira "Marcelo")
  const quem = remetenteNome.split(",")[0].trim() || "Equipe";
  const paragrafos = corpo.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#1f1b16">
${paragrafos.map((p) => `<p style="margin:0 0 14px">${escapar(p).replace(/\n/g, "<br>")}</p>`).join("\n")}
<p style="margin:20px 0"><a href="${sim}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#1f1b16;color:#ffffff;text-decoration:none;font-weight:bold">Sim, podem publicar</a></p>
<p style="margin:0 0 14px">${escapar(quem)}<br>Publike · <a href="${site}" style="color:#1f1b16">publike.org</a></p>
<p style="margin:24px 0 0;font-size:12px;color:#6b6259">Não quer receber? <a href="${sair}" style="color:#6b6259">Não quero receber</a>.</p>
</body></html>`;
  const textoPuro = `${corpo}

Sim, podem publicar: ${sim}

${quem}
Publike · ${site.replace(/^https?:\/\//, "")}

Não quer receber? ${sair}`;
  return { assunto: comEmpresa(assunto, empresa), texto: textoPuro, html };
}
