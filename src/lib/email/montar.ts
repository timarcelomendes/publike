// Monta o e-mail (assunto, HTML e texto) a partir do modelo editado no admin.
// Sem dependências do servidor: o admin usa a mesma função na prévia.

export type ModeloEmail = {
  modelo: string;
  grupo: string;
  assunto: string;
  corpo: string;
  botao: string | null;
};

export type EmailMontado = { assunto: string; html: string; texto: string };

const VARIAVEL = /\{\{\s*([a-z_]+)\s*\}\}/g;

const CORES = {
  fundo: "#fbf7ef",
  cartao: "#ffffff",
  linha: "#e3d9c8",
  tinta: "#1f1a14",
  apagado: "#6b6052",
  terra: "#c2410c",
};

/**
 * Logo no topo dos e-mails: uma plaquinha creme (a cor do fundo do e-mail),
 * sempre com 44 px de altura; a imagem tem 3x esse tamanho, para ficar nítida
 * no celular. Sem imagem própria escolhida no admin, vale a do Publike.
 */
export const LOGO_EMAIL = {
  altura: 44,
  larguraMaxima: 240,
  escala: 3,
  caminhoPadrao: "/logo/publike-logo-email.png",
  /** Imagem enviada no admin: até 800 KB (o limite das ações do servidor é 1 MB). */
  arquivoMaximo: 800 * 1024,
} as const;

/** A logo do Publike, servida pelo próprio site. */
export function logoPadraoDoEmail(siteUrl: string) {
  return `${siteUrl.replace(/\/+$/, "")}${LOGO_EMAIL.caminhoPadrao}`;
}

export function escaparHtml(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Valores das variáveis como texto (o link é montado com o endereço do site). */
export function valoresDoEmail(dados: unknown, siteUrl: string): Record<string, string> {
  const valores: Record<string, string> = {};
  if (dados && typeof dados === "object" && !Array.isArray(dados)) {
    for (const [chave, valor] of Object.entries(dados as Record<string, unknown>)) {
      if (valor == null) continue;
      valores[chave] = typeof valor === "string" ? valor : String(valor);
    }
  }
  const caminho =
    valores.caminho && valores.caminho.startsWith("/") && !valores.caminho.startsWith("//") ? valores.caminho : "/";
  valores.link = `${siteUrl.replace(/\/+$/, "")}${caminho}`;
  return valores;
}

function preencher(texto: string, valores: Record<string, string>) {
  return texto.replace(VARIAVEL, (_, nome: string) => valores[nome] ?? "");
}

/** Parágrafo com variável vazia some (ex.: "Motivo: {{motivo}}" sem motivo). */
function paragrafos(corpo: string, valores: Record<string, string>) {
  return corpo
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => {
      const usadas = [...p.matchAll(VARIAVEL)].map((m) => m[1]);
      return usadas.every((nome) => (valores[nome] ?? "").trim() !== "");
    })
    .map((p) => preencher(p, valores));
}

function rodape(modelo: ModeloEmail, siteUrl: string) {
  const site = siteUrl.replace(/\/+$/, "");
  if (modelo.grupo === "equipe")
    return "Aviso para a equipe do Publike. Quem recebe estes avisos é escolhido no admin.";
  if (modelo.grupo === "sistema") return "Mensagem de teste enviada pelo admin do Publike.";
  if (modelo.modelo.startsWith("conta_")) return "Este é um aviso sobre a sua conta no Publike.";
  return `Você recebeu este aviso porque tem uma conta no Publike. Para não receber mais avisos por e-mail, desmarque a opção no seu perfil: ${site}/perfil`;
}

/**
 * `logo`: endereço da imagem do topo (null = só o nome, em texto). Precisa ser
 * um endereço público: o e-mail é aberto no celular de quem recebe.
 */
export function montarEmail(
  modelo: ModeloEmail,
  dados: unknown,
  siteUrl: string,
  logo: string | null = null,
): EmailMontado {
  const valores = valoresDoEmail(dados, siteUrl);
  // assunto numa linha só (nada de quebra de linha no cabeçalho)
  const assunto = preencher(modelo.assunto, valores).replace(/\s+/g, " ").trim().slice(0, 200);
  const partes = paragrafos(modelo.corpo, valores);
  const botao = modelo.botao?.trim() ? preencher(modelo.botao, valores).trim() : null;
  const link = valores.link;
  const textoRodape = rodape(modelo, siteUrl);

  const texto = [...partes, botao ? `${botao}: ${link}` : null, "—", textoRodape].filter(Boolean).join("\n\n");

  const htmlParagrafos = partes
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${CORES.tinta};">${escaparHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
  const htmlBotao = botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr><td style="border-radius:8px;background:${CORES.terra};">` +
      `<a href="${escaparHtml(link)}" style="display:inline-block;padding:12px 20px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escaparHtml(botao)}</a>` +
      `</td></tr></table>`
    : "";

  // Com a imagem bloqueada (Outlook no computador), aparece o texto "Publike".
  const cabecalho =
    logo && /^https?:\/\/[^\s"'<>\\]+$/.test(logo)
      ? `<tr><td style="padding:0 0 14px;"><img src="${escaparHtml(logo)}" alt="Publike" height="${LOGO_EMAIL.altura}" ` +
        `style="display:block;height:${LOGO_EMAIL.altura}px;width:auto;max-width:${LOGO_EMAIL.larguraMaxima}px;border:0;outline:none;text-decoration:none;font-size:22px;font-weight:800;color:${CORES.tinta};"></td></tr>`
      : `<tr><td style="padding:0 4px 16px;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:${CORES.tinta};">Publike<span style="color:${CORES.terra};">.</span></td></tr>`;

  const html = `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escaparHtml(assunto)}</title></head>
<body style="margin:0;padding:0;background:${CORES.fundo};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CORES.fundo};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
${cabecalho}
<tr><td style="background:${CORES.cartao};border:1px solid ${CORES.linha};border-radius:12px;padding:28px 24px;">
${htmlParagrafos}${htmlBotao}
</td></tr>
<tr><td style="padding:16px 4px 0;font-size:13px;line-height:1.5;color:${CORES.apagado};">${escaparHtml(textoRodape)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { assunto, html, texto };
}

/** Dados de exemplo para a prévia no admin. */
export const EXEMPLOS_EMAIL: Record<string, string> = {
  nome: "Ana",
  quem: "Bruno Silva",
  titulo: "Auxiliar de cozinha para a noite",
  motivo: "O anúncio pedia pagamento para a pessoa se cadastrar.",
  ate: "15/10/2026 às 14:30",
  total: "2",
  tipo: "comércio",
  cidade: "Goiânia",
  origem: "o anúncio recebeu denúncias de três pessoas diferentes.",
  quando: "08/10/2026 às 13:00",
  caminho: "/painel",
};
