// Saúde da vaga: o que deixa a vaga achável e fácil de decidir, item por item, com a
// dica de como melhorar. Só conta o que dá para saber sem a IA: o que a vaga diz, os
// números (visitas e candidatos) e se tem gente esperando resposta.

import { juntarTriagem, perguntasDoBanco, type Triagem } from "./vaga-extra";

export type ItemSaude = {
  chave: string;
  ok: boolean;
  titulo: string;
  /** o que fazer, quando não está ok */
  dica: string;
  /** onde resolver */
  href: string;
  /** pesa mais: aparece primeiro quando falta */
  peso: number;
};

export type Saude = {
  nota: number;
  nivel: "boa" | "atencao" | "fraca";
  itens: ItemSaude[];
  /** o que falta, do mais importante para o menos */
  faltando: ItemSaude[];
};

type Vaga = {
  id: string;
  status: string;
  expira_em: string;
  criado_em: string;
  descricao: string | null;
  pagamento_valor: number | null;
  beneficios: string | null;
  beneficios_lista?: string[] | null;
  beneficios_extras?: string[] | null;
  horario: string | null;
  jornada: string | null;
  horario_detalhe: unknown;
  escolaridade_minima: string | null;
  experiencia: string | null;
  cnh: string | null;
  perguntas: unknown;
};

const DIA = 24 * 3600e3;

export function saudeDaVaga(
  v: Vaga,
  numeros: { visitas: number; candidatos: number; esperandoMuito: number },
  triagem: Triagem,
  agora: number,
): Saude {
  const editar = `/painel/anuncio/${v.id}/editar`;
  const comResposta = juntarTriagem(perguntasDoBanco(v.perguntas), triagem).filter((q) => q.esperada);
  const requisitos = [v.escolaridade_minima, v.experiencia, v.cnh].filter(Boolean).length + comResposta.length;
  const noAr = v.status === "ativo" && new Date(v.expira_em).getTime() > agora;
  const dias = Math.ceil((new Date(v.expira_em).getTime() - agora) / DIA);
  const semanas = (agora - new Date(v.criado_em).getTime()) / (7 * DIA);
  const beneficios = (v.beneficios_lista?.length ?? 0) + (v.beneficios_extras?.length ?? 0) + (v.beneficios ? 1 : 0);
  // muita gente vê e pouca curte: o que trava costuma ser salário, horário ou título
  const conversaoBaixa = numeros.visitas >= 40 && numeros.candidatos / numeros.visitas < 0.03;

  const itens: ItemSaude[] = [
    {
      chave: "no_ar",
      ok: noAr && dias > 5,
      titulo: noAr ? (dias > 5 ? "No ar" : `Sai do ar em ${Math.max(dias, 0)} dias`) : "Fora do ar",
      dica: noAr ? "Renove por mais 30 dias para continuar recebendo candidatos." : "Reative ou renove a vaga.",
      href: "/painel/anuncios?tipo=vaga",
      peso: 5,
    },
    {
      chave: "respostas",
      ok: numeros.esperandoMuito === 0,
      titulo: numeros.esperandoMuito
        ? `${numeros.esperandoMuito} esperando resposta há mais de 2 dias`
        : "Respostas em dia",
      dica: "Responder em até 1 dia mostra o selo verde de quem responde rápido na busca.",
      href: `/painel/caixa?aba=responder&vaga=${v.id}`,
      peso: 4,
    },
    {
      chave: "salario",
      ok: v.pagamento_valor !== null,
      titulo: v.pagamento_valor !== null ? "Diz o salário" : "Sem o salário",
      dica: "Vaga com salário recebe mais curtidas: quem procura filtra por ele.",
      href: editar,
      peso: 3,
    },
    {
      chave: "horario",
      ok: Boolean(v.horario_detalhe || v.jornada || v.horario),
      titulo: v.horario_detalhe || v.jornada || v.horario ? "Diz o horário" : "Sem o horário",
      dica: "Diga os turnos e os dias: a busca por turno e o % de match usam isso.",
      href: editar,
      peso: 3,
    },
    {
      chave: "requisitos",
      ok: requisitos >= 2,
      titulo: requisitos >= 2 ? "Diz o que pede" : "Pede pouco para comparar",
      dica: "Diga escolaridade, experiência, CNH ou a resposta que procura nas perguntas: a nota de aderência fica certeira.",
      href: editar,
      peso: 2,
    },
    {
      chave: "descricao",
      ok: (v.descricao ?? "").trim().length >= 200,
      titulo: (v.descricao ?? "").trim().length >= 200 ? "Descrição com detalhes" : "Descrição curta",
      dica: "Conte o dia a dia do trabalho, onde fica e o que a pessoa vai fazer.",
      href: editar,
      peso: 1,
    },
    {
      chave: "beneficios",
      ok: beneficios > 0,
      titulo: beneficios > 0 ? "Diz os benefícios" : "Sem benefícios",
      dica: "Vale-transporte, refeição, folgas: aparece no cartão da vaga na busca.",
      href: editar,
      peso: 1,
    },
  ];
  if (noAr && semanas >= 1 && numeros.candidatos === 0) {
    itens.push({
      chave: "sem_candidatos",
      ok: false,
      titulo: "Uma semana sem candidatos",
      dica: "Divulgue o link da sua página de vagas no WhatsApp e no Instagram, ou revise salário e horário.",
      href: "/painel/anuncios?tipo=vaga#pagina-de-vagas",
      peso: 4,
    });
  } else if (conversaoBaixa) {
    itens.push({
      chave: "conversao",
      ok: false,
      titulo: `${numeros.visitas} visitas e só ${numeros.candidatos} ${numeros.candidatos === 1 ? "curtida" : "curtidas"}`,
      dica: "Muita gente vê e pouca curte: confira se o salário, o horário e o título estão claros.",
      href: editar,
      peso: 3,
    });
  }

  const total = itens.reduce((t, i) => t + i.peso, 0);
  const pontos = itens.reduce((t, i) => t + (i.ok ? i.peso : 0), 0);
  const nota = Math.round((100 * pontos) / total);
  const faltando = itens.filter((i) => !i.ok).sort((a, b) => b.peso - a.peso);
  return { nota, nivel: nota >= 80 ? "boa" : nota >= 55 ? "atencao" : "fraca", itens, faltando };
}
