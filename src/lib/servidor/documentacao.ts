import "server-only";
import { open, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  lerMigracao,
  lerNotasTecnicas,
  lerRobo,
  lerTarefasDasFilas,
  type MigracaoTecnica,
  type RoboTecnico,
  type SecaoTecnica,
  type TarefaDasFilas,
} from "@/lib/documentacao";

// Lê os arquivos do projeto para a Documentação técnica do Admin (src/lib/documentacao.ts organiza). O admin roda no
// computador do dono (npm run dev), com o projeto inteiro na pasta: o que faltar aparece na tela como "não achei".

export type DocumentacaoTecnica = {
  secoes: SecaoTecnica[];
  migracoes: MigracaoTecnica[];
  robos: RoboTecnico[];
  cronsDaVercel: { caminho: string; horario: string }[];
  tarefas: TarefaDasFilas[];
  /** os arquivos que não deu para ler (o caminho a partir da pasta do projeto) */
  faltou: string[];
};

const RAIZ = process.cwd();
const DA_MIGRACAO = 8_000; // o comentário do começo cabe nisso (o arquivo inteiro pode ter centenas de KB)

async function comecoDoArquivo(caminho: string, bytes: number) {
  const arquivo = await open(caminho, "r");
  try {
    const { buffer, bytesRead } = await arquivo.read({ buffer: Buffer.alloc(bytes), position: 0 });
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await arquivo.close();
  }
}

export async function documentacaoTecnica(): Promise<DocumentacaoTecnica> {
  const faltou: string[] = [];
  const ler = <T>(nome: string, f: () => Promise<T>, vazio: T) =>
    f().catch(() => {
      faltou.push(nome);
      return vazio;
    });

  const [secoes, migracoes, robos, cronsDaVercel, tarefas] = await Promise.all([
    ler("AGENTS.md", async () => lerNotasTecnicas(await readFile(join(RAIZ, "AGENTS.md"), "utf8")), []),
    ler(
      "supabase/migrations",
      async () => {
        const pasta = join(RAIZ, "supabase/migrations");
        const nomes = (await readdir(pasta)).filter((n) => n.endsWith(".sql")).sort().reverse();
        return Promise.all(nomes.map(async (n) => lerMigracao(n, await comecoDoArquivo(join(pasta, n), DA_MIGRACAO))));
      },
      [] as MigracaoTecnica[],
    ),
    ler(
      ".github/workflows",
      async () => {
        const pasta = join(RAIZ, ".github/workflows");
        const nomes = (await readdir(pasta)).filter((n) => /\.ya?ml$/.test(n)).sort();
        return Promise.all(nomes.map(async (n) => lerRobo(n, await readFile(join(pasta, n), "utf8"))));
      },
      [] as RoboTecnico[],
    ),
    ler(
      "vercel.json",
      async () => {
        const json = JSON.parse(await readFile(join(RAIZ, "vercel.json"), "utf8")) as {
          crons?: { path: string; schedule: string }[];
        };
        return (json.crons ?? []).map((c) => ({ caminho: c.path, horario: c.schedule }));
      },
      [] as { caminho: string; horario: string }[],
    ),
    ler(
      "src/app/api/filas/route.ts",
      async () => lerTarefasDasFilas(await readFile(join(RAIZ, "src/app/api/filas/route.ts"), "utf8")),
      [] as TarefaDasFilas[],
    ),
  ]);
  return { secoes, migracoes, robos, cronsDaVercel, tarefas, faltou };
}
