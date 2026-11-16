import "server-only";
import { cache } from "react";
import { listarMeusAnuncios } from "@/lib/dados";
import type { Contadores } from "@/lib/modo-painel";
import { caminhoDaConta } from "./caminho";
import { conversasPorPessoa } from "./conversas";
import { atividadesDoMenu } from "./modo";
import { resumoDasVisitas } from "./visitas";
import { resumoDosPedidos } from "./pedidos-do-cliente";

/**
 * Os números das seções do painel, de todas as atividades da conta (o menu e a grade do painel usam os
 * mesmos): quem espera resposta, pedidos, mensagens novas (sem os pedidos de conexão), visitas novas e, em
 * Contratar, o caminho da vaga.
 */
export const contadoresDoPainel = cache(async (): Promise<Contadores> => {
  const [atividades, anuncios, conversas, visitas] = await Promise.all([
    atividadesDoMenu(),
    listarMeusAnuncios().catch(() => []),
    conversasPorPessoa().catch(() => null),
    resumoDasVisitas().catch(() => null),
  ]);
  const soma = (tipo: string) =>
    anuncios.filter((a) => a.tipo === tipo).reduce((total, a) => total + (a.curtidas_novas ?? 0), 0);
  // o caminho da vaga (Contratar): clientes, vagas no ar, prontos para o cliente, entrevistas e contratados
  const caminho = atividades.includes("contratar") ? await caminhoDaConta().catch(() => null) : null;
  // agência: os pedidos de vaga novos dos clientes (sem a migração, nada)
  const pedidosClientes = caminho?.agencia ? ((await resumoDosPedidos().catch(() => null))?.novos ?? 0) : 0;
  return {
    responder: caminho?.responder ?? soma("vaga"),
    pedidos: soma("servico"),
    // as Mensagens: só as mensagens novas (16/11/2026: os pedidos de conexão não são mensagem por ler)
    mensagens: (conversas ?? []).reduce((total, c) => total + (c.nao_lidas ?? 0), 0),
    visitas: visitas?.novas ?? 0,
    ...(caminho && {
      clientes: caminho.clientes,
      pedidosClientes,
      vagasNoAr: caminho.vagasNoAr,
      prontos: caminho.prontos,
      entrevistas: caminho.entrevistas,
      contratados: caminho.contratados,
    }),
  };
});
