import "server-only";
import { matchComAVaga, type Aderencia, type CamposDaVaga, type Candidato } from "@/lib/aderencia";
import { formatarLugar } from "@/lib/formato";
import { pracaDaCidade } from "@/lib/pracas";
import { acessoFila } from "./filas";

// Vagas e talentos que combinam, toda semana (migração 20261119120000). Na segunda, a partir das 9h,
// quem tem currículo recebe as vagas novas da semana com bom % de match, e quem tem vaga no ar recebe os
// currículos da aba Talentos que combinam com ela. A conta é a mesma do site (matchComAVaga); "Outra
// área" (a experiência não é da função) fica de fora. Sai no sino, no celular e por e-mail, até 5 por
// conta, só quando tem algo bom, e nunca repete. Fica desligado até o admin ligar. Roda pela tarefa
// das filas (/api/filas), aos poucos: cada chamada vê até 100 pessoas e 50 empresas que faltam na semana.
//
// "Volte a contratar" (migração 20270130120000): na mesma segunda, a empresa sem vaga no ar (a última saiu há 14
// dias ou mais, nos últimos 6 meses) recebe os talentos que combinam com as vagas de antes, com o "Publicar de
// novo". Só com 3 ou mais; o banco segura a cada 4 semanas e até 3 seguidos sem publicar. Liga à parte.
//
// O resumo da vaga (a mesma migração): os talentos da semana levam os números de cada vaga no ar; sem talento
// novo, mas com movimento na semana, sai só o resumo (o aviso leva ao quadro da vaga).

/** A nota mínima para entrar na lista. */
const MINIMO = 70;
/** Quantas vagas ou talentos no máximo por aviso. */
const ATE = 5;
/** O "Volte a contratar" só sai com pelo menos tantos talentos que combinam. */
const MINIMO_REATIVAR = 3;

type TipoCombinam = "vagas_semana" | "talentos_semana" | "talentos_reativar";

export type ResultadoCombinam = {
  vagas: number;
  talentos: number;
  /** contas sem vaga no ar que receberam o "Volte a contratar" */
  reativar: number;
  /** contas com vaga no ar que receberam só o resumo (sem talento novo) */
  resumos: number;
  vistos: number;
  motivo?: string;
  /** na prévia: como ficariam alguns avisos (sem dizer para quem) */
  exemplos?: { tipo: TipoCombinam | "resumo_vagas"; texto: string; lista: string }[];
  /** a semana (a segunda-feira) e se o envio está ligado */
  semana?: string;
  ligado?: boolean;
  /** o "Volte a contratar" está ligado (undefined: o banco ainda não tem a migração 20270130120000) */
  reativarLigado?: boolean;
};

/** Os números de uma vaga no ar, para o resumo de segunda (servidor_resumo_das_vagas). */
export type NumerosDaVaga = {
  anuncio_id: string;
  titulo: string;
  visitas: number;
  curtidas: number;
  esperando: number;
  movimento: boolean;
};

function contagem(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

/** "• Atendente de loja: 23 visitas, 4 curtidas, 2 esperando resposta" (sem curtida: "ainda sem curtida"). */
export function linhaDoResumo(v: NumerosDaVaga) {
  // sem visita contada, a linha começa nas curtidas
  const partes = v.visitas ? [contagem(v.visitas, "visita", "visitas")] : [];
  partes.push(v.curtidas ? contagem(v.curtidas, "curtida", "curtidas") : "ainda sem curtida");
  if (v.esperando) partes.push(`${v.esperando} esperando resposta`);
  return `• ${v.titulo}: ${partes.join(", ")}`;
}

/**
 * O resumo das vagas no ar de uma conta: as linhas (até 5), a vaga para onde o aviso leva (a com mais gente
 * esperando; senão, a com mais movimento), a frase do sino e o destaque do assunto do e-mail.
 */
export function resumoDasVagas(vagas: NumerosDaVaga[]) {
  if (!vagas.length) return null;
  const linhas = vagas.slice(0, 5).map(linhaDoResumo);
  if (vagas.length > 5) linhas.push(`• e mais ${contagem(vagas.length - 5, "vaga", "vagas")}`);
  const esperando = vagas.reduce((t, v) => t + v.esperando, 0);
  const principal = [...vagas].sort(
    (a, b) => b.esperando - a.esperando || Number(b.movimento) - Number(a.movimento) || b.curtidas - a.curtidas,
  )[0];
  const destaque = esperando
    ? `${contagem(esperando, "pessoa espera", "pessoas esperam")} sua resposta`
    : principal.curtidas
      ? `${contagem(principal.curtidas, "curtida", "curtidas")} em “${principal.titulo}”`
      : `${contagem(principal.visitas, "visita", "visitas")} em “${principal.titulo}”`;
  return {
    texto: linhas.join("\n"),
    vaga: principal,
    movimento: vagas.some((v) => v.movimento),
    destaque,
    sino: `Suas vagas esta semana: ${destaque}. ${linhaDoResumo(principal).slice(2)}.`,
  };
}

/** Onde conta o envio de cada tipo. */
const CONTA_DO_TIPO = { vagas_semana: "vagas", talentos_semana: "talentos", talentos_reativar: "reativar" } as const;

type Curriculo = NonNullable<Candidato["curriculo"]>;

/** A experiência é de outra área: o número baixo não diz nada (o mesmo "Outra área" do site). */
function outraArea(a: Aderencia) {
  return a.criterios.some((c) => c.funcao && c.ok === false);
}

/** As cidades da praça de quem vê (Goiânia e a região); fora das praças, só a própria cidade. */
function cidadesPerto(cidade: string | null): readonly string[] {
  if (!cidade) return [];
  return pracaDaCidade(cidade)?.cidades ?? [cidade];
}

/** "3 vagas combinam" ou "1 vaga combina" (o assunto do e-mail: "3 vagas combinam com você esta semana"). */
function quantas(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? `${um} combina` : `${varios} combinam`}`;
}

/** "Auxiliar de cozinha, Garçom e mais 3." (o sino tem 300 letras; "Ana P." não ganha outro ponto) */
function nomesCurtos(nomes: string[]) {
  const frase = nomes.length <= 2 ? nomes.join(" e ") : `${nomes.slice(0, 2).join(", ")} e mais ${nomes.length - 2}`;
  return frase.endsWith(".") ? frase : `${frase}.`;
}

export function comoCurriculo(dado: unknown): Curriculo | null {
  if (!dado || typeof dado !== "object" || Array.isArray(dado)) return null;
  const c = dado as Record<string, unknown>;
  return {
    escolaridade: (c.escolaridade as string | null) ?? null,
    experiencias: Array.isArray(c.experiencias) ? (c.experiencias as Curriculo["experiencias"]) : [],
    cnh: (c.cnh as string | null) ?? null,
    disponibilidade: Array.isArray(c.disponibilidade) ? (c.disponibilidade as string[]) : [],
    cursos: Array.isArray(c.cursos) ? (c.cursos as string[]) : [],
    estudos: Array.isArray(c.estudos) ? (c.estudos as Curriculo["estudos"]) : [],
    titulo: (c.titulo as string | null) ?? null,
    habilidades: Array.isArray(c.habilidades) ? (c.habilidades as string[]) : [],
  } as Curriculo;
}

/** O que o talento faz, para a linha do e-mail: o "o que você faz" ou o cargo mais recente. */
export function oQueFaz(c: Curriculo) {
  const titulo = c.titulo?.trim();
  if (titulo) return titulo;
  const cargo = (c.experiencias ?? []).map((e) => String(e?.cargo ?? "").trim()).find(Boolean);
  return cargo || null;
}

/**
 * `simular`: a prévia do admin. Faz a mesma conta com quem ainda não foi visto nesta semana, mas não
 * manda nem registra nada (e roda mesmo desligado ou antes da segunda às 9h).
 */
/** Uma vaga do jeito que a conta do match e a lista precisam. */
export type VagaParaCombinar = CamposDaVaga & { id: string; autor_id: string; autor_nome: string };
/** Um talento da aba Talentos: o resumo aberto e o currículo (para a conta). */
export type TalentoParaCombinar = {
  perfil_id: string;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  cv: Curriculo;
};

/**
 * As vagas que combinam com o currículo (70% ou mais, sem "Outra área"), na região da pessoa, da que
 * combina mais para a que combina menos. `ja`: as que ela curtiu, passou ou já recebeu.
 */
export function escolherVagas(
  pessoa: { id: string; cidade: string | null; bairro: string | null; curriculo: Curriculo | null },
  vagas: VagaParaCombinar[],
  ja: Set<string>,
  agora: number,
  quantas = ATE,
) {
  const curriculo = pessoa.curriculo;
  if (!curriculo) return [];
  const perto = cidadesPerto(pessoa.cidade);
  return vagas
    .filter((v) => v.autor_id !== pessoa.id && !ja.has(v.id) && perto.includes(v.cidade))
    .map((v) => ({ v, m: matchComAVaga(v, { curriculo, cidade: pessoa.cidade, bairro: pessoa.bairro }, agora) }))
    .filter((x): x is { v: VagaParaCombinar; m: Aderencia } =>
      Boolean(x.m && (x.m.nota ?? 0) >= MINIMO && !outraArea(x.m)),
    )
    .sort((a, b) => (b.m.nota ?? 0) - (a.m.nota ?? 0))
    .slice(0, quantas);
}

/**
 * Os talentos que combinam com as vagas da conta, cada um com a vaga em que combina mais (só as da
 * região dele), do que combina mais para o que combina menos. `ja`: os que já curtiram, estão
 * conectados ou já foram mandados.
 */
export function escolherTalentos(
  contaId: string,
  vagas: (CamposDaVaga & { id: string })[],
  talentos: TalentoParaCombinar[],
  ja: Set<string>,
  agora: number,
  quantas = ATE,
) {
  return talentos
    .filter((t) => t.perfil_id !== contaId && !ja.has(t.perfil_id))
    .map((t) => {
      let melhor: { vaga: string; vagaId: string; m: Aderencia } | null = null;
      for (const v of vagas) {
        if (!cidadesPerto(v.cidade).includes(t.cidade ?? "")) continue;
        const m = matchComAVaga(v, { curriculo: t.cv, cidade: t.cidade, bairro: t.bairro }, agora);
        if (m && (m.nota ?? 0) >= MINIMO && !outraArea(m) && (!melhor || (m.nota ?? 0) > (melhor.m.nota ?? 0)))
          melhor = { vaga: v.titulo, vagaId: v.id, m };
      }
      return melhor ? { t, ...melhor } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (b.m.nota ?? 0) - (a.m.nota ?? 0))
    .slice(0, quantas);
}

export async function mandarCombinamDaSemana({ simular = false } = {}): Promise<ResultadoCombinam> {
  const resultado: ResultadoCombinam = {
    vagas: 0,
    talentos: 0,
    reativar: 0,
    resumos: 0,
    vistos: 0,
    ...(simular ? { exemplos: [] } : {}),
  };
  const acesso = acessoFila();
  if (!acesso) return resultado;
  const { cliente, chave } = acesso;
  const { data: situacao, error } = await cliente.rpc("servidor_combinam_situacao", { p_chave: chave });
  if (error) {
    // banco sem a migração: nada a fazer
    if (error.code === "PGRST202") return resultado;
    console.error("Publike: falha ao ler a situação das vagas da semana:", error.message);
    return { ...resultado, motivo: "Não foi possível ler a situação das vagas e talentos da semana." };
  }
  const s = situacao?.[0];
  if (!s) return resultado;
  resultado.semana = s.semana;
  resultado.ligado = s.ligado;
  // o "Volte a contratar" liga à parte (sem a migração 20270130120000, fica de fora)
  const { data: reativarLigado, error: eReativar } = await cliente.rpc("servidor_reativar_situacao", {
    p_chave: chave,
  });
  if (!eReativar) resultado.reativarLigado = Boolean(reativarLigado);
  const mandaSemana = simular || s.ligado;
  const mandaReativar = !eReativar && (simular || Boolean(reativarLigado));
  if (!simular && (!s.pode || (!mandaSemana && !mandaReativar))) return resultado;
  const semana = s.semana;
  const agora = Date.now();
  const falhas: string[] = [];

  async function registrar(
    conta: string,
    tipo: TipoCombinam,
    ids: string[],
    texto: string,
    dados: Record<string, string>,
  ) {
    const soResumo = !ids.length && dados.so_resumo === "1";
    if (simular) {
      resultado.vistos++;
      if (!ids.length && !soResumo) return;
      resultado[soResumo ? "resumos" : CONTA_DO_TIPO[tipo]]++;
      const doExemplo = soResumo ? "resumo_vagas" : tipo;
      if ((resultado.exemplos ?? []).filter((x) => x.tipo === doExemplo).length < 2)
        resultado.exemplos?.push({ tipo: doExemplo, texto, lista: soResumo ? dados.resumo : dados.lista });
      return;
    }
    const { data, error: e } = await cliente.rpc("servidor_combinam_registrar", {
      p_chave: chave,
      p_semana: semana,
      p_conta: conta,
      p_tipo: tipo,
      p_ids: ids,
      p_texto: texto,
      p_dados: dados,
    });
    resultado.vistos++;
    if (e) falhas.push(e.message);
    else if (data) resultado[soResumo ? "resumos" : CONTA_DO_TIPO[tipo]]++;
  }

  // 1. Quem procura trabalho: as vagas novas da semana que combinam com o currículo
  const [{ data: vagas, error: eVagas }, { data: pessoas, error: ePessoas }] = mandaSemana
    ? await Promise.all([
        cliente.rpc("servidor_combinam_vagas", { p_chave: chave }),
        cliente.rpc("servidor_combinam_pessoas", { p_chave: chave, p_semana: semana, p_limite: simular ? 300 : 100 }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (eVagas || ePessoas) falhas.push((eVagas ?? ePessoas)!.message);
  for (const p of eVagas ? [] : (pessoas ?? [])) {
    const boas = escolherVagas(
      { id: p.perfil_id, cidade: p.cidade, bairro: p.bairro, curriculo: comoCurriculo(p.curriculo) },
      (vagas ?? []) as VagaParaCombinar[],
      new Set(p.ja ?? []),
      agora,
    );
    const n = quantas(boas.length, "vaga", "vagas");
    await registrar(
      p.perfil_id,
      "vagas_semana",
      boas.map((x) => x.v.id),
      `${n} com você esta semana: ${nomesCurtos(boas.map((x) => x.v.titulo))}`,
      {
        quantas: n,
        lista: boas
          .map(
            (x) =>
              `• ${x.v.titulo}, ${x.v.autor_nome}, ${formatarLugar(x.v.bairro, x.v.cidade)}: ${x.m.nota}% de match`,
          )
          .join("\n"),
        caminho: "/?tipo=vaga&ordem=combina",
      },
    );
  }

  // 2. Quem contrata: os talentos da aba Talentos que combinam com as vagas no ar
  const [{ data: empresas, error: eEmpresas }, { data: talentos, error: eTalentos }] = await Promise.all([
    mandaSemana
      ? cliente.rpc("servidor_combinam_empresas", { p_chave: chave, p_semana: semana, p_limite: simular ? 200 : 50 })
      : Promise.resolve({ data: [], error: null }),
    // os talentos servem também ao "Volte a contratar"
    mandaSemana || mandaReativar
      ? cliente.rpc("servidor_combinam_talentos", { p_chave: chave })
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (eEmpresas || eTalentos) falhas.push((eEmpresas ?? eTalentos)!.message);
  const comCurriculo = (eTalentos ? [] : (talentos ?? []))
    .map((t) => ({ ...t, cv: comoCurriculo(t.curriculo) }))
    .filter((t): t is typeof t & { cv: Curriculo } => t.cv !== null);
  // os números das vagas no ar de cada conta (sem a migração 20270130120000, sai sem o resumo)
  const numeros = new Map<string, NumerosDaVaga[]>();
  if (!eTalentos && empresas?.length) {
    const { data: vagasNoAr, error: eResumo } = await cliente.rpc("servidor_resumo_das_vagas", {
      p_chave: chave,
      p_contas: empresas.map((e) => e.perfil_id),
    });
    if (eResumo && eResumo.code !== "PGRST202") falhas.push(eResumo.message);
    for (const v of eResumo ? [] : (vagasNoAr ?? [])) numeros.set(v.conta_id, [...(numeros.get(v.conta_id) ?? []), v]);
  }
  for (const e of eTalentos ? [] : (empresas ?? [])) {
    const resumo = resumoDasVagas(numeros.get(e.perfil_id) ?? []);
    const boas = escolherTalentos(
      e.perfil_id,
      (Array.isArray(e.vagas) ? e.vagas : []) as unknown as (CamposDaVaga & { id: string })[],
      comCurriculo,
      new Set(e.ja ?? []),
      agora,
    );
    const n = quantas(boas.length, "talento", "talentos");
    // sem talento novo, mas com movimento na vaga: só o resumo, que leva ao quadro da vaga
    if (!boas.length && resumo?.movimento) {
      await registrar(e.perfil_id, "talentos_semana", [], resumo.sino, {
        so_resumo: "1",
        resumo: resumo.texto,
        destaque: resumo.destaque,
        vaga_id: resumo.vaga.anuncio_id,
        caminho: `/painel/anuncio/${resumo.vaga.anuncio_id}/quadro`,
      });
      continue;
    }
    await registrar(
      e.perfil_id,
      "talentos_semana",
      boas.map((x) => x.t.perfil_id),
      `${n} com as suas vagas, na aba Talentos: ${nomesCurtos(boas.map((x) => x.t.nome))}`,
      {
        quantas: n,
        resumo: resumo?.texto ?? "",
        lista: boas
          .map((x) => {
            const faz = oQueFaz(x.t.cv);
            const onde = x.t.cidade ? formatarLugar(x.t.bairro, x.t.cidade) : null;
            return `• ${[x.t.nome, faz, onde].filter(Boolean).join(", ")}: ${x.m.nota}% com “${x.vaga}”`;
          })
          .join("\n"),
        caminho: "/talentos",
      },
    );
  }

  // 3. Volte a contratar: quem ficou sem vaga no ar recebe os talentos que combinam com as vagas de antes
  if (mandaReativar && !eTalentos) {
    const { data: paradas, error: eParadas } = await cliente.rpc("servidor_reativar_empresas", {
      p_chave: chave,
      p_semana: semana,
      p_limite: simular ? 200 : 50,
    });
    if (eParadas) falhas.push(eParadas.message);
    for (const e of eParadas ? [] : (paradas ?? [])) {
      const antigas = (Array.isArray(e.vagas) ? e.vagas : []) as unknown as (CamposDaVaga & { id: string })[];
      // todos os que combinam (para o número), e a lista com os que mais combinam
      const todos = escolherTalentos(e.perfil_id, antigas, comCurriculo, new Set(e.ja ?? []), agora, 1000);
      const boas = todos.length >= MINIMO_REATIVAR ? todos.slice(0, ATE) : [];
      // a vaga de antes com mais gente que combina (no empate, a mais recente): a do "Publicar de novo"
      const porVaga = new Map<string, number>();
      for (const x of todos) porVaga.set(x.vagaId, (porVaga.get(x.vagaId) ?? 0) + 1);
      const vaga = antigas.reduce<(typeof antigas)[number] | null>(
        (melhor, v) => (!melhor || (porVaga.get(v.id) ?? 0) > (porVaga.get(melhor.id) ?? 0) ? v : melhor),
        null,
      );
      const n = quantas(todos.length, "talento", "talentos");
      await registrar(
        e.perfil_id,
        "talentos_reativar",
        boas.map((x) => x.t.perfil_id),
        `${n} com a sua vaga de “${vaga?.titulo ?? ""}”. Publique de novo, grátis: ${nomesCurtos(boas.map((x) => x.t.nome))}`,
        {
          quantas: n,
          vaga: vaga?.titulo ?? "",
          vaga_id: vaga?.id ?? "",
          lista: boas
            .map((x) => {
              const faz = oQueFaz(x.t.cv);
              const onde = x.t.cidade ? formatarLugar(x.t.bairro, x.t.cidade) : null;
              return `• ${[x.t.nome, faz, onde].filter(Boolean).join(", ")}: ${x.m.nota}% com “${x.vaga}”`;
            })
            .join("\n"),
          caminho: vaga ? `/publicar?copiar=${vaga.id}` : "/publicar",
        },
      );
    }
  }

  if (falhas.length) {
    console.error("Publike: falha nas vagas e talentos da semana:", falhas[0]);
    resultado.motivo = "Parte das vagas e talentos da semana não saiu.";
  }
  return resultado;
}
