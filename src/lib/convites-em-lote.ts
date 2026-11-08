// Convidar vários de uma vez (migração 20270305120000; claude/plano-pedido-do-cliente-convites-e-testes.md, parte 1).
// Vale no navegador e no servidor.

/** Até quantas pessoas de uma vez (duas páginas de Talentos; o banco confere de novo). */
export const MAX_CONVITES_DE_UMA_VEZ = 48;
export const MAX_RECADO = 300;

export type MotivoSemConvite = "fora" | "curtiu" | "convidado" | "muitos" | "limite";

export const NOME_MOTIVO: Record<MotivoSemConvite, string> = {
  fora: "saiu de Talentos",
  curtiu: "já curtiu a vaga",
  convidado: "já tinha convite para esta vaga",
  muitos: "já recebeu 3 convites seus em 30 dias, sem resposta",
  limite: "passou do limite de convites de hoje",
};

export type ResultadoDosConvites =
  | { ok: true; enviados: number; fora: { perfil_id: string; motivo: MotivoSemConvite }[]; faltam: number }
  | { ok: false; erro: string; ir?: string };

/** O que o banco devolve, conferido. */
export function lerResultadoDosConvites(dados: unknown): ResultadoDosConvites {
  const r = (dados && typeof dados === "object" ? dados : {}) as Record<string, unknown>;
  const fora = Array.isArray(r.fora)
    ? r.fora.flatMap((f) => {
        const x = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
        return typeof x.perfil_id === "string" && typeof x.motivo === "string" && x.motivo in NOME_MOTIVO
          ? [{ perfil_id: x.perfil_id, motivo: x.motivo as MotivoSemConvite }]
          : [];
      })
    : [];
  return { ok: true, enviados: Number(r.enviados) || 0, fora, faltam: Number(r.faltam) || 0 };
}

/** "3 convites enviados. 2 ficaram de fora: 1 já curtiu a vaga, 1 passou do limite de hoje." */
export function textoDosConvites(r: Extract<ResultadoDosConvites, { ok: true }>) {
  const enviados =
    r.enviados === 0 ? "Nenhum convite enviado." : r.enviados === 1 ? "1 convite enviado." : `${r.enviados} convites enviados.`;
  if (!r.fora.length) return enviados;
  const porMotivo = new Map<MotivoSemConvite, number>();
  for (const f of r.fora) porMotivo.set(f.motivo, (porMotivo.get(f.motivo) ?? 0) + 1);
  const partes = [...porMotivo].map(([m, n]) => `${n} ${NOME_MOTIVO[m]}`);
  return `${enviados} ${r.fora.length === 1 ? "1 ficou" : `${r.fora.length} ficaram`} de fora: ${partes.join(", ")}.`;
}

export type ConvitesDaVaga = { enviados: number; curtiram: number; faltam_hoje: number };
