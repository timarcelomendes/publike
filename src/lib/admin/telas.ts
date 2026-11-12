import {
  BriefcaseBusiness,
  Mail,
  Megaphone,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

// As telas do Admin num lugar só (o menu, a lista "Quem vê cada tela" e a equipe no site no ar).

export type Secao = { href: string; nome: string };

/**
 * As seções do admin, em grupos (claude/plano-avisos-de-liberacao-e-menu-admin.md, parte 2): o menu da coluna da
 * esquerda no computador e o "Seções" no celular. Os endereços são os de sempre.
 */
export const GRUPOS_ADMIN: { nome: string | null; icone?: LucideIcon; secoes: Secao[] }[] = [
  { nome: null, secoes: [{ href: "/admin", nome: "Painel" }] },
  {
    nome: "Contas",
    icone: Users,
    secoes: [
      { href: "/admin/usuarios", nome: "Usuários" },
      { href: "/admin/empresas", nome: "Empresas" },
      { href: "/admin/convites", nome: "Convites" },
      { href: "/admin/moderadores", nome: "Moderadores" },
      { href: "/admin/testadores", nome: "Testadores do app" },
    ],
  },
  {
    nome: "Vagas e candidatos",
    icone: BriefcaseBusiness,
    secoes: [
      { href: "/admin/anuncios", nome: "Anúncios" },
      { href: "/admin/curtidas", nome: "Curtidas" },
      { href: "/admin/matches", nome: "Matches" },
      { href: "/admin/esperando", nome: "Esperando" },
      { href: "/admin/vagas-paradas", nome: "Vagas paradas" },
      { href: "/admin/aderencia", nome: "Nota de aderência" },
      { href: "/admin/retorno", nome: "Retorno" },
      { href: "/admin/salarios", nome: "Salários" },
    ],
  },
  {
    nome: "Moderação",
    icone: ShieldCheck,
    secoes: [
      { href: "/admin/denuncias", nome: "Denúncias" },
      { href: "/admin/testes", nome: "Testes" },
      { href: "/admin/falhas", nome: "Falhas" },
      { href: "/admin/sugestoes", nome: "Sugestões" },
    ],
  },
  {
    nome: "Comunicação",
    icone: Mail,
    secoes: [
      { href: "/admin/emails", nome: "E-mails" },
      { href: "/admin/comunicados", nome: "Comunicados" },
      { href: "/admin/novidades", nome: "Novidades" },
      { href: "/admin/noticias", nome: "Notícias" },
    ],
  },
  {
    nome: "Divulgação",
    icone: Megaphone,
    secoes: [
      { href: "/admin/vagas-do-dia", nome: "Vagas do dia" },
      { href: "/admin/campanhas", nome: "Campanhas" },
      { href: "/admin/banners", nome: "Banners" },
      { href: "/admin/impulsos", nome: "Impulsos" },
    ],
  },
  { nome: "Dinheiro", icone: Wallet, secoes: [{ href: "/admin/pagamentos", nome: "Pagamentos" }] },
  {
    nome: "Sistema",
    icone: Settings,
    secoes: [
      { href: "/admin/ia", nome: "IA" },
      { href: "/admin/chaves", nome: "Chaves" },
      { href: "/admin/telas", nome: "Quem vê cada tela" },
    ],
  },
];


/**
 * As telas que já abrem no site no ar (o código delas não usa a chave secreta), na ordem das abas da equipe, e quem
 * precisa ser para abrir: moderador (as funções do banco conferem), equipe publike.org, ou um dos dois. A marca
 * "Somente publike.org" (Admin › Quem vê cada tela) decide, além disso, se o moderador vê. As outras telas seguem só no
 * computador do dono, até o código delas ficar pronto para o site.
 */
export const TELAS_DO_SITE: { href: string; nome: string; precisa: "moderador" | "equipe" | "qualquer" }[] = [
  { href: "/admin/numeros", nome: "Números", precisa: "qualquer" },
  { href: "/admin/denuncias", nome: "Denúncias", precisa: "moderador" },
  { href: "/admin/anuncios", nome: "Anúncios", precisa: "moderador" },
  // os stories e o carrossel do dia, também pelo celular (só vagas no ar, que já são públicas)
  { href: "/admin/vagas-do-dia", nome: "Vagas do dia", precisa: "moderador" },
  // as curtidas também no site no ar (a função moderacao_curtidas, só para moderador)
  { href: "/admin/curtidas", nome: "Curtidas", precisa: "moderador" },
  { href: "/admin/telas", nome: "Quem vê cada tela", precisa: "equipe" },
  // o impulso da vaga, também pelo site (migração 20270425120000; só a equipe publike.org)
  { href: "/admin/impulsos", nome: "Impulsos", precisa: "equipe" },
];

/** Todas as telas da lista, com o nome (as do menu e as que só existem no site, como Números). */
export const TODAS_AS_TELAS: Secao[] = [
  ...GRUPOS_ADMIN.flatMap((g) => g.secoes),
  { href: "/admin/numeros", nome: "Números" },
];
