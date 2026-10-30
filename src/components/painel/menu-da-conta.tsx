import { MODO_DEMO } from "@/lib/config";
import { copilotoLiberado, obterMeuPerfil, obterUsuario, recursosPagos } from "@/lib/dados";
import { marcaDoRecurso } from "@/lib/recursos-pagos";
import { contadoresDoPainel } from "@/lib/servidor/contadores-do-painel";
import { minhasContas } from "@/lib/servidor/equipe";
import { atividadesDoMenu } from "@/lib/servidor/modo";
import { agoraDaRequisicao } from "@/lib/tempo";
import { MenuPainel } from "./menu-painel";

/**
 * O menu do painel com os números (quem espera resposta, pedidos, mensagens novas e pedidos
 * de conexão, que as Mensagens somam) de todas as atividades da conta. Fica no painel e na página
 * Talentos.
 */
export async function MenuDaConta() {
  if (MODO_DEMO) {
    return (
      <MenuPainel
        atividades={["trabalhar"]}
        contadores={{ responder: 0, pedidos: 0, mensagens: 0 }}
        nome={null}
      />
    );
  }
  const [perfil, atividades, usuario, contas, contadores, copiloto, recursos, agora] = await Promise.all([
    obterMeuPerfil().catch(() => null),
    atividadesDoMenu(),
    obterUsuario(),
    // a conta da pessoa e as das equipes de que faz parte (com mais de uma, dá para trocar)
    minhasContas().catch(() => []),
    // os mesmos números da grade do painel
    contadoresDoPainel(),
    copilotoLiberado(),
    recursosPagos(),
    agoraDaRequisicao(),
  ]);
  // a pílula segue a conta: "15 dias grátis", "faltam N dias" no teste, nada depois de liberado
  const pilulas = recursos
    ? {
        copiloto: marcaDoRecurso(recursos.copiloto, agora).curto,
        testes: marcaDoRecurso(recursos.testes, agora).curto,
      }
    : undefined;
  return (
    <MenuPainel
      atividades={atividades}
      contadores={contadores}
      nome={perfil?.nome ?? null}
      tipoConta={perfil?.tipo ?? null}
      contas={contas}
      papel={usuario?.papel ?? "dono"}
      // o Hoje de quem procura trabalho (a atividade principal) é a grade das seções
      gradeNoHoje={atividades[0] === "trabalhar"}
      copiloto={copiloto}
      pilulas={pilulas}
    />
  );
}
