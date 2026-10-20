// Uma conversa por pessoa: com quem tenho match (vaga ou serviço) ou conexão aceita. As mensagens
// das vagas e da conexão ficam juntas; o cabeçalho mostra as vagas em comum e a etapa de cada uma.

import { ETAPAS_CANDIDATO, type EtapaCandidato } from "@/lib/constantes";

/** Uma vaga (ou serviço) em comum com a pessoa: de onde a conversa veio. */
export type VagaDaConversa = {
  anuncio_id: string;
  /** quem curtiu (a curtida é a da vaga) */
  perfil_id: string;
  titulo: string;
  tipo: "vaga" | "servico";
  /** publiquei o anúncio ou curti o da outra pessoa */
  papel: "publiquei" | "curti";
  etapa: EtapaCandidato;
  desde: string | null;
};

export type ConversaPessoa = {
  outro_id: string;
  outro_nome: string;
  outro_foto: string | null;
  outro_tipo: string;
  /** a outra pessoa está na aba Talentos (dá para abrir o currículo em /talentos) */
  outro_na_vitrine: boolean;
  /** null até a primeira mensagem */
  conversa_id: string | null;
  /** a conexão (talento e empresa) está aceita */
  conectados: boolean;
  /** as vagas em comum, da mais recente para a mais antiga */
  vagas: VagaDaConversa[];
  /** quando a ligação mais recente começou (match ou conexão) */
  desde: string | null;
  ultima_texto: string | null;
  ultima_em: string | null;
  ultima_minha: boolean;
  nao_lidas: number;
};

/** Onde fica a conversa com uma conta. */
export function caminhoConversa(outroId: string) {
  return `/painel/conversas/${outroId}`;
}

/** As vagas que vêm do banco (jsonb), conferidas. */
export function lerVagasDaConversa(valor: unknown): VagaDaConversa[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const x = v as Record<string, unknown>;
    if (typeof x.anuncio_id !== "string" || typeof x.titulo !== "string") return [];
    const etapa = typeof x.etapa === "string" && x.etapa in ETAPAS_CANDIDATO ? (x.etapa as EtapaCandidato) : "novo";
    return [
      {
        anuncio_id: x.anuncio_id,
        perfil_id: typeof x.perfil_id === "string" ? x.perfil_id : "",
        titulo: x.titulo,
        tipo: x.tipo === "servico" ? "servico" : "vaga",
        papel: x.papel === "curti" ? "curti" : "publiquei",
        etapa,
        desde: typeof x.desde === "string" ? x.desde : null,
      },
    ];
  });
}

/** De onde vem a conversa, em poucas palavras: "Repositor", "Repositor e mais 1 · Conexão". */
export function origemDaConversa(c: Pick<ConversaPessoa, "vagas" | "conectados">) {
  const partes: string[] = [];
  if (c.vagas.length) {
    partes.push(c.vagas.length === 1 ? c.vagas[0].titulo : `${c.vagas[0].titulo} e mais ${c.vagas.length - 1}`);
  }
  if (c.conectados) partes.push("Conexão");
  return partes.join(" · ");
}

/** O nome da etapa do jeito que eu vejo (quem publicou ou quem curtiu). */
export function etapaParaMim(v: Pick<VagaDaConversa, "etapa" | "papel">) {
  const e = ETAPAS_CANDIDATO[v.etapa];
  return v.papel === "publiquei" ? e.nome : e.paraQuemCurtiu;
}

/** A vaga em que eu curti (sou o candidato): é a ela que vai o currículo mandado pelo chat. */
export function vagaDoCurriculo(c: Pick<ConversaPessoa, "vagas">) {
  return c.vagas.find((v) => v.papel === "curti" && v.tipo === "vaga")?.anuncio_id ?? null;
}

/** Onde ver a outra pessoa: o currículo (talento na aba) ou a página dela. */
export function linkDaPessoa(c: Pick<ConversaPessoa, "outro_id" | "outro_tipo" | "outro_na_vitrine">) {
  return c.outro_tipo === "pessoa" && c.outro_na_vitrine ? `/talentos/${c.outro_id}` : `/perfil/${c.outro_id}`;
}
