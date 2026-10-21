import { MODO_DEMO } from "@/lib/config";
import { pendenciasDeConexao } from "@/lib/conexoes";
import { listarMeusAnuncios, obterMeuPerfil, obterUsuario } from "@/lib/dados";
import type { Contadores } from "@/lib/modo-painel";
import { minhasConexoes } from "@/lib/servidor/conexoes";
import { conversasPorPessoa } from "@/lib/servidor/conversas";
import { minhasContas } from "@/lib/servidor/equipe";
import { modoDaConta } from "@/lib/servidor/modo";
import { MenuPainel } from "./menu-painel";

/**
 * O menu do painel com os números (quem espera resposta, pedidos, mensagens novas e pedidos
 * de conexão) no modo da conta. Fica no painel e na coluna da esquerda da home de quem entrou.
 */
export async function MenuDaConta() {
  if (MODO_DEMO) {
    return (
      <MenuPainel modo="trabalhar" contadores={{ responder: 0, pedidos: 0, mensagens: 0, conexoes: 0 }} nome={null} />
    );
  }
  const [perfil, modo, anuncios, conversas, usuario, contas, conexoes] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    modoDaConta(),
    listarMeusAnuncios().catch(() => []),
    conversasPorPessoa().catch(() => null),
    obterUsuario(),
    // a conta da pessoa e as das equipes de que faz parte (com mais de uma, dá para trocar)
    minhasContas().catch(() => []),
    minhasConexoes().catch(() => null),
  ]);
  const soma = (tipo: string) =>
    anuncios.filter((a) => a.tipo === tipo).reduce((total, a) => total + (a.curtidas_novas ?? 0), 0);
  const contadores: Contadores = {
    responder: soma("vaga"),
    pedidos: soma("servico"),
    mensagens: (conversas ?? []).reduce((total, c) => total + (c.nao_lidas ?? 0), 0),
    conexoes: pendenciasDeConexao(conexoes ?? []),
  };
  return (
    <MenuPainel
      modo={modo}
      contadores={contadores}
      nome={perfil?.nome ?? null}
      tipoConta={perfil?.tipo ?? null}
      contas={contas}
      papel={usuario?.papel ?? "dono"}
    />
  );
}
