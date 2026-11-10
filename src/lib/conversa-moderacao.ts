/** A conversa entre quem publicou e a moderação (migração 20270405120000_conversa_da_moderacao.sql). */
export const LIMITE_CONVERSA_MODERACAO = 1000;

export type MensagemModeracao = {
  id: number;
  de: "autor" | "equipe";
  texto: string;
  criado_em: string;
  /** só para a moderação: quem da equipe escreveu */
  quem_nome?: string | null;
};

/** As linhas como vêm do banco, sem confiar no formato. */
export function lerConversa(linhas: unknown): MensagemModeracao[] {
  if (!Array.isArray(linhas)) return [];
  return linhas.flatMap((l) =>
    l && typeof l === "object" && typeof l.id === "number" && typeof l.texto === "string" && (l.de === "autor" || l.de === "equipe")
      ? [
          {
            id: l.id,
            de: l.de,
            texto: l.texto,
            criado_em: String(l.criado_em ?? ""),
            quem_nome: typeof l.quem_nome === "string" ? l.quem_nome : null,
          },
        ]
      : [],
  );
}
