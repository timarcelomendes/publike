import "server-only";

// A comparação de /api/banco (migração 20270629110000): o que o repositório espera (banco-esperado.json) contra o que
// produção tem (public.servidor_saude_do_banco). Cada objeto da impressão é "tipo|nome": f função, c coluna,
// i índice, t gatilho, p política.

type Impressao = { migracoes: string[]; objetos: Record<string, string> };

const TIPOS: Record<string, string> = { f: "função", c: "coluna", i: "índice", t: "gatilho", p: "política" };

export type SaudeDoBanco = {
  ok: boolean;
  /** migrações do repositório que produção não registrou */
  faltamMigracoes: string[];
  /** objetos das migrações que produção não tem */
  faltam: string[];
  /** objetos que produção tem e as migrações não criam */
  sobram: string[];
  /** objetos com o mesmo nome e outro conteúdo */
  diferentes: string[];
  resumo: string;
};

function lerImpressao(dados: unknown): Impressao | null {
  if (!dados || typeof dados !== "object") return null;
  const { migracoes, objetos } = dados as Record<string, unknown>;
  if (!Array.isArray(migracoes) || !objetos || typeof objetos !== "object") return null;
  return { migracoes: migracoes.filter((m): m is string => typeof m === "string"), objetos: objetos as Record<string, string> };
}

const legivel = (chave: string) => {
  const i = chave.indexOf("|");
  return `${TIPOS[chave.slice(0, i)] ?? chave.slice(0, i)} ${chave.slice(i + 1)}`;
};

export function compararBanco(esperado: Impressao, producao: unknown): SaudeDoBanco {
  const prod = lerImpressao(producao);
  if (!prod) {
    return {
      ok: false,
      faltamMigracoes: [],
      faltam: [],
      sobram: [],
      diferentes: [],
      resumo: "Não deu para ler a impressão de produção (resposta sem migrações ou objetos).",
    };
  }
  const registradas = new Set(prod.migracoes);
  const faltamMigracoes = esperado.migracoes.filter((m) => !registradas.has(m));
  const faltam: string[] = [];
  const diferentes: string[] = [];
  for (const [chave, valor] of Object.entries(esperado.objetos)) {
    if (!(chave in prod.objetos)) faltam.push(legivel(chave));
    else if (prod.objetos[chave] !== valor) diferentes.push(legivel(chave));
  }
  const sobram = Object.keys(prod.objetos)
    .filter((chave) => !(chave in esperado.objetos))
    .map(legivel);
  const ok = !faltamMigracoes.length && !faltam.length && !sobram.length && !diferentes.length;
  const partes = [
    faltamMigracoes.length && `${faltamMigracoes.length} migração(ões) sem rodar em produção`,
    faltam.length && `${faltam.length} objeto(s) das migrações faltando em produção`,
    diferentes.length && `${diferentes.length} objeto(s) diferente(s) das migrações`,
    sobram.length && `${sobram.length} objeto(s) em produção que as migrações não criam`,
  ].filter(Boolean);
  return {
    ok,
    faltamMigracoes,
    faltam,
    sobram,
    diferentes,
    resumo: ok
      ? `Produção igual às migrações (${esperado.migracoes.length} migrações, ${Object.keys(esperado.objetos).length} objetos).`
      : `Produção diferente das migrações: ${partes.join("; ")}.`,
  };
}
