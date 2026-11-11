import { pendenciasDeConexao } from "@/lib/conexoes";
import { plural } from "@/lib/formato";
import { minhasConexoes } from "@/lib/servidor/conexoes";
import { conversasPorPessoa } from "@/lib/servidor/conversas";
import { CabecalhoDaPagina } from "./cabecalho-da-pagina";
import { Segmentos } from "./segmentos";
import { SemLinhaDoPainel } from "./sem-linha-do-painel";

export type AbaMensagens = "conversas" | "matches" | "conexoes";

const ABAS: { valor: AbaMensagens; nome: string; href: string }[] = [
  { valor: "conversas", nome: "Conversas", href: "/painel/conversas" },
  { valor: "matches", nome: "Matches", href: "/painel/matches" },
  { valor: "conexoes", nome: "Conexões", href: "/painel/conexoes" },
];

type Numero = { n: number; leitor: string };

/** As abas das Mensagens; sem `numeros` enquanto o servidor conta (o mesmo tamanho, sem pular). */
export function AbasMensagensBase({
  atual,
  numeros = {},
}: {
  atual: AbaMensagens;
  numeros?: Partial<Record<AbaMensagens, Numero>>;
}) {
  return (
    <>
      <SemLinhaDoPainel />
      {/* o alto de todas as telas do painel (11/11/2026); no celular, as Mensagens são uma tela de app: só as abas */}
      <CabecalhoDaPagina
        titulo="Mensagens"
        descricao="As conversas com quem deu match, os matches e as conexões, num lugar só."
        soNoComputador
      >
        <Segmentos
          rotulo="Mensagens"
          opcoes={ABAS.map((a) => ({
            nome: a.nome,
            href: a.href,
            ativo: a.valor === atual,
            alerta: numeros[a.valor],
          }))}
        />
      </CabecalhoDaPagina>
    </>
  );
}

/**
 * Um lugar só para falar com as pessoas: as abas Conversas (a padrão), Matches e Conexões, no alto das
 * três páginas, com as mensagens novas e os pedidos de conexão para responder.
 */
export async function AbasMensagens({ atual }: { atual: AbaMensagens }) {
  const [conversas, conexoes] = await Promise.all([
    conversasPorPessoa().catch(() => null),
    minhasConexoes().catch(() => null),
  ]);
  const novas = (conversas ?? []).reduce((total, c) => total + (c.nao_lidas ?? 0), 0);
  const pedidos = pendenciasDeConexao(conexoes ?? []);
  return (
    <AbasMensagensBase
      atual={atual}
      numeros={{
        conversas: { n: novas, leitor: plural(novas, "mensagem nova", "mensagens novas") },
        conexoes: { n: pedidos, leitor: plural(pedidos, "pedido para responder", "pedidos para responder") },
      }}
    />
  );
}
