// Equipe da agência: cada pessoa entra com o próprio celular e age pela agência. Sem dependências:
// serve no navegador e no servidor.

/** O papel de quem está logado na conta pela qual age: a própria conta é "dono". */
export type PapelNaConta = "dono" | "admin" | "recrutador";

export const PAPEIS_EQUIPE = {
  admin: { nome: "Administrador", ajuda: "Faz tudo: vagas, candidatos, clientes, a equipe e o perfil da agência." },
  recrutador: {
    nome: "Recrutador",
    ajuda:
      "Cuida das vagas, dos candidatos, das entrevistas, das conversas e dos clientes. Não mexe na equipe nem no perfil da agência.",
  },
} as const;
export type PapelEquipe = keyof typeof PAPEIS_EQUIPE;

export function ehPapelEquipe(v: unknown): v is PapelEquipe {
  return v === "admin" || v === "recrutador";
}

/** Quem pode cuidar da equipe e do perfil da agência. */
export const administra = (papel: PapelNaConta | null | undefined) => papel === "dono" || papel === "admin";

/** O token do link de convite (/equipe/<token>). */
export const TOKEN_EQUIPE = /^[0-9a-f]{64}$/;
export const DIAS_CONVITE_EQUIPE = 7;

/** Uma conta pela qual a pessoa pode agir (a dela e as das equipes). */
export type ContaDisponivel = {
  conta_id: string;
  nome: string;
  foto: string | null;
  tipo: string;
  papel: PapelNaConta;
  atual: boolean;
};

/** O convite como a página do link mostra (do banco: convite_equipe_do_token). */
export type DadosConviteEquipe = {
  situacao: "valido" | "aceito" | "cancelado" | "vencido";
  papel: PapelEquipe;
  nome: string | null;
  expira_em: string;
  agencia: { id: string; nome: string; foto: string | null; verificado: boolean };
  sou_a_agencia: boolean;
  aceitei: boolean;
  ja_sou_da_equipe: boolean;
};

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

export function lerConviteEquipe(json: unknown): DadosConviteEquipe | null {
  if (!json || typeof json !== "object") return null;
  const d = json as Record<string, unknown>;
  const ag = (d.agencia && typeof d.agencia === "object" ? d.agencia : {}) as Record<string, unknown>;
  const id = texto(ag.id);
  if (!id || !ehPapelEquipe(d.papel)) return null;
  const situacao = d.situacao;
  return {
    situacao:
      situacao === "valido" || situacao === "aceito" || situacao === "cancelado" || situacao === "vencido"
        ? situacao
        : "cancelado",
    papel: d.papel,
    nome: texto(d.nome),
    expira_em: texto(d.expira_em) ?? "",
    agencia: { id, nome: texto(ag.nome) ?? "A agência", foto: texto(ag.foto), verificado: ag.verificado === true },
    sou_a_agencia: d.sou_a_agencia === true,
    aceitei: d.aceitei === true,
    ja_sou_da_equipe: d.ja_sou_da_equipe === true,
  };
}

/** A mensagem para mandar o link do convite pelo WhatsApp. */
export function mensagemConviteEquipe({
  nome,
  agencia,
  papel,
  url,
}: {
  nome: string | null;
  agencia: string;
  papel: PapelEquipe;
  url: string;
}) {
  const primeiro = nome?.trim().split(/\s+/)[0];
  return `Olá${primeiro ? `, ${primeiro}` : ""}! Este é o convite para você entrar na equipe da ${agencia} no Publike, como ${PAPEIS_EQUIPE[papel].nome.toLowerCase()}. Entre pelo link com o seu celular: ${url}`;
}
