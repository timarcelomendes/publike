import { BadgeCheck, ChevronRight } from "lucide-react";
import Link from "next/link";
import { MODO_DEMO } from "@/lib/config";
import { recursosPagos, talentosParaVaga } from "@/lib/dados";
import { plural } from "@/lib/formato";
import { criarClienteServidor } from "@/lib/supabase/servidor";
import { calcularAderencia, ordemDaNota, requisitosDaVaga } from "@/lib/aderencia";
import { obterAnuncio } from "@/lib/dados";
import { comFuncaoDasVagas, comFuncoes } from "@/lib/servidor/funcoes-pelo-contexto";
import { diaADiaDasVagas, jeitosDasPessoas } from "@/lib/servidor/jeito-de-trabalhar";
import { atividadesDaVaga } from "@/lib/servidor/atividades-da-vaga";
import { atendeAVaga } from "@/lib/talentos";
import { ListaDosProntos, type ProntoNaLista } from "./lista-dos-prontos";

// Prontos para assumir, no alto do "Para a sua vaga" (migração 20270827120000; 21/11/2026, Marcelo: "a empresa que
// não tem assinatura pode ter 5 talentos qualificados", "5 por vaga no ar"). Quem a leitura do currículo indicou como
// pronto para a função da vaga, dos que moram mais perto da vaga para os mais longe: 5 sem assinatura, todos (até 50)
// com. Sem o contato e com o nome encurtado; a nota da leitura não aparece. Sem a função da vaga ou ninguém pronto
// ainda, nada aparece. A leitura diz quem faz esse trabalho; quem serve para a vaga, pelos critérios da empresa e com
// o trecho do currículo, é a Triagem com IA: cada pessoa tem o "Conferir com os critérios da vaga", que abre a
// Triagem nela (ou a oferta, com os 15 dias grátis para quem nunca usou).

type Pronto = {
  perfil_id: string;
  nome: string;
  cidade: string | null;
  bairro: string | null;
  titulo: string | null;
  funcao: string;
  porque: string;
  distancia_m: number | null;
};
type Resposta = { plano: boolean; funcao: boolean; total: number; prontos: Pronto[] };

type Talento = Awaited<ReturnType<typeof talentosParaVaga>>[number];

/**
 * A prioridade dos prontos: primeiro quem atende tudo o que a vaga pede, depois a nota de aderência (a mesma de
 * Candidatos e de "Para a sua vaga"), depois a ordem do banco (a mesma ocupação antes, depois a distância).
 */
async function comPrioridade(anuncioId: string, prontos: Pronto[], talentos: Talento[], agora: number) {
  const anuncio = await obterAnuncio(anuncioId).catch(() => null);
  const porId = new Map(talentos.map((t) => [t.perfil_id, t]));
  const comCv = prontos.map((p) => porId.get(p.perfil_id) ?? null);
  const daLista = comCv.filter((t): t is Talento => Boolean(t));
  const [vagaComCbo, experiencias, diaADia, jeitos, atividades] = anuncio
    ? await Promise.all([
        comFuncaoDasVagas([anuncio]).then((v) => v[0]),
        comFuncoes(daLista.map((t) => ({ experiencias: t.experiencias }))),
        diaADiaDasVagas([anuncioId]),
        jeitosDasPessoas(daLista.map((t) => t.perfil_id)),
        atividadesDaVaga(anuncioId),
      ]).catch(() => [null, null, null, null, null] as const)
    : ([null, null, null, null, null] as const);
  const requisitos = vagaComCbo
    ? { ...requisitosDaVaga(vagaComCbo), perguntas: [], dia_a_dia: diaADia?.get(anuncioId) ?? null }
    : null;
  const expDe = new Map(daLista.map((t, i) => [t.perfil_id, experiencias?.[i]?.experiencias ?? t.experiencias]));
  return prontos
    .map((p, i) => {
      const t = comCv[i];
      const a =
        requisitos && t
          ? calcularAderencia(
              requisitos,
              {
                curriculo: {
                  escolaridade: t.escolaridade,
                  curso: t.curso,
                  experiencias: expDe.get(t.perfil_id) ?? t.experiencias,
                  cursos: t.cursos,
                  cnh: t.cnh,
                  disponibilidade: t.disponibilidade,
                  estudos: t.estudos,
                  titulo: t.titulo,
                  habilidades: t.habilidades,
                  jeito: jeitos?.get(t.perfil_id),
                },
                respostas: {},
                cidade: t.cidade,
                bairro: t.bairro,
                atividades: atividades?.get(t.perfil_id) ?? null,
              },
              agora,
            )
          : null;
      const falta = (a?.criterios ?? [])
        .filter((k) => !k.extra && !k.sinal && k.ok === false)
        .map((k) => k.nome.replace(/:.*$/, ""));
      return { p, i, a, atende: a ? atendeAVaga(a) : false, falta };
    })
    .sort((x, y) => Number(y.atende) - Number(x.atende) || ordemDaNota(y.a) - ordemDaNota(x.a) || x.i - y.i)
    .map(
      ({ p, a, atende, falta }, ordem): ProntoNaLista => ({
        ...p,
        nota: a && !a.eliminado ? a.nota : null,
        resumo: porId.get(p.perfil_id)?.resumo ?? null,
        atende,
        falta: [...new Set(falta)].slice(0, 3),
        ordem,
      }),
    );
}

export async function ProntosParaAVaga({ vaga, agora }: { vaga: { id: string; titulo: string }; agora: number }) {
  if (MODO_DEMO) return null;
  const c = await criarClienteServidor();
  const [{ data, error }, talentos, recursos] = await Promise.all([
    c.rpc("prontos_para_a_vaga", { p_anuncio: vaga.id }),
    talentosParaVaga(vaga.id).catch(() => null),
    recursosPagos().catch(() => null),
  ]);
  if (error || !data) return null;
  const r = data as unknown as Resposta;
  if (!r.funcao || !r.prontos.length) return null;
  const convidados = (talentos ?? []).filter((t) => t.convidado).map((t) => t.perfil_id);
  const faltam = r.total - r.prontos.length;
  const triagem = recursos?.copiloto;
  const experimentar = Boolean(triagem && !triagem.liberado && triagem.pode_experimentar);
  const lista = await comPrioridade(vaga.id, r.prontos, talentos ?? [], agora);
  return (
    <section
      aria-labelledby="prontos-titulo"
      className="flex flex-col gap-3 rounded-lg border-2 border-cerrado bg-surface-200 p-4 shadow-card sm:p-5"
    >
      <div className="flex flex-col gap-1">
        <h2 id="prontos-titulo" className="flex scroll-mt-32 items-center gap-2 font-display text-h3">
          <BadgeCheck aria-hidden className="size-5 text-cerrado-text" />
          {plural(r.total, "pessoa pronta", "pessoas prontas")} para assumir “{vaga.titulo}”
        </h2>
        <p className="text-body-sm text-ink-muted">
          A leitura do currículo indicou quem já fez esse trabalho. Primeiro quem atende tudo o que a vaga pede, depois
          pela nota com a vaga e pela distância. Convide quem combinar: o contato aparece quando a pessoa aceitar.
        </p>
      </div>
      <ListaDosProntos anuncioId={vaga.id} prontos={lista} convidados={convidados} />
      <p className="text-body-sm">
        Quer saber quem atende o que a sua vaga pede, com o trecho do currículo?{" "}
        <Link href={`/painel/anuncio/${vaga.id}/copiloto`} className="text-label underline underline-offset-2">
          Use a Triagem com IA
        </Link>
        {experimentar && ": 15 dias grátis"}.
      </p>
      {!r.plano && faltam > 0 && (
        <p className="text-body-sm">
          {faltam === 1 ? "Mais 1 pessoa pronta" : `Mais ${faltam} pessoas prontas`} para esta vaga com a assinatura.{" "}
          <Link href="/painel/planos" className="text-label underline underline-offset-2">
            Ver os planos
          </Link>
        </p>
      )}
    </section>
  );
}

/**
 * A faixa no quadro da vaga (22/11/2026; Marcelo: a tela da vaga não mostrava os prontos): "N pessoas prontas para
 * assumir esta vaga", que leva ao quadro dos prontos em Talentos. Só com alguém pronto; sem a leitura, nada.
 */
export async function FaixaDosProntos({ anuncioId }: { anuncioId: string }) {
  if (MODO_DEMO) return null;
  const c = await criarClienteServidor();
  const { data, error } = await c.rpc("prontos_para_a_vaga", { p_anuncio: anuncioId });
  if (error || !data) return null;
  const r = data as unknown as Resposta;
  if (!r.funcao || !r.total) return null;
  return (
    <Link
      href={`/talentos?vaga=${anuncioId}#prontos-titulo`}
      className="group flex items-center gap-3 rounded-lg border border-cerrado/40 bg-surface-200 p-4 hover:border-cerrado"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-surface-300">
        <BadgeCheck aria-hidden className="size-5 text-cerrado-text" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-label">
          {plural(r.total, "pessoa pronta", "pessoas prontas")} para assumir esta vaga
        </span>
        <span className="block text-body-sm text-ink-muted">
          A leitura do currículo indicou quem já fez esse trabalho. Ver e convidar em Talentos.
        </span>
      </span>
      <ChevronRight aria-hidden className="size-4 shrink-0 text-cerrado-text" />
    </Link>
  );
}
