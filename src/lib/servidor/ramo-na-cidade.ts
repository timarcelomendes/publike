import "server-only";
import { MODO_DEMO } from "@/lib/config";
import { ocupacao } from "@/lib/cbo";
import { formatarNumero } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/servidor";

// Quantas pessoas o ramo contratou na cidade (migração 20270708120000): o Novo Caged não traz o CNPJ, então o número
// é do ramo do lugar (o CNAE principal na Receita) na cidade dele, nos últimos 12 meses, e nunca da empresa. O texto
// diz isso: "No ramo, em Goiânia: 312 contratações com carteira em 12 meses, 48 como vendedor".

/** O aviso que vai uma vez na página onde aparece o número. */
export const NOTA_DO_RAMO =
  "As contratações são do ramo do lugar na cidade (Novo Caged, só carteira em tempo integral), não da empresa.";

function nomeDaFuncao(cbo: string) {
  const nome = ocupacao(cbo)?.nome;
  return nome ? nome.charAt(0).toLowerCase() + nome.slice(1) : null;
}

function meses(de: string, ate: string) {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  return (a2 - a1) * 12 + (m2 - m1) + 1;
}

/**
 * O texto do ramo de cada lugar (cnpj → texto). Com `cbo` (a função que a pessoa procura), diz quantas foram nela;
 * sem, as duas funções que mais entraram. Sem a migração ou sem dado, o mapa vem vazio.
 */
export async function ramoNaCidade(cnpjs: string[], cbo?: string | null): Promise<Map<string, string>> {
  const textos = new Map<string, string>();
  if (MODO_DEMO || !cnpjs.length) return textos;
  const { data, error } = await (await criarClienteServidor()).rpc("contratacoes_do_ramo", { p_cnpjs: cnpjs.slice(0, 300) });
  if (error) {
    if (error.code !== "PGRST202") console.error(`Publike: falha ao ler as contratações do ramo: ${error.message}`);
    return textos;
  }
  for (const l of data ?? []) {
    const funcoes = (Array.isArray(l.funcoes) ? l.funcoes : []) as { cbo?: string; n?: number }[];
    const n = meses(l.de, l.ate);
    let texto = `No ramo, em ${l.cidade}: ${formatarNumero(l.contratacoes)} ${l.contratacoes === 1 ? "contratação" : "contratações"} com carteira em ${n === 1 ? "1 mês" : `${n} meses`}`;
    const daFuncao = cbo ? funcoes.find((f) => f.cbo === cbo) : null;
    const nomeDela = daFuncao?.cbo ? nomeDaFuncao(daFuncao.cbo) : null;
    if (daFuncao?.n && nomeDela) {
      texto += `, ${formatarNumero(daFuncao.n)} como ${nomeDela}`;
    } else {
      const top = funcoes
        .map((f) => (f.cbo ? nomeDaFuncao(f.cbo) : null))
        .filter((x): x is string => Boolean(x))
        .slice(0, 2);
      if (top.length) texto += `, mais como ${top.join(" e ")}`;
    }
    textos.set(l.cnpj, texto);
  }
  return textos;
}
