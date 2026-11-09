import { jeitosDeEntrar } from "./login-social";

// Por que a pessoa precisa entrar, pelo destino (?next=): o título e o texto da página /entrar e da folha de entrar
// (folha-de-entrar.tsx), que sobe por cima da página sem trocar de página.

export type Contexto = {
  titulo: string;
  texto: string;
  padrao?: boolean;
  publica?: boolean;
  /** o exemplo ao lado: vitrine (quem presta serviço) ou pedido de serviço (quem contrata um) */
  demo?: "vitrine" | "pedido";
};

/** O título conta por que a pessoa precisa entrar (vem de ?next=). */
export function contexto(proximo: string): Contexto {
  if (/^\/anuncio\/[^/]+\/denunciar/.test(proximo)) {
    return { titulo: "Entre para denunciar o anúncio", texto: "Sua denúncia vai direto para a moderação do Publike." };
  }
  // o convite das vagas vistas: volta para a vaga com avisar_area=1 e o aviso da área sai sozinho
  if (/[?&]avisar_area=1(&|$)/.test(proximo)) {
    return {
      titulo: "Entre para receber as vagas novas",
      texto: "Quando abrir uma vaga nova dessa área, avisamos no site e por e-mail.",
    };
  }
  if (proximo.startsWith("/anuncio/") && /[?&]salvar=1(&|$)/.test(proximo)) {
    return {
      titulo: "Entre para salvar a vaga",
      texto: "Ela fica guardada na sua conta, para você voltar e curtir quando quiser.",
    };
  }
  if (proximo.startsWith("/anuncio/") && /[?&]servico=1(&|$)/.test(proximo)) {
    return {
      titulo: "Entre para pedir o serviço",
      texto: "O profissional vê seu perfil e decide se aceita. Se aceitar, o WhatsApp dos dois aparece.",
      demo: "pedido",
    };
  }
  if (proximo.startsWith("/anuncio/") && proximo.endsWith("#comentarios")) {
    return {
      titulo: "Entre para comentar",
      texto: "Tire a sua dúvida sobre a vaga. Quem publicou responde ali mesmo, para todo mundo ver.",
    };
  }
  if (proximo.startsWith("/anuncio/") && proximo.endsWith("#indicar")) {
    return {
      titulo: "Entre para indicar a vaga",
      texto: "Mandamos a vaga para o e-mail do seu amigo, em seu nome. Se ele não tiver conta, cria em um toque.",
    };
  }
  if (proximo.startsWith("/anuncio/")) {
    return {
      titulo: "Entre para curtir a vaga",
      texto: "Quem publicou vê seu perfil. Se curtir você de volta, o WhatsApp dos dois aparece.",
    };
  }
  if (proximo.startsWith("/publicar?continuar=1")) {
    return {
      titulo: "Falta só entrar para publicar",
      texto: `Sua vaga está guardada neste aparelho. Entre com ${jeitosDeEntrar()} e ela vai ao ar na hora. Seu WhatsApp só aparece para quem você aceitar.`,
      publica: true,
    };
  }
  if (proximo.startsWith("/publicar")) {
    return {
      titulo: "Entre para publicar grátis",
      texto: "Leva uns dois minutos. Quem tiver interesse curte, e você escolhe com quem conversar.",
      publica: true,
    };
  }
  if (proximo.startsWith("/painel/servicos")) {
    return {
      titulo: "Entre para montar sua vitrine grátis",
      texto: "Mostre seus serviços para quem mora perto. Leva uns dois minutos e é grátis para todos.",
      publica: true,
      demo: "vitrine",
    };
  }
  if (proximo.startsWith("/painel")) {
    return { titulo: "Entre para ver seu painel", texto: "Seus anúncios, curtidas e matches ficam todos lá.", publica: true };
  }
  if (proximo.startsWith("/perfil/curriculo")) {
    return { titulo: "Entre para cadastrar seu currículo", texto: "As empresas da região acham você na aba Talentos." };
  }
  if (proximo.startsWith("/talentos")) {
    return {
      titulo: "Entre como empresa para ver o currículo completo",
      texto: "Veja onde a pessoa trabalhou e convide para a sua vaga. É grátis.",
      publica: true,
    };
  }
  if (proximo.startsWith("/descobrir")) {
    return {
      titulo: "Entre para curtir as vagas que combinam com você",
      texto: "Quem publicou vê seu perfil. Se curtir você de volta, o WhatsApp dos dois aparece.",
    };
  }
  // "Me avise de vagas assim" (a busca volta com avisar=1 e o aviso sai sozinho)
  if (/[?&]avisar=1(&|$)/.test(proximo)) {
    return {
      titulo: "Entre para receber aviso de vagas assim",
      texto: "Quando entrar uma vaga nova parecida, avisamos no site e por e-mail.",
    };
  }
  if (proximo.startsWith("/perfil")) {
    return { titulo: "Entre para cuidar do seu perfil", texto: "É ele que aparece quando você curte um anúncio." };
  }
  if (proximo.startsWith("/admin")) {
    return { titulo: "Entre com a sua conta da equipe", texto: "Use o mesmo jeito de entrar de sempre." };
  }
  return {
    titulo: "Entrar no Publike",
    texto: "Quem precisa publica, quem faz curte. Deu match, vocês conversam.",
    padrao: true,
  };
}
