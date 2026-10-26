import { Handshake, MessageCircle, MessagesSquare, UserRound } from "lucide-react";
import { caminhoConexao, type Conexao } from "@/lib/conexoes";
import { caminhoConversa, type ConversaPessoa } from "@/lib/conversas";
import { perfilCompleto } from "@/lib/dados";
import { plural } from "@/lib/formato";
import type { MeuPerfil } from "@/lib/tipos";
import type { Cartao } from "./hoje";

// Os cartões de "Para fazer agora" que valem em mais de um lugar (a página Hoje do painel, as
// Candidaturas e a home das empresas): pedidos de conexão, mensagens novas e o perfil.

/** Uma leitura que, se falhar, não derruba a página (o número vira "–"). */
export async function talvez<T>(leitura: Promise<T>, oQue: string): Promise<T | null> {
  try {
    return await leitura;
  } catch (e) {
    console.error(`Publike: Hoje sem ${oQue}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** "Garçom", "Garçom e Cozinheira", "Garçom e mais 2" */
export function nomes(lista: string[]) {
  const unicos = [...new Set(lista)];
  return unicos.length <= 2 ? unicos.join(" e ") : `${unicos[0]} e mais ${unicos.length - 1}`;
}

export const soma = (lista: number[]) => lista.reduce((total, n) => total + n, 0);

/** Os pedidos de conexão para responder (Contratar e Trabalhar). As mensagens ficam nas conversas. */
export function cartoesDeConexao(lista: Conexao[] | null): Cartao[] {
  const recebidos = (lista ?? []).filter((c) => c.status === "pendente" && !c.pedi);
  if (!recebidos.length) return [];
  return [
    {
      icone: Handshake,
      tom: "urgente",
      quando: "Conexões",
      titulo: plural(recebidos.length, "pedido de conexão", "pedidos de conexão"),
      texto: `De ${nomes(recebidos.map((c) => c.outro_nome))}. Aceite ou recuse.`,
      href: recebidos.length === 1 ? caminhoConexao(recebidos[0].outro_id) : "/painel/conexoes",
      acao: "Responder",
    },
  ];
}

/** As conversas de cada modo (uma por pessoa): as vagas em comum e, para talento e empresa, a conexão. */
export const conversaDoModo = {
  contratar: (c: ConversaPessoa) => c.conectados || c.vagas.some((v) => v.papel === "publiquei" && v.tipo === "vaga"),
  trabalhar: (c: ConversaPessoa) => c.conectados || c.vagas.some((v) => v.papel === "curti" && v.tipo === "vaga"),
  servicos: (c: ConversaPessoa) => c.vagas.some((v) => v.papel === "publiquei" && v.tipo === "servico"),
};

/** Os cartões que valem em todos os modos: perfil incompleto, mensagens novas e matches sem oi. */
export function cartoesDaConta(
  perfil: MeuPerfil | null,
  conversas: ConversaPessoa[] | null,
  doModo: (c: ConversaPessoa) => boolean,
): Cartao[] {
  // match sem nenhuma mensagem ainda (a conversa é uma por pessoa: com mensagem de outra vaga, já tem oi)
  const semOi = (conversas ?? []).filter((c) => doModo(c) && c.vagas.length > 0 && !c.ultima_texto);
  const linkDaConversa = (lista: ConversaPessoa[]) =>
    lista.length === 1 ? caminhoConversa(lista[0].outro_id) : "/painel/conversas";
  const cartoes: Cartao[] = [...cartoesDeMensagens(conversas, doModo)];
  if (semOi.length) {
    cartoes.push({
      icone: MessageCircle,
      quando: "Conexão nova",
      titulo: `${plural(semOi.length, "match", "matches")} sem conversa ainda`,
      texto: `Mande um oi para ${nomes(semOi.map((c) => c.outro_nome))}`,
      href: linkDaConversa(semOi),
      acao: "Mandar um oi",
    });
  }
  if (!perfilCompleto(perfil)) {
    cartoes.push({
      icone: UserRound,
      quando: "Perfil",
      titulo: "Complete seu perfil",
      texto: "Com um WhatsApp ou e-mail você já pode publicar e curtir.",
      href: "/perfil",
      acao: "Completar",
    });
  }
  return cartoes;
}

/** As mensagens novas, uma conversa por pessoa. */
export function cartoesDeMensagens(
  conversas: ConversaPessoa[] | null,
  doModo: (c: ConversaPessoa) => boolean,
): Cartao[] {
  const comNovas = (conversas ?? []).filter((c) => doModo(c) && c.nao_lidas > 0);
  if (!comNovas.length) return [];
  return [
    {
      icone: MessagesSquare,
      quando: "Mensagens",
      titulo: plural(soma(comNovas.map((c) => c.nao_lidas)), "mensagem nova", "mensagens novas"),
      texto: `De ${nomes(comNovas.map((c) => c.outro_nome))}`,
      href: comNovas.length === 1 ? caminhoConversa(comNovas[0].outro_id) : "/painel/conversas",
      acao: "Ler e responder",
    },
  ];
}
