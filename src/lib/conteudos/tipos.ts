// Conteúdos (blog) sobre trabalho em Goiânia e região. Cada artigo é um arquivo
// em src/lib/conteudos/artigos/ e entra na lista de src/lib/conteudos/index.ts.
//
// No texto dos blocos dá para usar **negrito** e [links](/vagas/goiania).

export type TemaConteudo = "mercado" | "procurar" | "contratar" | "servicos" | "direitos";

export const TEMAS_CONTEUDO: Record<TemaConteudo, { nome: string; descricao: string }> = {
  mercado: { nome: "Mercado de trabalho", descricao: "Números do emprego em Goiânia, Goiás e no Brasil." },
  procurar: { nome: "Para quem procura trabalho", descricao: "Como achar vaga perto de casa e se preparar." },
  contratar: { nome: "Para quem contrata", descricao: "Como achar gente boa sem gastar nada." },
  servicos: { nome: "Serviços e renda", descricao: "Bicos, MEI e como conseguir clientes no bairro." },
  direitos: { nome: "Direitos e caminhos públicos", descricao: "Carteira, seguro-desemprego, Sine e cursos." },
};

export type BlocoConteudo =
  | { t: "p"; texto: string }
  | { t: "h2"; texto: string }
  | { t: "lista"; itens: string[] }
  /** um número em destaque, com a fonte (índice na lista de fontes, começando em 1) */
  | { t: "numero"; valor: string; rotulo: string; fonte: number }
  /** chamada para uma ação no Publike */
  | { t: "chamada"; titulo: string; texto: string; botao: string; href: string };

export type FonteConteudo = { titulo: string; url: string; data: string };

export type Conteudo = {
  slug: string;
  titulo: string;
  /** uma ou duas frases: aparece na lista e no Google */
  descricao: string;
  tema: TemaConteudo;
  /** AAAA-MM-DD */
  publicado: string;
  blocos: BlocoConteudo[];
  fontes: FonteConteudo[];
};
