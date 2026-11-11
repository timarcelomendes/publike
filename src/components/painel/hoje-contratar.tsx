import { listarMeusAnuncios, listarMeusCandidatos } from "@/lib/dados";
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
  const [anuncios, candidatos, clientes] = await Promise.all([
    talvez(listarMeusAnuncios(), "os anúncios"),
    listarMeusCandidatos(),
    // agência: quantos clientes
    perfil.tipo === "agencia" ? listarMeusClientes().then((l) => l?.filter((c) => !c.arquivado_em).length ?? 0) : null,
  ]);
  // quem é da equipe da agência: "Boa noite, Bruno" (o nome da pessoa, não o da agência)
  const pessoa = usuario.papel !== "dono" ? (await minhasContas()).find((c) => c.papel === "dono") : null;
  // quem é dono: o nome de quem entrou (Google, LinkedIn); sem ele, ou se é o mesmo da empresa, o nome da empresa
  // inteiro ("Boa tarde, Mais RH", não "Boa tarde, Mais")
  const quem = pessoa?.nome ?? usuario.nome;
  const daPessoa = quem && quem.trim().toLowerCase() !== perfil.nome.trim().toLowerCase() ? quem : null;
  return (
    <PainelRecrutador
      nome={daPessoa ?? perfil.nome}
      nomeInteiro={!daPessoa}
      autorId={perfil.id}
      anuncios={anuncios}
      candidatos={candidatos}
      agora={agora}
      clientes={clientes}
      extras={[...cartoesDeConexao(conexoes), ...cartoesDeMensagens(conversas, conversaDoModo.contratar)]}
      conversas={conversas}
      perfilPronto={perfil.tipo === "agencia" ? Boolean(perfil.cnpj) : Boolean(perfil.foto || perfil.sobre)}
    />
  );
}
