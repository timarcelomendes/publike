import "server-only";
import { cache } from "react";
import type { NumerosDaBarra } from "@/components/barra-inferior-base";
import { MODO_DEMO } from "@/lib/config";
import { pendenciasDeConexao } from "@/lib/conexoes";
import { listarMeusAnuncios, obterUsuario } from "@/lib/dados";
import type { ModoPainel } from "@/lib/modo-painel";
import { caminhoDaConta } from "./caminho";
import { minhasConexoes } from "./conexoes";
import { conversasPorPessoa } from "./conversas";
import { modoDaConta } from "./modo";

/**
 * A atividade principal de quem entrou (Contratar, Trabalhar ou Serviços) e os números do que espera a
 * pessoa: os candidatos ou os pedidos para responder, as mensagens novas e os pedidos de conexão. A
 * barra de baixo do celular e o menu do topo do computador usam os dois. `null`: visitante.
 */
export const navegacaoDaConta = cache(async (): Promise<{ modo: ModoPainel; numeros: NumerosDaBarra } | null> => {
  const usuario = MODO_DEMO ? null : await obterUsuario();
  if (!usuario) return null;
  const modo = await modoDaConta().catch(() => "trabalhar" as const);
  const [conversas, conexoes, anuncios, caminho] = await Promise.all([
    conversasPorPessoa().catch(() => null),
    minhasConexoes().catch(() => null),
    modo === "trabalhar" ? Promise.resolve([]) : listarMeusAnuncios().catch(() => []),
    modo === "contratar" ? caminhoDaConta().catch(() => null) : Promise.resolve(null),
  ]);
  const soma = (tipo: string) =>
    anuncios.filter((a) => a.tipo === tipo).reduce((total, a) => total + (a.curtidas_novas ?? 0), 0);
  return {
    modo,
    numeros: {
      mensagens: (conversas ?? []).reduce((total, c) => total + (c.nao_lidas ?? 0), 0),
      conexoes: pendenciasDeConexao(conexoes ?? []),
      segunda: modo === "contratar" ? (caminho?.responder ?? soma("vaga")) : modo === "servicos" ? soma("servico") : 0,
    },
  };
});
