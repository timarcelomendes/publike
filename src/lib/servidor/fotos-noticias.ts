import "server-only";
import type { TemaNoticia } from "@/lib/noticias";

// Fotos de verdade para as notícias, de um banco livre (Pexels: uso grátis, inclusive em site,
// pedindo o crédito de quem fotografou). A foto do jornal da matéria tem dono e não entra.
// Sem a chave (PEXELS_API_KEY), nada muda: a notícia segue com a capa desenhada.

export type FotoNoticia = {
  foto_url: string;
  foto_autor: string;
  foto_autor_url: string;
  foto_link: string;
  foto_alt: string;
};

/** O que buscar quando a IA não sugeriu nada (em inglês: o banco acha mais). */
const BUSCA_DO_TEMA: Record<TemaNoticia, string> = {
  vagas: "job interview",
  cursos: "vocational training class",
  concursos: "people studying exam",
  direitos: "workers documents office",
  eventos: "job fair crowd",
  mercado: "workers city brazil",
};

export function fotosConfiguradas() {
  return Boolean((process.env.PEXELS_API_KEY || "").trim());
}

type FotoPexels = {
  url?: string;
  alt?: string;
  photographer?: string;
  photographer_url?: string;
  src?: { landscape?: string; large?: string };
};

/** Busca no banco e devolve a primeira foto que ainda não foi usada (null se nada servir). */
export async function buscarFoto(busca: string, tema: TemaNoticia, usadas: Set<string>): Promise<FotoNoticia | null> {
  const chave = (process.env.PEXELS_API_KEY || "").trim();
  if (!chave) return null;
  const base = (process.env.PEXELS_URL || "https://api.pexels.com/v1").replace(/\/+$/, "");
  for (const termo of [busca.trim(), BUSCA_DO_TEMA[tema]].filter(Boolean)) {
    try {
      const r = await fetch(
        `${base}/search?query=${encodeURIComponent(termo.slice(0, 80))}&orientation=landscape&size=large&per_page=15`,
        { headers: { Authorization: chave }, signal: AbortSignal.timeout(10_000), cache: "no-store" },
      );
      if (!r.ok) continue;
      const fotos = ((await r.json()) as { photos?: FotoPexels[] }).photos ?? [];
      const f = fotos.find((x) => x.url && !usadas.has(x.url) && (x.src?.landscape || x.src?.large));
      if (!f?.url) continue;
      const foto = {
        foto_url: (f.src?.landscape || f.src?.large) as string,
        foto_autor: (f.photographer ?? "").slice(0, 120),
        foto_autor_url: f.photographer_url?.startsWith("https://") ? f.photographer_url : "",
        foto_link: f.url,
        foto_alt: (f.alt ?? "").slice(0, 300),
      };
      if (!foto.foto_url.startsWith("https://") || !foto.foto_link.startsWith("https://")) continue;
      usadas.add(f.url);
      return foto;
    } catch {
      // sem foto desta vez: a notícia segue com a capa desenhada e tenta de novo na próxima busca
    }
  }
  return null;
}
