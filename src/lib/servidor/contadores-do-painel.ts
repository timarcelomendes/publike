import "server-only";
import { cache } from "react";
import { pendenciasDeConexao } from "@/lib/conexoes";
import { listarMeusAnuncios } from "@/lib/dados";
import type { Contadores } from "@/lib/modo-painel";
import { caminhoDaConta } from "./caminho";
import { minhasConexoes } from "./conexoes";
import { conversasPorPessoa } from "./conversas";
import { atividadesDoMenu } from "./modo";
import { resumoDasVisitas } from "./visitas";

/**
 * Os números das seções do painel, de todas as atividades da conta (o menu e a grade do painel usam os
 * mesmos): quem espera resposta, pedidos, mensagens novas e pedidos de conexão (as Mensagens somam os
 * dois), visitas novas e, em Contratar, o caminho da vaga.
 */
export const contadoresDoPainel = cache(async (): Promise<Contadores> => {
  const [atividades, anuncios, conversas, conexoes, visitas] = await Promise.all([
    atividadesDoMenu(),
    listarMeusAnuncios().catch(() => []),
    conversasPorPessoa().catch(() => null),
    minhasConexoes().catch(() => null),
    resumoDasVisitas().catch(() => null),
  ]);
  const soma = (tipo: string) =>
    anuncios.filter((a) => a.tipo === tipo).reduce((total, a) => total + (a.curtidas_novas ?? 0), 0);
  // o caminho da vaga (Contratar): clientes, vagas no ar, prontos para o cliente, entrevistas e contratados
  const caminho = atividades.includes("contratar") ? await caminhoDaConta().catch(() => null) : null;
  return {
    responder: caminho?.responder ?? soma("vaga"),
    pedidos: soma("servico"),
    // as Mensagens juntam as conversas e as conexões: as mensagens novas e os pedidos para responder
    mensagens:
      (conversas ?? []).reduce((total, c) => total + (c.nao_lidas ?? 0), 0) + pendenciasDeConexao(conexoes ?? []),
    visitas: visitas?.novas ?? 0,
    ...(caminho && {
      clientes: caminho.clientes,
      vagasNoAr: caminho.vagasNoAr,
      prontos: caminho.prontos,
      entrevistas: caminho.entrevistas,
      contratados: caminho.contratados,
    }),
  };
});
