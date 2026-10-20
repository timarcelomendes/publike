// Candidato de fora: quem publicou a vaga recebe um currículo por fora (WhatsApp, e-mail, em
// mãos) e chama a pessoa pelo link. Sem dependências: serve no navegador e no servidor.

/** O token do link (/candidatura/<token>). */
export const TOKEN_CONVITE = /^[0-9a-f]{64}$/;
/** Quanto tempo o link vale. */
export const DIAS_DO_CONVITE = 14;

export type SituacaoConvite = "valido" | "aceito" | "recusado" | "cancelado" | "vencido" | "fora_do_ar";

export const SITUACOES_CONVITE: Record<
  SituacaoConvite,
  { nome: string; selo: "aviso" | "match" | "contorno" | "perigo" }
> = {
  valido: { nome: "Esperando resposta", selo: "aviso" },
  aceito: { nome: "Aceitou", selo: "match" },
  recusado: { nome: "Não quis", selo: "perigo" },
  cancelado: { nome: "Cancelado", selo: "contorno" },
  vencido: { nome: "Venceu", selo: "contorno" },
  fora_do_ar: { nome: "Vaga fora do ar", selo: "contorno" },
};

/** Um convite na lista de quem convidou. */
export type ConviteDaVaga = {
  id: string;
  token: string;
  nome: string;
  criado_em: string;
  expira_em: string;
  aceito_em: string | null;
  recusado_em: string | null;
  cancelado_em: string | null;
  perfil_id: string | null;
  tem_curriculo: boolean;
};

/** A situação na lista de quem convidou (a vaga está no ar: a página só abre assim). */
export function situacaoNaLista(c: ConviteDaVaga, agora: number): SituacaoConvite {
  if (c.aceito_em) return "aceito";
  if (c.recusado_em) return "recusado";
  if (c.cancelado_em) return "cancelado";
  if (new Date(c.expira_em).getTime() <= agora) return "vencido";
  return "valido";
}

/** O que a página do link mostra (do banco: convite_candidato_do_token). */
export type DadosDoConvite = {
  situacao: SituacaoConvite;
  anuncio_id: string;
  /** o primeiro nome que a agência escreveu */
  nome: string;
  expira_em: string;
  tem_curriculo: boolean;
  /** quem abriu é quem convidou */
  previa: boolean;
  /** quem abriu é quem aceitou */
  meu: boolean;
  quem: { nome: string; foto: string | null; verificado: boolean; tipo: string | null };
  vaga: { titulo: string; cidade: string; bairro: string | null; contratante: string | null; confidencial: boolean };
};

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const SITUACOES = Object.keys(SITUACOES_CONVITE) as SituacaoConvite[];

export function lerDadosDoConvite(json: unknown): DadosDoConvite | null {
  if (!json || typeof json !== "object") return null;
  const d = json as Record<string, unknown>;
  const quem = (d.quem && typeof d.quem === "object" ? d.quem : {}) as Record<string, unknown>;
  const vaga = (d.vaga && typeof d.vaga === "object" ? d.vaga : {}) as Record<string, unknown>;
  const anuncio = texto(d.anuncio_id);
  if (!anuncio || !texto(vaga.titulo)) return null;
  return {
    situacao: SITUACOES.includes(d.situacao as SituacaoConvite) ? (d.situacao as SituacaoConvite) : "cancelado",
    anuncio_id: anuncio,
    nome: texto(d.nome) ?? "",
    expira_em: texto(d.expira_em) ?? "",
    tem_curriculo: d.tem_curriculo === true,
    previa: d.previa === true,
    meu: d.meu === true,
    quem: {
      nome: texto(quem.nome) ?? "Quem publicou",
      foto: texto(quem.foto),
      verificado: quem.verificado === true,
      tipo: texto(quem.tipo),
    },
    vaga: {
      titulo: texto(vaga.titulo) as string,
      cidade: texto(vaga.cidade) ?? "",
      bairro: texto(vaga.bairro),
      contratante: texto(vaga.contratante),
      confidencial: vaga.confidencial === true,
    },
  };
}

/** A mensagem para mandar o link pelo WhatsApp. */
export function mensagemDoConvite({
  nome,
  quem,
  vaga,
  url,
  comCurriculo,
}: {
  nome: string;
  quem: string;
  vaga: string;
  url: string;
  comCurriculo: boolean;
}) {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  return [
    `Olá${primeiro ? `, ${primeiro}` : ""}! Aqui é da ${quem}.`,
    comCurriculo
      ? `Montamos seu currículo no Publike com o que você mandou, para a vaga “${vaga}”.`
      : `Queremos chamar você para a vaga “${vaga}” no Publike.`,
    `Entre pelo link com o seu celular, confira e aceite: ${url}`,
  ].join(" ");
}
