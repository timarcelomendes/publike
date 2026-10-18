import "server-only";
import type { FotoNoticia } from "./fotos-noticias";
import { acessoFila } from "./filas";

// Fotos do Pixabay (chave grátis em pixabay.com/api/docs, em PIXABAY_API_KEY). Regras do Pixabay:
// - o link da foto deles só vale para mostrar o resultado da busca (o admin escolhendo); para
//   publicar, o Publike guarda uma cópia (tabela fotos_noticias) e serve em /noticias/foto/<id>.jpg;
// - o resultado de cada busca fica guardado por 24 horas (aqui, na memória do servidor);
// - mostrar que a foto vem do Pixabay (a legenda leva o nome de quem fotografou e o link).

const BASE = () => (process.env.PIXABAY_URL || "https://pixabay.com/api").replace(/\/+$/, "");
const DIA = 24 * 3600e3;
const LICENCA = { nome: "Licença do Pixabay", url: "https://pixabay.com/service/license-summary/" };

export function pixabayConfigurado() {
  return Boolean((process.env.PIXABAY_API_KEY || "").trim());
}

type Hit = {
  id: number;
  pageURL?: string;
  tags?: string;
  webformatURL?: string;
  largeImageURL?: string;
  imageWidth?: number;
  imageHeight?: number;
  user?: string;
  user_id?: number;
};

const guardadas = new Map<string, { quando: number; hits: Hit[] }>();

async function pedir(params: Record<string, string>): Promise<{ hits: Hit[]; erro?: string }> {
  const chave = (process.env.PIXABAY_API_KEY || "").trim();
  const q = new URLSearchParams({ key: chave, ...params });
  const memoria = JSON.stringify(params);
  const antes = guardadas.get(memoria);
  if (antes && Date.now() - antes.quando < DIA) return { hits: antes.hits };
  try {
    const r = await fetch(`${BASE()}/?${q}`, { signal: AbortSignal.timeout(12_000), cache: "no-store" });
    if (!r.ok) {
      console.warn(`Publike: o Pixabay recusou a busca de fotos (${r.status}).`);
      return {
        hits: [],
        erro:
          r.status === 429
            ? "O Pixabay pediu uma pausa (limite de buscas). Tente de novo em um minuto."
            : r.status === 400 || r.status === 401 || r.status === 403
              ? "O Pixabay recusou a chave (PIXABAY_API_KEY). Confira a chave."
              : `O Pixabay recusou a busca (erro ${r.status}). Tente de novo.`,
      };
    }
    const hits = ((await r.json()) as { hits?: Hit[] }).hits ?? [];
    if (guardadas.size > 500) guardadas.clear();
    guardadas.set(memoria, { quando: Date.now(), hits });
    return { hits };
  } catch (e) {
    console.warn(`Publike: a busca de fotos no Pixabay falhou: ${e instanceof Error ? e.message : String(e)}`);
    return { hits: [], erro: "O Pixabay não respondeu. Tente de novo." };
  }
}

const boa = (h: Hit) => {
  const w = h.imageWidth ?? 0;
  const ht = h.imageHeight ?? 0;
  return Boolean(h.id && h.pageURL && h.webformatURL && w >= 1200 && ht > 0 && w / ht >= 1.3 && w / ht <= 2.1);
};

/** A foto como o admin vê na busca (com o link temporário do Pixabay, que o Pixabay permite para escolher). */
function comoFoto(h: Hit): FotoNoticia {
  return {
    foto_url: h.webformatURL ?? "",
    foto_autor: (h.user ?? "").slice(0, 120),
    foto_autor_url: h.user && h.user_id ? `https://pixabay.com/users/${encodeURIComponent(h.user)}-${h.user_id}/` : "",
    foto_link: (h.pageURL ?? "").slice(0, 600),
    foto_alt: (h.tags ?? "").slice(0, 300),
    foto_fonte: "Pixabay",
    foto_licenca: LICENCA.nome,
    foto_licenca_url: LICENCA.url,
  };
}

/** Fotos do Pixabay para uma busca (português ou inglês). */
export async function buscarNoPixabay(
  termo: string,
  lingua: "pt" | "en",
): Promise<{ fotos: FotoNoticia[]; erro?: string }> {
  const { hits, erro } = await pedir({
    q: termo.slice(0, 100),
    lang: lingua,
    image_type: "photo",
    orientation: "horizontal",
    safesearch: "true",
    min_width: "1200",
    per_page: "20",
  });
  return { fotos: hits.filter(boa).map(comoFoto), erro };
}

/** O número da foto no Pixabay, pelo link da página dela (…-123456/). */
export function idDoPixabay(link: string) {
  const m = link.match(/^https:\/\/pixabay\.com\/[^?#]*-(\d{1,20})\/?$/);
  return m ? m[1] : null;
}

/** Os endereços de onde a cópia pode ser baixada (o do Pixabay e, nos testes, o servidor falso). */
function podeBaixar(url: string) {
  if (/^https:\/\/(cdn\.)?pixabay\.com\//.test(url)) return true;
  const teste = process.env.PIXABAY_URL;
  return Boolean(teste && url.startsWith(new URL(teste).origin + "/"));
}

/**
 * Guarda a cópia da foto no banco e devolve a foto com o endereço do próprio site.
 * O endereço da imagem grande vem de novo do Pixabay (pelo número da foto), não do navegador.
 */
export async function guardarCopia(foto: FotoNoticia): Promise<FotoNoticia | null> {
  const id = idDoPixabay(foto.foto_link);
  const acesso = acessoFila();
  if (!id || !acesso) return null;
  const { hits } = await pedir({ id });
  const h = hits.find((x) => String(x.id) === id);
  const grande = h?.largeImageURL;
  if (!h || !grande || !podeBaixar(grande)) return null;
  try {
    const r = await fetch(grande, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
    const tipo = (r.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!r.ok || !["image/jpeg", "image/png", "image/webp"].includes(tipo)) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length < 100 || bytes.length > 3_000_000) return null;
    const chave = `pixabay-${id}`;
    const { error } = await acesso.cliente.rpc("servidor_guardar_foto_noticia", {
      p_chave: acesso.chave,
      p_id: chave,
      p_tipo: tipo,
      p_dados: bytes.toString("base64"),
    });
    if (error) {
      console.warn(`Publike: não deu para guardar a foto do Pixabay: ${error.message}`);
      return null;
    }
    const ext = tipo === "image/png" ? "png" : tipo === "image/webp" ? "webp" : "jpg";
    return { ...comoFoto(h), foto_url: `/noticias/foto/${chave}.${ext}` };
  } catch (e) {
    console.warn(`Publike: não deu para baixar a foto do Pixabay: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
