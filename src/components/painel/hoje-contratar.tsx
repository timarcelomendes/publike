import { ajudaDaIADisponivel, listarMeusAnuncios, listarMeusCandidatos } from "@/lib/dados";
import type { Conexao } from "@/lib/conexoes";
import type { ConversaPessoa } from "@/lib/conversas";
import { listarMeusClientes } from "@/lib/servidor/clientes";
import { minhasContas } from "@/lib/servidor/equipe";
import type { MeuPerfil, Usuario } from "@/lib/tipos";
import { cartoesDeConexao, cartoesDeMensagens, conversaDoModo, talvez } from "./cartoes-hoje";
import { PainelRecrutador } from "./recrutador";

/**
 * A página Hoje no modo Contratar (comércio, empresa e agência): o painel e a home das
 * empresas mostram a mesma, para cuidar dos candidatos.
 */
export async function HojeContratar({
  usuario,
  perfil,
  conversas,
  conexoes,
  agora,
}: {
  usuario: Usuario;
  perfil: MeuPerfil;
  conversas: ConversaPessoa[] | null;
  conexoes: Conexao[] | null;
  agora: number;
}) {
  const [anuncios, candidatos, clientes, fotoDaVaga] = await Promise.all([
    talvez(listarMeusAnuncios(), "os anúncios"),
    listarMeusCandidatos(),
    // agência: quantos clientes (o atalho "Seus clientes")
    perfil.tipo === "agencia" ? listarMeusClientes().then((l) => l?.filter((c) => !c.arquivado_em).length ?? 0) : null,
    ajudaDaIADisponivel(),
  ]);
  // quem é da equipe da agência: "Boa noite, Bruno" (o nome da pessoa, não o da agência)
  const pessoa = usuario.papel !== "dono" ? (await minhasContas()).find((c) => c.papel === "dono") : null;
  return (
    <PainelRecrutador
      nome={pessoa?.nome ?? perfil.nome}
      autorId={perfil.id}
      anuncios={anuncios}
      candidatos={candidatos}
      agora={agora}
      clientes={clientes}
      extras={[...cartoesDeConexao(conexoes), ...cartoesDeMensagens(conversas, conversaDoModo.contratar)]}
      conversas={conversas}
      fotoDaVaga={fotoDaVaga}
    />
  );
}
