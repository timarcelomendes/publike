// Os comunicados que o admin manda no sino (Admin › Comunicados): o público, o texto e o link do site.

export const PUBLICOS_COMUNICADO = [
  { id: "todos", nome: "Todas as contas" },
  { id: "pessoas", nome: "Pessoas (procuram trabalho ou serviço)" },
  { id: "empresas", nome: "Empresas e comércios" },
  { id: "agencias", nome: "Agências" },
  { id: "android", nome: "Quem usa Android no navegador (fora do app)" },
  { id: "iphone", nome: "Quem usa iPhone" },
  { id: "computador", nome: "Quem usa computador" },
] as const;
export type PublicoComunicado = (typeof PUBLICOS_COMUNICADO)[number]["id"];

export function nomeDoPublico(id: string) {
  return PUBLICOS_COMUNICADO.find((p) => p.id === id)?.nome ?? id;
}

/** Comunicados prontos, para abrir o formulário preenchido (?modelo=). */
export const MODELOS_COMUNICADO: Record<string, { publico: PublicoComunicado; texto: string; link: string }> = {
  teste_app: {
    publico: "android",
    texto:
      "Ajude a lançar o app do Publike no Google Play: teste no seu Android por 14 dias. Leva 2 minutos e é de graça.",
    link: "/testar-app?de=sino",
  },
};
