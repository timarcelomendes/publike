/**
 * O fundo do topo da home de quem entrou: preto (o padrão), uma das imagens prontas (em
 * public/fundos) ou a foto que a pessoa enviou (bucket privado `fundos`). Só a pessoa vê.
 */
export type Fundo = "preto" | "luzes" | "amanhecer" | "folhas" | "terra" | "pinos" | "foto";

export type OpcaoDeFundo = {
  valor: Exclude<Fundo, "foto">;
  nome: string;
  /** o estilo do fundo no topo */
  estilo: { backgroundColor?: string; backgroundImage?: string; backgroundSize?: string };
  /** o estilo da miniatura no quadro de escolher */
  mini: { backgroundColor?: string; backgroundImage?: string; backgroundSize?: string };
  /** imagem (precisa da camada escura por cima para o texto ficar legível) */
  imagem: boolean;
};

export const FUNDOS: OpcaoDeFundo[] = [
  { valor: "preto", nome: "Preto", estilo: {}, mini: { backgroundColor: "#1f1a14" }, imagem: false },
  {
    valor: "luzes",
    nome: "Luzes",
    estilo: { backgroundImage: "url(/fundos/luzes.webp)", backgroundSize: "cover" },
    mini: { backgroundImage: "url(/fundos/luzes-mini.webp)", backgroundSize: "cover" },
    imagem: true,
  },
  {
    valor: "amanhecer",
    nome: "Amanhecer",
    estilo: { backgroundImage: "url(/fundos/amanhecer.webp)", backgroundSize: "cover" },
    mini: { backgroundImage: "url(/fundos/amanhecer-mini.webp)", backgroundSize: "cover" },
    imagem: true,
  },
  {
    valor: "folhas",
    nome: "Folhas",
    estilo: { backgroundImage: "url(/fundos/folhas.webp)", backgroundSize: "cover" },
    mini: { backgroundImage: "url(/fundos/folhas-mini.webp)", backgroundSize: "cover" },
    imagem: true,
  },
  {
    valor: "terra",
    nome: "Terra",
    estilo: { backgroundColor: "#c2410c" },
    mini: { backgroundColor: "#c2410c" },
    imagem: false,
  },
  {
    valor: "pinos",
    nome: "Pinos",
    estilo: { backgroundImage: "url(/fundos/pinos.svg)", backgroundSize: "120px" },
    mini: { backgroundColor: "#1f1a14", backgroundImage: "url(/fundos/pinos.svg)", backgroundSize: "60px" },
    imagem: false,
  },
];

export const ehFundo = (v: unknown): v is Fundo => v === "foto" || FUNDOS.some((f) => f.valor === v);

/** Foto enviada: até 5 MB antes de reduzir; o navegador reduz para 1.600 px de largura. */
export const FUNDO_MAX_BYTES = 5 * 1024 * 1024;
export const FUNDO_LARGURA = 1600;
