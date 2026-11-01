// A conta apagada (migração 20270113120000): o motivo de quem sai e o rastro no admin, sem nome nem contato.

export const MOTIVOS_SAIDA = [
  { valor: "consegui", nome: "Já consegui o que eu queria" },
  { valor: "nada_perto", nome: "Não achei vagas ou serviços perto de mim" },
  { valor: "conta_errada", nome: "Criei a conta errada (outro tipo ou repetida)" },
  { valor: "dificil", nome: "Achei o site difícil de usar" },
  { valor: "avisos", nome: "Recebia avisos ou mensagens demais" },
  { valor: "outro", nome: "Outro motivo" },
] as const;

/** "Achei o site difícil de usar: não achei onde mudar o tipo" (null: não quis contar). */
export function montarMotivo(valor: unknown, texto: unknown): string | null {
  const escolhido = MOTIVOS_SAIDA.find((m) => m.valor === valor)?.nome ?? null;
  const livre = String(texto ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  if (!escolhido && !livre) return null;
  if (!escolhido) return livre;
  return livre && valor !== "outro" ? `${escolhido}: ${livre}` : livre || escolhido;
}

export type ContaApagada = {
  id: string;
  tipo: string | null;
  cidade: string | null;
  criada_em: string | null;
  apagada_em: string;
  por: "pessoa" | "equipe";
  motivo: string | null;
  /** o motivo que a equipe escreveu ao apagar (registro da equipe) */
  motivo_da_equipe?: string | null;
};

export function lerContaApagada(x: unknown): ContaApagada | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (typeof o.id !== "string" || typeof o.apagada_em !== "string") return null;
  return {
    id: o.id,
    tipo: typeof o.tipo === "string" ? o.tipo : null,
    cidade: typeof o.cidade === "string" ? o.cidade : null,
    criada_em: typeof o.criada_em === "string" ? o.criada_em : null,
    apagada_em: o.apagada_em,
    por: o.por === "equipe" ? "equipe" : "pessoa",
    motivo: typeof o.motivo === "string" && o.motivo ? o.motivo : null,
    motivo_da_equipe: typeof o.motivo_da_equipe === "string" && o.motivo_da_equipe ? o.motivo_da_equipe : null,
  };
}

/** "13 minutos", "2 dias", "3 meses": quanto tempo a conta durou. */
export function quantoDurou(criada: string | null, apagada: string) {
  if (!criada) return null;
  const min = Math.max(0, Math.round((new Date(apagada).getTime() - new Date(criada).getTime()) / 60_000));
  if (min < 60) return min <= 1 ? "1 minuto" : `${min} minutos`;
  const horas = Math.round(min / 60);
  if (horas < 48) return horas === 1 ? "1 hora" : `${horas} horas`;
  const dias = Math.round(horas / 24);
  if (dias < 60) return `${dias} dias`;
  const meses = Math.round(dias / 30);
  return meses === 1 ? "1 mês" : `${meses} meses`;
}
