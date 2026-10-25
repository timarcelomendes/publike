import Link from "next/link";
import { pendenciasDeConexao } from "@/lib/conexoes";
import { plural } from "@/lib/formato";
import { minhasConexoes } from "@/lib/servidor/conexoes";
import { conversasPorPessoa } from "@/lib/servidor/conversas";
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
    <div className="flex flex-col gap-3">
      <SemLinhaDoPainel />
      <h2 className="sr-only">Mensagens</h2>
      {/* relative: o texto do leitor de tela fica dentro da rolagem (sem alargar a página) */}
      <nav aria-label="Mensagens" className="sem-barra relative -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {ABAS.map((a) => {
          const marcada = a.valor === atual;
          const numero = numeros[a.valor];
          return (
            <Link
              key={a.valor}
              href={a.href}
              aria-current={marcada ? "page" : undefined}
              className={`relative inline-flex min-h-11 shrink-0 items-center gap-2 rounded-pill border px-4 text-label whitespace-nowrap transition-colors ${
                marcada
                  ? "border-ink bg-ink text-surface-100"
                  : "border-line-strong bg-surface-200 text-ink hover:bg-surface-300"
              }`}
            >
              {a.nome}
              {numero && numero.n > 0 ? (
                <span className="min-w-5 rounded-pill bg-like px-1.5 text-center text-caption leading-5 text-on-like tabular-nums">
                  <span aria-hidden>{numero.n > 99 ? "99+" : numero.n}</span>
                  <span className="sr-only">, {numero.leitor}</span>
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </div>
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
