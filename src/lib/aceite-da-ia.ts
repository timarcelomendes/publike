// O aceite da IA (25/11/2026; Marcelo: "tem como adicionar um aceite no whatsapp, sem travar?"; migração
// 20271001120000): os textos e a leitura da conversa, sem nada do servidor (os testes usam).
//
// A IA do Publike fica fora do Brasil. Para ler o currículo (o arquivo, ou o que a pessoa conta para montar), o aceite
// é específico e em destaque, com o aviso antes (LGPD, art. 33, VIII), e vai junto do que a pessoa já faz: responder ao
// passo 1 do currículo, que traz `AVISO_DA_IA_MONTAR`, ou mandar o arquivo depois do "Tenho currículo", que traz
// `AVISO_DA_IA_ARQUIVO`. Só o arquivo que chega sem aviso pede um toque (`PERGUNTA_DO_ACEITE`), uma vez por número.
// "sem IA" tira o aceite. O país não precisa aparecer: a lei pede o aviso de que é fora do Brasil (os Estados Unidos
// estão na política de privacidade).

/** No passo 1 do currículo: responder é o aceite. */
export const AVISO_DA_IA_MONTAR =
  "_Ao responder, você concorda que a IA do Publike, que fica fora do Brasil, leia o que você contar, só para montar o seu currículo._";

/** No "Tenho currículo": mandar o arquivo é o aceite. */
export const AVISO_DA_IA_ARQUIVO =
  "_Ao mandar o arquivo, você concorda que a IA do Publike, que fica fora do Brasil, leia o seu currículo só para preencher os campos. O arquivo não fica guardado._";

/** No site, junto do "Enviar PDF", da foto e do "Contar falando": enviar (ou gravar) é o aceite. */
export const avisoDaIaNoSite = (comFala: boolean) =>
  `Ao ${comFala ? "gravar ou enviar o arquivo" : "enviar o arquivo"}, você concorda que a IA do Publike, que fica fora do Brasil, leia o seu currículo só para preencher os campos.`;

/** O arquivo que chegou sem aviso: um toque, uma vez por número. */
export const PERGUNTA_DO_ACEITE =
  "📄 Recebi o seu arquivo! Para ler e preencher o seu currículo, ele vai para a IA do Publike, que fica fora do Brasil, só para isso. O arquivo não fica guardado. *Posso ler?*";
export const PAYLOAD_PODE_LER = "a:ia-sim";
export const PAYLOAD_NAO_LER = "a:ia-nao";
export const BOTOES_DO_ACEITE = [
  { id: PAYLOAD_PODE_LER, titulo: "Pode ler" },
  { id: PAYLOAD_NAO_LER, titulo: "Não, obrigado" },
];

/** "Não, obrigado": o arquivo não é lido. */
export const SEM_LER =
  "Tudo bem, não li o seu arquivo. 😊 Se quiser, dá para fazer o currículo no site, preenchendo você mesmo, sem a IA.";

/** "sem IA": o aceite sai. A marca separa o que veio antes (os avisos de antes não valem mais). */
export const MARCA_DO_SEM_IA = "Pronto, tirei o seu aceite";
export const SEM_IA = `${MARCA_DO_SEM_IA}: a IA do Publike não lê mais os seus arquivos nem monta o currículo com você por aqui. 😊 Se quiser, dá para fazer o currículo no site, preenchendo você mesmo. Para voltar, é só mandar o arquivo de novo e tocar em *Pode ler*.`;

const simples = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "sem IA", "não quero IA", "tirar o aceite". */
export function querTirarOAceite(texto: string) {
  return /^(sem (a )?ia|nao quero (a )?ia|nao quero que a ia (leia|le)|tira(r)? (o )?(meu )?aceite)( por favor)?$/.test(simples(texto));
}

/** A resposta escrita ao "Posso ler?": sim, não, ou outra coisa (null). */
export function respostaAoAceite(texto: string): "sim" | "nao" | null {
  const t = simples(texto.replace(/^🎤\s*/, ""));
  if (/^(sim|pode|pode ler|pode sim|claro|ok|okay|beleza|quero|leia|le|sim pode|pode sim obrigad[ao])$/.test(t)) return "sim";
  if (/^(nao|nao obrigad[ao]|nao quero|melhor nao|nao pode|agora nao)$/.test(t)) return "nao";
  return null;
}

/**
 * O aviso que a pessoa viu na conversa, depois do último "sem IA": "arquivo" (o do "Tenho currículo"), "montar" (o do
 * passo 1 do currículo) ou null. Mandar o arquivo ou responder depois dele é o aceite.
 */
export function avisoVisto(historico: { de: string; texto: string }[]): { origem: "arquivo" | "montar"; aviso: string } | null {
  const ultimoSemIa = historico.findLastIndex((m) => m.de !== "pessoa" && m.texto.includes(MARCA_DO_SEM_IA));
  const depois = historico.slice(ultimoSemIa + 1).filter((m) => m.de !== "pessoa");
  for (let i = depois.length - 1; i >= 0; i--) {
    if (depois[i].texto.includes(AVISO_DA_IA_ARQUIVO.slice(0, 50))) return { origem: "arquivo", aviso: AVISO_DA_IA_ARQUIVO };
    if (depois[i].texto.includes(AVISO_DA_IA_MONTAR.slice(0, 50))) return { origem: "montar", aviso: AVISO_DA_IA_MONTAR };
  }
  return null;
}

/** A última mensagem do Publike é o "Posso ler?" (a resposta escrita vale como o botão). */
export const perguntouOAceite = (minhaUltima: string) => minhaUltima.includes(PERGUNTA_DO_ACEITE.slice(0, 40));
