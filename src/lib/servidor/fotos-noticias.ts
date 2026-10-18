import "server-only";
import type { TemaNoticia } from "@/lib/noticias";

// Fotos de verdade para as notícias, pelo Openverse: fotos com licença livre do Flickr e da
// Wikimedia (muitas de agências públicas), sem chave nem conta. Só entram licenças que deixam
// usar em site e recortar (CC BY, CC BY-SA, CC0); a legenda leva quem fotografou e a licença.
// A foto do jornal da matéria tem dono e não entra. Se nada servir, fica a capa desenhada.

export type FotoNoticia = {
  foto_url: string;
  foto_autor: string;
  foto_autor_url: string;
  foto_link: string;
  foto_alt: string;
  foto_fonte: string;
  foto_licenca: string;
  foto_licenca_url: string;
};

/** O que buscar quando a sugestão da IA não achar nada: em português (fotos do Brasil) e em inglês. */
const BUSCA_DO_TEMA: Record<TemaNoticia, string[]> = {
  vagas: ["feirão de empregos", "job fair"],
  cursos: ["curso profissionalizante", "vocational training"],
  concursos: ["concurso público prova", "students exam"],
  direitos: ["carteira de trabalho", "workers rights"],
  eventos: ["feira de empregos", "job fair crowd"],
  mercado: ["trabalhadores", "workers"],
};

/** Só imagens destes endereços (são os que a CSP do site deixa abrir). */
const HOSTS = /^https:\/\/(live\.staticflickr\.com|farm\d+\.staticflickr\.com|upload\.wikimedia\.org)\//;

export function fotosConfiguradas() {
  return process.env.FOTOS_NOTICIAS !== "desligadas";
}

type FotoOpenverse = {
  title?: string;
  url?: string;
  foreign_landing_url?: string;
  creator?: string | null;
  creator_url?: string | null;
  license?: string;
  license_version?: string | null;
  license_url?: string | null;
  provider?: string;
  width?: number | null;
  height?: number | null;
};

const FONTES: Record<string, string> = { flickr: "Flickr", wikimedia: "Wikimedia Commons" };

function nomeDaLicenca(f: FotoOpenverse) {
  if (f.license === "cc0") return "CC0";
  if (f.license === "pdm") return "Domínio público";
  return `CC ${(f.license ?? "").toUpperCase()}${f.license_version ? ` ${f.license_version}` : ""}`.trim();
}

/** A original da Wikimedia pode ter 10 MB: pede a miniatura de 1280 de largura. */
function tamanhoBom(url: string, largura: number) {
  const m = url.match(/^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)$/);
  if (!m || largura <= 1280) return url;
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${m[3]}/1280px-${m[3]}`;
}

/** Busca e devolve a primeira foto boa que ainda não foi usada (null se nada servir). */
export async function buscarFoto(busca: string, tema: TemaNoticia, usadas: Set<string>): Promise<FotoNoticia | null> {
  if (!fotosConfiguradas()) return null;
  const base = (process.env.OPENVERSE_URL || "https://api.openverse.org/v1").replace(/\/+$/, "");
  for (const termo of [busca.trim(), ...BUSCA_DO_TEMA[tema]].filter(Boolean)) {
    try {
      const q = new URLSearchParams({
        q: termo.slice(0, 80),
        license_type: "commercial,modification",
        source: "flickr,wikimedia",
        aspect_ratio: "wide",
        size: "large",
        extension: "jpg",
        mature: "false",
        page_size: "20",
      });
      const r = await fetch(`${base}/images/?${q}`, {
        headers: { "User-Agent": "Publike/1.0 (+https://publike.org)", Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
        cache: "no-store",
      });
      if (!r.ok) continue;
      const fotos = ((await r.json()) as { results?: FotoOpenverse[] }).results ?? [];
      const f = fotos.find((x) => {
        const w = x.width ?? 0;
        const h = x.height ?? 0;
        return (
          x.url &&
          HOSTS.test(x.url) &&
          x.foreign_landing_url?.startsWith("https://") &&
          !usadas.has(x.foreign_landing_url) &&
          w >= 900 &&
          h > 0 &&
          w / h >= 1.3 &&
          w / h <= 2.1
        );
      });
      if (!f?.url || !f.foreign_landing_url) continue;
      usadas.add(f.foreign_landing_url);
      return {
        foto_url: tamanhoBom(f.url, f.width ?? 0),
        foto_autor: (f.creator ?? "").trim().slice(0, 120),
        // (na Wikimedia, quem não tem página vem com um link de "criar página": esse fica de fora)
        foto_autor_url:
          f.creator_url?.startsWith("https://") && !f.creator_url.includes("redlink=1")
            ? f.creator_url.slice(0, 600)
            : "",
        foto_link: f.foreign_landing_url.slice(0, 600),
        foto_alt: (f.title ?? "").trim().slice(0, 300),
        foto_fonte: FONTES[f.provider ?? ""] ?? "Openverse",
        foto_licenca: nomeDaLicenca(f).slice(0, 40),
        foto_licenca_url: f.license_url?.startsWith("https://") ? f.license_url.slice(0, 300) : "",
      };
    } catch {
      // sem foto desta vez: a notícia segue com a capa desenhada e tenta de novo na próxima busca
    }
  }
  return null;
}
