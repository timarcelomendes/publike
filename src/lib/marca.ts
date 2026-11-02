// A cor da marca da página de carreiras (claude/plano-pagina-de-vagas.md, parte 3): as cores para escolher e as
// contas para ela ficar legível em cima do creme do Publike (textos e títulos) e para o texto em cima dela (botões).

export type Marca = {
  cor: string | null;
  /** a primeira das fotos (o que lia a capa continua valendo) */
  capa: string | null;
  texto: string | null;
  beneficios: string[];
  apelido: string | null;
  /** o título acima do texto ("Vem construir com a gente!"); sem ele, "Por que trabalhar aqui" */
  titulo: string | null;
  /** até 3 fotos no alto da página (migração 20270120120000) */
  fotos: string[];
};

/** As cores para escolher (a empresa acha a mais perto da logo). Guardadas em minúsculas, como o banco pede. */
export const CORES_DA_MARCA = [
  { nome: "Terracota", hex: "#a2441f" },
  { nome: "Vermelho", hex: "#b42318" },
  { nome: "Vinho", hex: "#7a1f3d" },
  { nome: "Rosa", hex: "#c0266d" },
  { nome: "Roxo", hex: "#6b3fa0" },
  { nome: "Azul-marinho", hex: "#1d3a6e" },
  { nome: "Azul", hex: "#1f6feb" },
  { nome: "Petróleo", hex: "#0f6b6b" },
  { nome: "Verde", hex: "#2f6b3d" },
  { nome: "Verde-limão", hex: "#5c8a1a" },
  { nome: "Laranja", hex: "#d4610f" },
  { nome: "Amarelo-ouro", hex: "#b88300" },
  { nome: "Marrom", hex: "#6b4a2b" },
  { nome: "Grafite", hex: "#2f3437" },
] as const;

const FUNDO = "#fbf7ef";

function canais(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminancia(hex: string) {
  const [r, g, b] = canais(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contraste(a: string, b: string) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
}

export const corValida = (cor: unknown): cor is string => typeof cor === "string" && /^#[0-9a-f]{6}$/.test(cor);

/** A cor escurecida até dar para ler em cima do creme (4,5:1), para títulos e textos de destaque. */
export function corLegivel(cor: string | null | undefined, padrao = "#a2441f") {
  if (!corValida(cor)) return padrao;
  let [r, g, b] = canais(cor);
  let atual = cor;
  for (let i = 0; i < 20 && contraste(atual, FUNDO) < 4.5; i++) {
    [r, g, b] = [r! * 0.88, g! * 0.88, b! * 0.88].map(Math.round);
    atual = `#${((1 << 24) | (r! << 16) | (g! << 8) | b!).toString(16).slice(1)}`;
  }
  return atual;
}

/** A cor do texto em cima da cor (branco ou quase preto, o que se lê melhor). */
export function textoSobre(cor: string) {
  return contraste(cor, "#ffffff") >= contraste(cor, "#1f1a14") ? "#ffffff" : "#1f1a14";
}
