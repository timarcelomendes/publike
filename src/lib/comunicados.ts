// Os comunicados que o admin manda no sino (Admin › Comunicados): o público, o texto e o link do site.

export const PUBLICOS_COMUNICADO = [
  { id: "todos", nome: "Todas as contas" },
  { id: "pessoas", nome: "Pessoas (procuram trabalho ou serviço)" },
  { id: "pessoas_sem_curriculo", nome: "Pessoas sem currículo no Publike" },
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
export const MODELOS_COMUNICADO: Record<
  string,
  { publico: PublicoComunicado; texto: string; link: string; nome?: string }
> = {
  // 06/11/2026 (claude/plano-rodape-e-comunicados-organicos.md): os com nome aparecem em "Começar de um pronto"
  indique_curriculo_simples: {
    nome: "Indique o currículo simples",
    publico: "pessoas",
    texto:
      "Conhece alguém procurando emprego? Mande o currículo simples grátis do Publike: preenche e baixa em PDF, sem cadastro.",
    link: "/curriculo-simples",
  },
  monte_seu_curriculo: {
    nome: "Monte seu currículo",
    publico: "pessoas_sem_curriculo",
    texto:
      "As empresas de Goiânia procuram pelo currículo no Publike. Monte o seu em 5 minutos: fica salvo e você se candidata com um toque.",
    link: "/perfil/curriculo",
  },
  // 03/11/2026: o "Quero testar" do /testar-app (o link chega no WhatsApp, sem o Grupo do Google)
  teste_app_whatsapp: {
    publico: "android",
    texto:
      "Falta pouco para o app do Publike chegar ao Google Play! Ajude testando no seu Android por 14 dias: deixe o e-mail da sua conta Google e a gente manda o link no seu WhatsApp.",
    link: "/testar-app?de=sino#quero-testar",
  },
  teste_app: {
    publico: "android",
    texto:
      "Ajude a lançar o app do Publike no Google Play: teste no seu Android por 14 dias. Leva 2 minutos e é de graça.",
    link: "/testar-app?de=sino",
  },
  // 02/11/2026: para quem tentou e parou no "não está disponível" (o Instalar antes do Aceitar). O link é outro
  // (o `&tentar=2`), para chegar também a quem já recebeu o primeiro convite.
  teste_app_de_novo: {
    publico: "android",
    texto:
      "Tentou instalar o app do Publike e o Google Play disse que não está disponível? Agora a página mostra a ordem certa: entre no grupo, aceite o teste e só depois instale.",
    link: "/testar-app?de=sino&tentar=2",
  },
};
