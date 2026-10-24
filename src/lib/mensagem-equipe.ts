/**
 * Mensagem da equipe (migração 20261110120000_mensagem_da_equipe.sql): o admin escreve para uma conta,
 * chega no sino e, se marcado, no e-mail. A resposta do e-mail vai para este endereço; pelo site, a
 * conta responde na página da mensagem e a resposta aparece no admin (20261111120000_resposta_da_equipe).
 */
export const EMAIL_DA_EQUIPE = "development@publike.org";
export const LIMITES_MENSAGEM_EQUIPE = { assunto: 80, texto: 1500, resposta: 1000 };

export type RespostaDaConta = { id: number; texto: string; criado_em: string; vista_em: string | null };

/** As respostas como vêm do banco (jsonb), sem confiar no formato. */
export function lerRespostas(valor: unknown): RespostaDaConta[] {
  if (!Array.isArray(valor)) return [];
  return valor.flatMap((r) =>
    r && typeof r === "object" && typeof r.id === "number" && typeof r.texto === "string"
      ? [
          {
            id: r.id,
            texto: r.texto,
            criado_em: String(r.criado_em ?? ""),
            vista_em: typeof r.vista_em === "string" ? r.vista_em : null,
          },
        ]
      : [],
  );
}
