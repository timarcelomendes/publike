// Triagem com IA (copiloto) e Teste Prático (testes): recursos pagos, com 15 dias grátis para experimentar (decisão do usuário,
// 29/10/2026; migração 20261215120000). O banco confere de novo quem pode o quê.

export const DIAS_GRATIS = 15;

/** `video`: a Entrevista em vídeo (migração 20270104120000; plano em claude/plano-recursos-concorrentes.md). */
export type RecursoPago = "copiloto" | "testes" | "video" | "automacoes";
/** As ferramentas de avaliar da vaga (a aba Avaliar); `automacoes` (as Automações personalizadas, migração
 * 20270114120000) mora na aba Automações. */
export type FerramentaDeAvaliar = Exclude<RecursoPago, "automacoes">;

/** Todos os recursos pagos, na ordem das telas. */
export const RECURSOS_PAGOS: RecursoPago[] = [
  "copiloto",
  "testes",
  "video",
  "automacoes",
];

/** A página de cada recurso no painel. */
export const PAGINA_DO_RECURSO: Record<RecursoPago, string> = {
  copiloto: "/painel/copiloto",
  testes: "/painel/testes",
  video: "/painel/video",
  automacoes: "/painel/automacoes",
};

/**
 * O grátis de cada mês (18/11/2026, migração 20270730120000), na Triagem com IA (os candidatos que a IA lê) e na
 * Entrevista em vídeo (as gravadas pedidas e, em `aoVivo`, as ao vivo pelo Publike). Só fora dos dias liberados:
 * com a assinatura, os 15 dias ou a liberação do Publike, não tem limite.
 */
export type GratisDoMes = {
  limite: number;
  usados: number;
  /** quando o mês vira (1º, 0h, em Goiânia) */
  renovaEm: string | null;
  aoVivo?: { limite: number; usados: number };
};

/**
 * Os números de sempre do grátis de cada mês (os do banco, em privado.config_pagamentos; mudam em Admin ›
 * Pagamentos). As telas da conta leem os do banco; os textos fixos (Ajuda, Empresas) usam estes: mudou no Admin,
 * mude aqui também.
 */
export const GRATIS_PADRAO = { triagem: 5, gravadas: 5, aoVivo: 1 } as const;

export type EstadoRecurso = {
  liberado: boolean;
  /** até quando vai o acesso; null: sem prazo (liberado pelo Publike) */
  ate: string | null;
  experimentou: boolean;
  fim_experimento: string | null;
  quer_continuar: boolean;
  pode_experimentar: boolean;
  /** tem a assinatura valendo (migração 20261218120000) */
  assinante: boolean;
  /** liberado na promoção de lançamento, até `ate` (migração 20270918120000) */
  promocao?: boolean;
  /** pode assinar agora: pagamentos abertos para a conta e o plano à venda */
  pode_assinar: boolean;
  /** o grátis de cada mês (só na Triagem e na Entrevista em vídeo, e só sem o recurso liberado) */
  gratis?: GratisDoMes | null;
  /** o banco ainda não tem o recurso (a migração não rodou): as telas escondem */
  indisponivel?: boolean;
};

/**
 * O que uma assinatura libera: os recursos com dias grátis e a Consulta de salários (`salarios`, migração
 * 20270218120000), que não tem dias grátis (tem as consultas grátis) e por isso fica fora de `RecursoPago`, e a
 * Página de carreiras (`carreiras`, migração 20270406120000), que também libera com 10 vagas publicadas e não tem
 * estado em `RecursosPagos` (a página pergunta a `minha_pagina_de_vagas`).
 */
export type Liberavel = RecursoPago | "salarios" | "carreiras";

export type RecursosPagos = Record<RecursoPago, EstadoRecurso> & {
  /** a Consulta de salários (sem a migração 20270218120000, fechada) */
  salarios: EstadoRecurso;
};

export const NOME_RECURSO: Record<RecursoPago, string> = {
  copiloto: "Triagem com IA",
  testes: "Teste Prático",
  video: "Entrevista em vídeo",
  automacoes: "Automações personalizadas",
};
/** Com o artigo, para as frases ("Assinar a Triagem com IA", "o Teste Prático"). */
export const O_RECURSO: Record<RecursoPago, string> = {
  copiloto: "a Triagem com IA",
  testes: "o Teste Prático",
  video: "a Entrevista em vídeo",
  automacoes: "as Automações personalizadas",
};
/** Com "a" craseado ("acesso à Triagem com IA", "ao Teste Prático"). */
export const A_RECURSO: Record<RecursoPago, string> = {
  copiloto: "à Triagem com IA",
  testes: "ao Teste Prático",
  video: "à Entrevista em vídeo",
  automacoes: "às Automações personalizadas",
};

export function ehRecursoPago(x: unknown): x is RecursoPago {
  return (
    x === "copiloto" || x === "testes" || x === "video" || x === "automacoes"
  );
}

/** O grátis do mês, como o banco manda (`recursos_pagos`, `copiloto_da_vaga`, `video_config`); torto: null. */
export function lerGratis(x: unknown): GratisDoMes | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const n = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(0, Math.round(v))
      : null;
  const limite = n(o.limite);
  if (limite === null) return null;
  const aoVivo = n(o.ao_vivo_limite);
  return {
    limite,
    usados: n(o.usados) ?? 0,
    renovaEm: typeof o.renova_em === "string" ? o.renova_em : null,
    ...(aoVivo !== null
      ? { aoVivo: { limite: aoVivo, usados: n(o.ao_vivo_usados) ?? 0 } }
      : {}),
  };
}

function lerEstado(x: unknown): EstadoRecurso | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    liberado: o.liberado === true,
    ate: texto(o.ate),
    experimentou: o.experimentou === true,
    fim_experimento: texto(o.fim_experimento),
    quer_continuar: o.quer_continuar === true,
    pode_experimentar: o.pode_experimentar === true,
    assinante: o.assinante === true,
    promocao: o.promocao === true,
    pode_assinar: o.pode_assinar === true,
    gratis: lerGratis(o.gratis),
  };
}

/** A conta usa o recurso agora: liberado (assinatura, 15 dias, Publike) ou no grátis do mês. */
export function podeUsar(estado: EstadoRecurso | null | undefined): boolean {
  return Boolean(
    estado && !estado.indisponivel && (estado.liberado || estado.gratis),
  );
}

/** "1º de dezembro": o dia em que o grátis renova. */
export function diaQueRenova(iso: string): string {
  return dataCurta(iso).replace(/^1 /, "1º ");
}

/**
 * O que é grátis em cada recurso, numa linha (a oferta, os Planos, a Assinatura). `gratis`: os números da conta;
 * sem eles, os de sempre (`GRATIS_PADRAO`).
 */
export function textoDoGratis(
  recurso: RecursoPago,
  gratis?: GratisDoMes | null,
): string | null {
  if (recurso === "testes")
    return "Grátis: o teste da Publike que combina com a vaga.";
  if (recurso === "automacoes")
    return "Grátis: as 5 automações prontas, em toda vaga.";
  if (recurso === "copiloto") {
    const n = gratis ? gratis.limite : GRATIS_PADRAO.triagem;
    return n > 0
      ? `Grátis todo mês: a IA lê ${n === 1 ? "1 candidato" : `${n} candidatos`}.`
      : null;
  }
  const gravadas = gratis ? gratis.limite : GRATIS_PADRAO.gravadas;
  const aoVivo = gratis ? (gratis.aoVivo?.limite ?? 0) : GRATIS_PADRAO.aoVivo;
  const partes = [
    gravadas > 0 &&
      (gravadas === 1
        ? "1 entrevista gravada"
        : `${gravadas} entrevistas gravadas`),
    aoVivo > 0 && (aoVivo === 1 ? "1 ao vivo" : `${aoVivo} ao vivo`),
  ].filter(Boolean);
  return partes.length ? `Grátis todo mês: ${partes.join(" e ")}.` : null;
}

/** O jsonb de `recursos_pagos()`; o que vier torto, null (a página segue como antes). */
export function lerRecursos(data: unknown): RecursosPagos | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  const copiloto = lerEstado(o.copiloto);
  const testes = lerEstado(o.testes);
  if (!copiloto || !testes) return null;
  // sem a migração (20270104120000 o vídeo, 20270114120000 as automações), vem fechado e sem botão
  const fechado = (): EstadoRecurso => ({
    liberado: false,
    ate: null,
    experimentou: false,
    fim_experimento: null,
    quer_continuar: false,
    pode_experimentar: false,
    assinante: false,
    pode_assinar: false,
    indisponivel: true,
  });
  return {
    copiloto,
    testes,
    video: lerEstado(o.video) ?? fechado(),
    automacoes: lerEstado(o.automacoes) ?? fechado(),
    salarios: lerEstado(o.salarios) ?? fechado(),
  };
}

/** Quantos dias faltam (arredonda para cima: no último dia, "falta 1 dia"). */
export function diasRestantes(ate: string, agora: number): number {
  return Math.max(1, Math.ceil((new Date(ate).getTime() - agora) / 86_400_000));
}

export function dataCurta(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    timeZone: "America/Sao_Paulo",
  });
}

/**
 * A marca do grátis de cada mês, depois dos 15 dias (ou sem eles): o que a conta tem sem assinar, para ela saber
 * que dá para usar. null: o recurso não tem grátis (ou o Admin pôs 0).
 */
function marcaDoGratis(
  recurso: RecursoPago,
  gratis: GratisDoMes | null | undefined,
): { curto: string; longo: string } | null {
  if (recurso === "testes")
    return { curto: "1 grátis por vaga", longo: "Grátis: 1 teste por vaga" };
  if (recurso === "automacoes")
    return { curto: "5 prontas grátis", longo: "Grátis: as 5 prontas" };
  if (!gratis) return null;
  if (recurso === "copiloto") {
    return gratis.limite > 0
      ? {
          curto: `${gratis.limite} grátis por mês`,
          longo: `Grátis: ${gratis.limite} candidatos por mês`,
        }
      : null;
  }
  if (gratis.limite > 0) {
    return {
      curto: `${gratis.limite} grátis por mês`,
      longo: `Grátis: ${gratis.limite} gravadas por mês`,
    };
  }
  const aoVivo = gratis.aoVivo?.limite ?? 0;
  return aoVivo > 0
    ? {
        curto: `${aoVivo} ao vivo grátis`,
        longo: `Grátis: ${aoVivo} ao vivo por mês`,
      }
    : null;
}

/**
 * A marca do recurso pelo estado da conta (claude/plano-painel-simples.md, parte 3): "15 dias grátis" antes de
 * experimentar, "faltam N dias" durante o teste e nada depois de liberado. Depois dos 15 dias, o grátis de cada
 * mês ("5 grátis por mês", "1 grátis por vaga"; 18/11/2026), com `recurso`; sem ele, ou sem grátis, "Recurso
 * pago". `curto`: a pílula do menu e das abas; `longo`: o selo do alto das páginas (no teste, a faixa dos dias já
 * diz). Sem o estado (antes da migração), a marca de sempre.
 */
export function marcaDoRecurso(
  estado: EstadoRecurso | null | undefined,
  agora: number,
  recurso?: RecursoPago,
): { curto: string | null; longo: string | null } {
  if (!estado)
    return { curto: "15 dias grátis", longo: "Recurso pago · 15 dias grátis" };
  if (estado.liberado) {
    if (!estado.ate || estado.assinante) return { curto: null, longo: null };
    // a promoção de lançamento: sempre com a data, para ficar claro que é por um tempo
    if (estado.promocao) {
      const dia = new Date(estado.ate).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "America/Sao_Paulo",
      });
      return {
        curto: `promoção até ${dia}`,
        longo: `Promoção de lançamento até ${dia}`,
      };
    }
    const n = diasRestantes(estado.ate, agora);
    return { curto: n === 1 ? "falta 1 dia" : `faltam ${n} dias`, longo: null };
  }
  if (estado.pode_experimentar)
    return { curto: "15 dias grátis", longo: "Recurso pago · 15 dias grátis" };
  const gratis = recurso ? marcaDoGratis(recurso, estado.gratis) : null;
  return gratis ?? { curto: "Recurso pago", longo: "Recurso pago" };
}
