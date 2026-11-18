// A API pública do Publike (migração 20270713120000_api_publica.sql; 17/11/2026, Marcelo: "preciso criar api publica
// para vagas, uma agencia pediu, tem CRM e quer integrar"): o sistema de quem contrata recebe os candidatos das vagas
// da conta e muda a etapa deles. O que a documentação, a tela das chaves e o servidor usam juntos.

/** As chaves começam assim e têm mais 48 letras (de 0 a 9 e de a a f). */
export const PREFIXO_CHAVE_API = "publike_api_";
export const FORMATO_CHAVE_API = /^publike_api_[0-9a-f]{48}$/;

export const CAMINHO_API = "/api/v1";
export const CAMINHO_DOCUMENTACAO = "/desenvolvedores";
export const CAMINHO_CHAVES = "/painel/configuracoes?aba=api";

/** A situação da candidatura, como a API devolve (o painel mostra o mesmo com outras palavras). */
export const SITUACOES_API = [
  { valor: "aguardando", nome: "Esperando a resposta de quem publicou a vaga." },
  {
    valor: "aceita_falta_curriculo",
    nome: "Aceita numa vaga que pede currículo: o match sai sozinho quando o candidato mandar o currículo.",
  },
  { valor: "aceita", nome: "Aceita (deu match): o WhatsApp e o e-mail do candidato aparecem." },
  { valor: "dispensada", nome: "Dispensada por quem publicou." },
  { valor: "desfeita", nome: "O match foi desfeito por um dos lados." },
] as const;

/** As etapas que a API mostra e aceita: as das vagas, as mesmas do quadro do painel. */
export const ETAPAS_API = ["novo", "analise", "entrevista", "contratado", "nao_seguiu"] as const;
export type EtapaApi = (typeof ETAPAS_API)[number];
export const ehEtapaApi = (v: unknown): v is EtapaApi =>
  typeof v === "string" && (ETAPAS_API as readonly string[]).includes(v);

/** O que cada ação faz (POST /api/v1/vagas/{vaga}/candidaturas/{candidato}/{ação}). */
export const ACOES_API = ["aceitar", "dispensar", "etapa"] as const;
export type AcaoApi = (typeof ACOES_API)[number];
export const ehAcaoApi = (v: unknown): v is AcaoApi =>
  typeof v === "string" && (ACOES_API as readonly string[]).includes(v);
