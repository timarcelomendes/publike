// A importação das vagas da página de vagas da empresa na Gupy (claude/plano-candidatura-no-site-da-empresa.md):
// os tipos que a tela e o servidor trocam. O servidor fica em src/lib/servidor/importar-gupy.ts.

/** Uma vaga da página da Gupy na lista para escolher. */
export type VagaParaImportar = {
  /** o link limpo da vaga na Gupy (o que volta para importar) */
  link: string;
  titulo: string;
  /** "Goiânia (GO)" */
  lugar: string;
  /** "CLT · Presencial" */
  resumo: string;
  /** pode: dá para importar; fora: fora das cidades do Publike; fechada: fechou na Gupy; ja: já está no Publike */
  situacao: "pode" | "fora" | "fechada" | "ja";
};

export type ListaParaImportar =
  | {
      ok: true;
      /** a página de vagas (https://empresa.gupy.io/) */
      pagina: string;
      /** o nome da empresa na Gupy */
      empresa: string | null;
      vagas: VagaParaImportar[];
      /** quantas vagas a página tem (pode ser mais que a lista: até 40 de uma vez) */
      total: number;
      /** as que não abriram agora */
      naoAbriram: number;
      /** quantas dá para importar de uma vez (o limite de vagas por dia da conta) */
      maximo: number;
    }
  | { ok: false; erro: string };

export type ResultadoImportacao =
  /** falhas: o título é o link quando a vaga nem abriu (a tela troca pelo título da lista) */
  | { ok: true; publicadas: number; falhas: { link: string; titulo: string; erro: string }[] }
  | { ok: false; erro: string };

/** Até quantas vagas a lista mostra de uma vez. */
export const MAX_NA_LISTA = 40;
