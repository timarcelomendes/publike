import "server-only";
import { ocupacao } from "@/lib/cbo";
import { MODO_DEMO } from "@/lib/config";
import { lerExperiencias, obterUsuario } from "@/lib/dados";
import { minutosAte, raioDoTempo } from "@/lib/deslocamento";
import { funcaoPeloTitulo } from "@/lib/funcao-cbo";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { UUID } from "@/lib/validacao";
import { acessoFila } from "./filas";
import { comFuncaoDasVagas, comFuncoes } from "./funcoes-pelo-contexto";

// O mapa de talentos (migração 20270419120000): quantas pessoas de Talentos moram perto da vaga, por tempo de
// ônibus, por função e por bairro. Nunca a casa de ninguém: o banco devolve só o bairro, a distância e as
// experiências (sem nome nem id), e aqui só saem os grupos com 5 pessoas ou mais.

/** Abaixo disso, o número não aparece ("menos de 5"), para ninguém ser achado. */
export const MINIMO = 5;

const TEMPOS = [15, 30, 45] as const;

export type MapaDeTalentos = {
  vaga: { id: string; titulo: string; funcao: string | null };
  liberado: boolean;
  /** por tempo de ônibus: todos de Talentos e os com experiência na função da vaga */
  porTempo: { minutos: number; todos: number; naFuncao: number | null }[];
  /** até 30 min: as funções com 5 pessoas ou mais, e quantas sobram nas outras */
  funcoes: { nome: string; pessoas: number; daVaga: boolean }[];
  outrasFuncoes: number;
  /** até 30 min: os bairros com 5 pessoas ou mais */
  bairros: { nome: string; todos: number; naFuncao: number | null }[];
  outrosBairros: number;
};

export async function mapaDeTalentosLiberado() {
  if (MODO_DEMO) return false;
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc("mapa_de_talentos_liberado");
  return !error && data === true;
}

export async function montarMapaDeTalentos(vaga: { id: string; titulo: string }): Promise<MapaDeTalentos | null> {
  if (MODO_DEMO || !UUID.test(vaga.id)) return null;
  const usuario = await obterUsuario();
  const acesso = acessoFila();
  if (!usuario || !acesso) return null;
  const [liberado, [comCbo]] = await Promise.all([
    mapaDeTalentosLiberado(),
    comFuncaoDasVagas([{ id: vaga.id, cbo: null as string | null }]),
  ]);
  const cboDaVaga = comCbo?.cbo ?? funcaoPeloTitulo(vaga.titulo)?.cbo ?? null;
  const { data, error } = await acesso.cliente.rpc("servidor_mapa_de_talentos", {
    p_chave: acesso.chave,
    p_conta: usuario.id,
    p_anuncio: vaga.id,
    p_km: raioDoTempo(TEMPOS[TEMPOS.length - 1]),
  });
  if (error) {
    if (error.code !== "PGRST202") console.error("Publike: falha ao montar o mapa de talentos:", error.message);
    return null;
  }
  const linhas = data ?? [];
  const cvs = await comFuncoes(linhas.map((l) => ({ experiencias: lerExperiencias(l.experiencias) })));
  const pessoas = linhas.map((l, i) => {
    // a função de cada experiência: a que a IA leu ou, sem ela, pelo nome do cargo
    const funcoes = new Set(
      (cvs[i]?.experiencias ?? [])
        .map((e) => e?.cbo ?? funcaoPeloTitulo(e?.cargo)?.cbo ?? null)
        .filter((x): x is string => Boolean(x)),
    );
    const doTitulo = funcaoPeloTitulo(l.titulo)?.cbo;
    if (doTitulo) funcoes.add(doTitulo);
    return { bairro: l.bairro, minutos: minutosAte(Number(l.km), "onibus"), funcoes };
  });
  const naFuncao = (p: (typeof pessoas)[number]) => Boolean(cboDaVaga && p.funcoes.has(cboDaVaga));

  const porTempo = TEMPOS.map((t) => {
    const dentro = pessoas.filter((p) => p.minutos <= t);
    return { minutos: t, todos: dentro.length, naFuncao: cboDaVaga ? dentro.filter(naFuncao).length : null };
  });
  const perto = pessoas.filter((p) => p.minutos <= 30);

  const contaFuncoes = new Map<string, number>();
  for (const p of perto) for (const f of p.funcoes) contaFuncoes.set(f, (contaFuncoes.get(f) ?? 0) + 1);
  const funcoes = [...contaFuncoes.entries()]
    .filter(([, n]) => n >= MINIMO)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([cbo, n]) => ({ nome: ocupacao(cbo)?.nome ?? funcaoPeloTitulo(cbo)?.nome ?? cbo, pessoas: n, daVaga: cbo === cboDaVaga }));
  const mostradas = new Set(
    [...contaFuncoes.entries()].filter(([, n]) => n >= MINIMO).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c]) => c),
  );
  const outrasFuncoes = perto.filter((p) => p.funcoes.size > 0 && ![...p.funcoes].some((f) => mostradas.has(f))).length;

  const contaBairros = new Map<string, { todos: number; naFuncao: number }>();
  for (const p of perto) {
    const b = contaBairros.get(p.bairro) ?? { todos: 0, naFuncao: 0 };
    b.todos++;
    if (naFuncao(p)) b.naFuncao++;
    contaBairros.set(p.bairro, b);
  }
  const bairros = [...contaBairros.entries()]
    .filter(([, b]) => b.todos >= MINIMO)
    .sort((a, b) => b[1].todos - a[1].todos)
    .map(([nome, b]) => ({
      nome,
      todos: b.todos,
      // o número da função só aparece com 5 ou mais (senão, menos de 5)
      naFuncao: cboDaVaga ? b.naFuncao : null,
    }));
  const outrosBairros = perto.length - bairros.reduce((t, b) => t + b.todos, 0);

  return {
    vaga: { id: vaga.id, titulo: vaga.titulo, funcao: cboDaVaga ? (ocupacao(cboDaVaga)?.nome ?? null) : null },
    liberado,
    porTempo,
    funcoes,
    outrasFuncoes,
    bairros,
    outrosBairros,
  };
}

/** O número como aparece na tela: abaixo de 5, "menos de 5" (0 continua 0). */
export function numeroProtegido(n: number | null | undefined) {
  if (n == null) return "—";
  if (n === 0) return "0";
  return n < MINIMO ? `menos de ${MINIMO}` : String(n);
}
