// Notícias sobre trabalho em Goiânia e região: a IA rascunha, o admin aprova.

export const TEMAS_NOTICIA = {
  vagas: { nome: "Vagas e feirões", curto: "Vagas" },
  cursos: { nome: "Cursos gratuitos", curto: "Cursos" },
  concursos: { nome: "Concursos e seleções", curto: "Concursos" },
  direitos: { nome: "Direitos e leis", curto: "Direitos" },
  eventos: { nome: "Eventos", curto: "Eventos" },
  mercado: { nome: "Mercado de trabalho", curto: "Mercado" },
} as const;
export type TemaNoticia = keyof typeof TEMAS_NOTICIA;
export const LISTA_TEMAS_NOTICIA = Object.keys(TEMAS_NOTICIA) as TemaNoticia[];

export type StatusNoticia = "rascunho" | "aprovada" | "descartada";

export type Noticia = {
  id: string;
  slug: string;
  titulo: string;
  resumo: string;
  corpo: string;
  pratico: string | null;
  tema: TemaNoticia;
  cidade: string | null;
  fonte_nome: string;
  fonte_url: string;
  fonte_data: string | null;
  status: StatusNoticia;
  publicar_em: string | null;
  criado_em: string;
};

/** Os horários em que as notícias aprovadas entram no site, ao longo do dia (Brasília). */
export const HORARIOS_NOTICIAS = [8, 12, 18] as const;

/**
 * O próximo horário livre (8h, 12h ou 18h em Brasília) depois de `depois`,
 * pulando os que já têm notícia agendada. Volta em ISO (UTC).
 */
export function proximoHorarioLivre(ocupados: string[], depois: number): string {
  const usados = new Set(ocupados.map((o) => new Date(o).getTime()));
  // Brasília é UTC−3 o ano todo (sem horário de verão desde 2019)
  const dia = new Date(depois - 3 * 3600e3);
  for (let d = 0; d < 30; d++) {
    for (const h of HORARIOS_NOTICIAS) {
      const t = Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate() + d, h + 3);
      if (t > depois + 5 * 60e3 && !usados.has(t)) return new Date(t).toISOString();
    }
  }
  return new Date(depois).toISOString();
}

export function slugDaNoticia(titulo: string, extra: string) {
  const base = titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/, "");
  return `${base || "noticia"}-${extra}`;
}

/** Endereço sem o que muda de um link para outro da mesma matéria (rastreio, âncora, barra no fim). */
export function normalizarUrl(u: string) {
  try {
    const url = new URL(u);
    url.hash = "";
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|amp$|ref$)/i.test(k)) url.searchParams.delete(k);
    }
    url.hostname = url.hostname.replace(/^www\./, "");
    return url.toString().replace(/\/+$/, "").replace(/\?$/, "");
  } catch {
    return u.trim();
  }
}

export function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "long", timeZone: "America/Sao_Paulo" });
}
