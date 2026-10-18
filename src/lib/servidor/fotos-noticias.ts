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

/** A imagem abre mesmo? (o Flickr e a Wikimedia apagam fotos; um link quebrado não vai para o site) */
export async function fotoAbre(url: string) {
  if (!HOSTS.test(url)) return false;
  // nos testes, a conferência vai para um servidor falso (as fotos de verdade não abrem lá)
  const teste = process.env.FOTOS_CONFERIR_URL;
  const alvo = teste ? `${teste.replace(/\/+$/, "")}/${url.replace(/^https:\/\//, "")}` : url;
  const pedir = (metodo: "HEAD" | "GET") =>
    fetch(alvo, {
      method: metodo,
      headers: {
        "User-Agent": "Publike/1.0 (+https://publike.org)",
        ...(metodo === "GET" ? { Range: "bytes=0-2047" } : {}),
      },
      redirect: "follow",
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
  try {
    let r = await pedir("HEAD");
    if (r.status === 405 || r.status === 403) r = await pedir("GET");
    return r.ok && (r.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

/** O Openverse sem chave aceita no máximo 20 fotos por busca (mais que isso, ele recusa a busca). */
const POR_BUSCA = 20;

/**
 * As fotos que servem para uma busca (licença, tamanho e formato certos), ainda sem conferir se abrem.
 * Se o Openverse recusar ou não responder, volta o motivo em `erro`.
 */
async function candidatas(termo: string): Promise<{ fotos: FotoNoticia[]; erro?: string }> {
  const base = (process.env.OPENVERSE_URL || "https://api.openverse.org/v1").replace(/\/+$/, "");
  const q = new URLSearchParams({
    q: termo.slice(0, 80),
    license_type: "commercial,modification",
    source: "flickr,wikimedia",
    aspect_ratio: "wide",
    size: "large",
    extension: "jpg",
    mature: "false",
    page_size: String(POR_BUSCA),
  });
  try {
    const r = await fetch(`${base}/images/?${q}`, {
      headers: { "User-Agent": "Publike/1.0 (+https://publike.org)", Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!r.ok) {
      console.warn(`Publike: o Openverse recusou a busca de fotos (${r.status}).`);
      return {
        fotos: [],
        erro:
          r.status === 429
            ? "O banco de fotos pediu uma pausa (limite de buscas). Tente de novo em um minuto."
            : `O banco de fotos recusou a busca (erro ${r.status}). Tente de novo.`,
      };
    }
    const fotos = ((await r.json()) as { results?: FotoOpenverse[] }).results ?? [];
    const boas = fotos
      .filter((x) => {
        const w = x.width ?? 0;
        const h = x.height ?? 0;
        return (
          x.url &&
          HOSTS.test(x.url) &&
          x.foreign_landing_url?.startsWith("https://") &&
          w >= 900 &&
          h > 0 &&
          w / h >= 1.3 &&
          w / h <= 2.1
        );
      })
      .map((f) => ({
        foto_url: tamanhoBom(f.url!, f.width ?? 0),
        foto_autor: (f.creator ?? "").trim().slice(0, 120),
        // (na Wikimedia, quem não tem página vem com um link de "criar página": esse fica de fora)
        foto_autor_url:
          f.creator_url?.startsWith("https://") && !f.creator_url.includes("redlink=1")
            ? f.creator_url.slice(0, 600)
            : "",
        foto_link: f.foreign_landing_url!.slice(0, 600),
        foto_alt: (f.title ?? "").trim().slice(0, 300),
        foto_fonte: FONTES[f.provider ?? ""] ?? "Openverse",
        foto_licenca: nomeDaLicenca(f).slice(0, 40),
        foto_licenca_url: f.license_url?.startsWith("https://") ? f.license_url.slice(0, 300) : "",
      }));
    return { fotos: boas };
  } catch {
    return { fotos: [], erro: "O banco de fotos não respondeu. Tente de novo." };
  }
}

/** Busca e devolve a primeira foto boa, que abre e ainda não foi usada (null se nada servir). */
export async function buscarFoto(busca: string, tema: TemaNoticia, usadas: Set<string>): Promise<FotoNoticia | null> {
  if (!fotosConfiguradas()) return null;
  for (const termo of [busca.trim(), ...BUSCA_DO_TEMA[tema]].filter(Boolean)) {
    // confere até 3 por busca: se nenhuma abrir, tenta a próxima busca
    for (const f of (await candidatas(termo)).fotos.filter((x) => !usadas.has(x.foto_link)).slice(0, 3)) {
      if (await fotoAbre(f.foto_url)) {
        usadas.add(f.foto_link);
        return f;
      }
    }
  }
  return null;
}

/** Para o admin escolher: até 8 fotos que abrem, para uma busca (ou o assunto da notícia). */
export async function opcoesDeFoto(busca: string, tema: TemaNoticia): Promise<{ fotos: FotoNoticia[]; erro?: string }> {
  const termo = busca.trim() || BUSCA_DO_TEMA[tema][0];
  const { fotos, erro } = await candidatas(termo);
  if (erro) return { fotos: [], erro };
  const lista = fotos.slice(0, 12);
  const abrem = await Promise.all(lista.map((f) => fotoAbre(f.foto_url)));
  return { fotos: lista.filter((_, i) => abrem[i]).slice(0, 8) };
}

/** Confere uma foto escolhida no admin (vem do navegador): endereços e tamanhos certos. */
export function fotoValida(f: unknown): FotoNoticia | null {
  if (!f || typeof f !== "object") return null;
  const o = f as Record<string, unknown>;
  const t = (k: string, max: number) => (typeof o[k] === "string" ? (o[k] as string).trim().slice(0, max) : "");
  const https = (k: string, max: number) => (/^https:\/\//.test(t(k, max)) ? t(k, max) : "");
  const foto = {
    foto_url: t("foto_url", 600),
    foto_autor: t("foto_autor", 120),
    foto_autor_url: https("foto_autor_url", 600),
    foto_link: https("foto_link", 600),
    foto_alt: t("foto_alt", 300),
    foto_fonte: t("foto_fonte", 60),
    foto_licenca: t("foto_licenca", 40),
    foto_licenca_url: https("foto_licenca_url", 300),
  };
  return HOSTS.test(foto.foto_url) && foto.foto_link ? foto : null;
}
