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

/** A nota mínima para entrar na lista. */
const MINIMO = 70;
/** Quantas vagas ou talentos no máximo por aviso. */
const ATE = 5;

export type ResultadoCombinam = {
  vagas: number;
  talentos: number;
  vistos: number;
  motivo?: string;
  /** na prévia: como ficariam alguns avisos (sem dizer para quem) */
  exemplos?: { tipo: "vagas_semana" | "talentos_semana"; texto: string; lista: string }[];
  /** a semana (a segunda-feira) e se o envio está ligado */
  semana?: string;
  ligado?: boolean;
};

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
  const resultado: ResultadoCombinam = { vagas: 0, talentos: 0, vistos: 0, ...(simular ? { exemplos: [] } : {}) };
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
  if (!simular && (!s.ligado || !s.pode)) return resultado;
  const semana = s.semana;
  const agora = Date.now();
  const falhas: string[] = [];

  async function registrar(
    conta: string,
    tipo: "vagas_semana" | "talentos_semana",
    ids: string[],
    texto: string,
    dados: Record<string, string>,
  ) {
    if (simular) {
      resultado.vistos++;
      if (!ids.length) return;
      resultado[tipo === "vagas_semana" ? "vagas" : "talentos"]++;
      if ((resultado.exemplos ?? []).filter((x) => x.tipo === tipo).length < 2)
        resultado.exemplos?.push({ tipo, texto, lista: dados.lista });
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
    else if (data) resultado[tipo === "vagas_semana" ? "vagas" : "talentos"]++;
  }

  // 1. Quem procura trabalho: as vagas novas da semana que combinam com o currículo
  const [{ data: vagas, error: eVagas }, { data: pessoas, error: ePessoas }] = await Promise.all([
    cliente.rpc("servidor_combinam_vagas", { p_chave: chave }),
    cliente.rpc("servidor_combinam_pessoas", { p_chave: chave, p_semana: semana, p_limite: simular ? 300 : 100 }),
  ]);
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
    cliente.rpc("servidor_combinam_empresas", { p_chave: chave, p_semana: semana, p_limite: simular ? 200 : 50 }),
    cliente.rpc("servidor_combinam_talentos", { p_chave: chave }),
  ]);
  if (eEmpresas || eTalentos) falhas.push((eEmpresas ?? eTalentos)!.message);
  const comCurriculo = (eTalentos ? [] : (talentos ?? []))
    .map((t) => ({ ...t, cv: comoCurriculo(t.curriculo) }))
    .filter((t): t is typeof t & { cv: Curriculo } => t.cv !== null);
  for (const e of eTalentos ? [] : (empresas ?? [])) {
    const boas = escolherTalentos(
      e.perfil_id,
      (Array.isArray(e.vagas) ? e.vagas : []) as unknown as (CamposDaVaga & { id: string })[],
      comCurriculo,
      new Set(e.ja ?? []),
      agora,
    );
    const n = quantas(boas.length, "talento", "talentos");
    await registrar(
      e.perfil_id,
      "talentos_semana",
      boas.map((x) => x.t.perfil_id),
      `${n} com as suas vagas, na aba Talentos: ${nomesCurtos(boas.map((x) => x.t.nome))}`,
      {
        quantas: n,
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

  if (falhas.length) {
    console.error("Publike: falha nas vagas e talentos da semana:", falhas[0]);
    resultado.motivo = "Parte das vagas e talentos da semana não saiu.";
  }
  return resultado;
}
