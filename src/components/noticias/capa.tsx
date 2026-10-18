import { CapaDesenhada, type CORES_CAPA, type NomeCena } from "@/components/conteudo/capa";
import type { Noticia, TemaNoticia } from "@/lib/noticias";

// Capa das notícias: a foto de banco livre (Pexels) quando a notícia tem uma; se não,
// a capa desenhada (a foto do jornal tem dono), com a cena do assunto e o número em destaque.

const CENA_DO_TEMA: Record<TemaNoticia, NomeCena> = {
  vagas: "Pessoas",
  cursos: "Documento",
  concursos: "Documento",
  direitos: "Direitos",
  eventos: "Pessoas",
  mercado: "Mercado",
};

const COR_DO_TEMA: Record<TemaNoticia, keyof typeof CORES_CAPA> = {
  vagas: "cerrado",
  cursos: "ipe",
  concursos: "terra",
  direitos: "cerrado",
  eventos: "terra",
  mercado: "terra",
};

// palavras do título que pedem uma cena própria (a primeira que bater)
const PALAVRAS: [RegExp, NomeCena][] = [
  [/sal[aá]rio|reajuste|piso|fgts|renda|r\$|13º|décimo|pagamento|cr[eé]dito/i, "Moedas"],
  [/constru[cç][aã]o|obra|pedreiro|habita/i, "Obra"],
  [/ind[uú]stria|f[aá]brica|f[aá]bril|montadora/i, "Fabrica"],
  [/[oô]nibus|transporte|motorista|aplicativo|log[ií]stica/i, "Onibus"],
  [/curso|qualifica|senai|senac|aprendiz|est[aá]gio|concurso|edital|inscri/i, "Documento"],
  [/feir[aã]o|mutir[aã]o|contrata|vagas/i, "Pessoas"],
  [/servi[cç]o|mei\b|aut[oô]nomo|diarista|eletricista/i, "Servicos"],
  [/lei\b|direito|clt|escala|jornada|inss|aposentad|seguro-desemprego/i, "Direitos"],
];

/** "600 vagas", "R$ 1.630", "5,2%": o número que resume a notícia, se o título tiver. */
export function numeroDaNoticia(titulo: string) {
  const m =
    titulo.match(/R\$\s?[\d.]+(?:,\d+)?/) ??
    titulo.match(/\d[\d.]*(?:,\d+)?\s?%/) ??
    titulo.match(/\b\d[\d.]*\s+(?:mil\s+)?(?:vagas|empregos|postos|oportunidades|cursos|bolsas)\b/i);
  return m ? m[0].replace(/\s+/g, " ") : null;
}

export function CapaNoticia({
  n,
  tamanho = "card",
  className = "",
}: {
  n: Pick<Noticia, "slug" | "titulo" | "tema" | "foto_url" | "foto_alt">;
  tamanho?: "card" | "grande";
  className?: string;
}) {
  if (n.foto_url) {
    return (
      // a foto vem do banco já no tamanho certo (1200 de largura): sem passar pelo otimizador
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={n.foto_url}
        alt={n.foto_alt || ""}
        loading={tamanho === "grande" ? "eager" : "lazy"}
        decoding="async"
        className={`block w-full bg-surface-300 object-cover ${className}`}
      />
    );
  }
  const cena = PALAVRAS.find(([re]) => re.test(n.titulo))?.[1] ?? CENA_DO_TEMA[n.tema] ?? "Mercado";
  return (
    <CapaDesenhada
      semente={n.slug}
      cena={cena}
      cor={COR_DO_TEMA[n.tema] ?? "terra"}
      numero={numeroDaNoticia(n.titulo)}
      tamanho={tamanho}
      className={className}
    />
  );
}
