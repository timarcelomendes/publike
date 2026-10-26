// Os grupos da página Avisos e notificações (/perfil/avisos): para cada um, a conta escolhe se ele
// chega no e-mail e no celular. O sino mostra tudo. Os avisos da conta e da moderação não têm grupo e
// chegam sempre. O banco tem a mesma lista (privado.grupo_do_aviso, em
// supabase/migrations/20261120120000_avisos_por_tipo.sql): mudar um, mudar o outro.

export const GRUPOS_DE_AVISO = [
  {
    valor: "mensagens",
    nome: "Mensagens",
    ajuda: "Quando alguém manda mensagem para você.",
    celular: true,
  },
  {
    valor: "andamento",
    nome: "Curtidas, matches e o andamento das vagas",
    ajuda: "Curtidas e pedidos, matches, entrevistas, convites para vagas, contratações e avaliações.",
    celular: true,
  },
  {
    valor: "conexoes",
    nome: "Pedidos de conexão",
    ajuda: "Quando alguém quer se conectar com você ou aceita o seu pedido.",
    celular: true,
  },
  {
    valor: "vagas_novas",
    nome: "Vagas novas",
    ajuda: "Das buscas que você salvou e das empresas que você segue.",
    celular: true,
  },
  {
    valor: "semana",
    nome: "Vagas que combinam com você, toda semana",
    ajuda: "Às segundas, as vagas novas com bom % de match com o seu currículo.",
    celular: true,
  },
  {
    valor: "convites",
    nome: "Convites do Publike",
    ajuda: "Quando o Publike convida para montar o currículo, a vitrine ou a página da empresa.",
    // só por e-mail
    celular: false,
  },
] as const;

export type GrupoDeAviso = (typeof GRUPOS_DE_AVISO)[number]["valor"];
export type CanalDeAviso = "email" | "celular";

export function ehGrupoDeAviso(valor: unknown): valor is GrupoDeAviso {
  return GRUPOS_DE_AVISO.some((g) => g.valor === valor);
}

/** O nome e a ajuda do grupo para esta conta: a empresa recebe os talentos da semana, não as vagas. */
export function grupoParaConta(valor: GrupoDeAviso, empresa: boolean) {
  const grupo = GRUPOS_DE_AVISO.find((g) => g.valor === valor) ?? GRUPOS_DE_AVISO[0];
  if (grupo.valor === "semana" && empresa) {
    return {
      ...grupo,
      nome: "Talentos que combinam com as suas vagas, toda semana",
      ajuda: "Às segundas, currículos da aba Talentos que combinam com as suas vagas no ar.",
    };
  }
  return grupo;
}

/**
 * O que o link do e-mail desliga, para a página de "parar de receber" ("todos": os seis grupos). Sem
 * entrar, não se sabe se a conta é de empresa: o da semana tem um nome que serve para as duas.
 */
export function nomeDoQueSai(valor: string) {
  if (valor === "todos") return "Todos os avisos por e-mail (menos os da sua conta e da moderação)";
  if (valor === "semana") return "Vagas e talentos que combinam, toda semana";
  return ehGrupoDeAviso(valor) ? grupoParaConta(valor, false).nome : null;
}
