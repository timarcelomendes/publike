import type { FaixaDoTeste } from "./testes";

// "Quem chamar primeiro" no quadro da vaga (claude/plano-triagem-automatica.md, item 2): uma ordem só, com o
// currículo (Triagem com IA), o Teste Prático, o % de match e quem espera há mais tempo, e o porquê de cada um.

export type ParaChamar = {
  curtido_em: string;
  aderencia: { nota: number | null; eliminado: boolean };
  triagem?: { grupo: 0 | 1 | 2; obrigatoriosOk: boolean; atende: number; total: number } | null;
  testes?: { faixa: FaixaDoTeste }[];
};

// quem não fez o teste fica entre quem foi bem e quem foi mal: não perde para quem foi mal
const PESO_TESTE: Record<FaixaDoTeste, number> = { acima: 0, dentro: 1, abaixo: 3 };
const SEM_TESTE = 2;

function pesoDoTeste(c: ParaChamar) {
  const l = c.testes ?? [];
  return l.length ? Math.min(...l.map((t) => PESO_TESTE[t.faixa])) : SEM_TESTE;
}

/**
 * A ordem: quem ficou fora pelo match vai para o fim; a Triagem (atende os obrigatórios, tem obrigatório para
 * conferir, não atende um; sem leitura conta como "para conferir"); o teste (acima, dentro, sem teste, abaixo);
 * o % de match (maior primeiro); e quem espera há mais tempo.
 */
export function compararParaChamar(a: ParaChamar, b: ParaChamar) {
  return (
    Number(a.aderencia.eliminado) - Number(b.aderencia.eliminado) ||
    (a.triagem?.grupo ?? 1) - (b.triagem?.grupo ?? 1) ||
    pesoDoTeste(a) - pesoDoTeste(b) ||
    (b.aderencia.nota ?? -1) - (a.aderencia.nota ?? -1) ||
    new Date(a.curtido_em).getTime() - new Date(b.curtido_em).getTime()
  );
}

/** Até 2 motivos curtos, o mais forte primeiro ("atende os obrigatórios · teste: acima do esperado"). */
export function porqueChamar(c: ParaChamar, agora: number): string[] {
  const motivos: string[] = [];
  if (c.triagem?.obrigatoriosOk) motivos.push("atende os obrigatórios");
  else if (c.triagem && c.triagem.atende > 0) motivos.push(`atende ${c.triagem.atende} de ${c.triagem.total}`);
  const teste = pesoDoTeste(c);
  if (teste === PESO_TESTE.acima) motivos.push("teste: acima do esperado");
  else if (teste === PESO_TESTE.dentro) motivos.push("teste: dentro do esperado");
  if (c.aderencia.nota != null && c.aderencia.nota >= 70) motivos.push(`${c.aderencia.nota}% de match`);
  const dias = Math.floor((agora - new Date(c.curtido_em).getTime()) / 86_400_000);
  if (dias >= 1) motivos.push(`espera há ${dias === 1 ? "1 dia" : `${dias} dias`}`);
  return motivos.slice(0, 2);
}
