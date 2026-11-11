import { ChevronDown, ChevronLeft, ChevronRight, Link2, Sparkles, UserSearch } from "lucide-react";
import { diaADiaDasVagas, jeitosDasPessoas } from "@/lib/servidor/jeito-de-trabalhar";
import { IA } from "@/components/apelido-da-ia";
import Link from "next/link";
import {
  calcularAderencia,
  dizAFuncao,
  ordemDaNota,
  perfilDaVaga,
  requisitosDaVaga,
  type Aderencia,
} from "@/lib/aderencia";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import { copilotoLiberado, obterAnuncio, talentosParaVaga } from "@/lib/dados";
import { formatarLugar, plural, tempoRelativo } from "@/lib/formato";
import { atendeAVaga, entraEmParaAVaga, MAX_PAGINAS_TALENTOS, TALENTOS_POR_PAGINA } from "@/lib/talentos";
import { CurriculoResumo } from "../curriculo-resumo";
import { SeloCortesia } from "../selo-cortesia";
import { BotaoConvidar } from "../painel/botao-convidar";
import { ConviteEmLote, MarcarConvite, MarcarTodos } from "./convite-em-lote";
import { CriteriosDaAderencia, NotaAderencia } from "../painel/nota-aderencia";
import { Aviso, Avatar, Vazio } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";
import { classesChip } from "../painel/fluxo";
import { comFuncaoDasVagas, comFuncoes } from "@/lib/servidor/funcoes-pelo-contexto";

/**
 * "Para a sua vaga", na aba Talentos de quem tem vaga no ar: quem deixou as empresas acharem o currículo,
 * de quem mais combina com a vaga para quem menos combina (a mesma nota dos candidatos), com o Convidar e,
 * ao abrir, o currículo e o porquê da nota. Quem já curtiu a vaga não aparece (está nos candidatos). Sem o
 * contato e com o nome encurtado: o contato sai só no match.
 */
/** No primeiro emprego, o que contou da função ("Estudou Ciência de dados"), para a linha do cartão. */
function oQueContou(a: Aderencia) {
  if (!a.primeiroEmprego || !a.funcao) return null;
  return a.criterios.find((k) => k.funcao)?.detalhe.replace(/ \(sem trabalho na função\)$/, "") ?? null;
}

export type NivelDaSugestao = "leve" | "rigida";

export async function ParaAVaga({
  vaga,
  pagina,
  href,
  agora,
  nivel = "leve",
}: {
  vaga: { id: string; titulo: string };
  pagina: number;
  /** o endereço de cada página desta lista, no nível pedido */
  href: (pagina: number, nivel: NivelDaSugestao) => string;
  agora: number;
  /** leve: experiência, área parecida ou curso na função; rígida: a mesma função e todos os itens da vaga */
  nivel?: NivelDaSugestao;
}) {
  const [anuncio, lista, copiloto] = await Promise.all([
    obterAnuncio(vaga.id),
    talentosParaVaga(vaga.id).catch(() => null),
    copilotoLiberado(),
  ]);
  if (!anuncio || !lista) {
    return (
      <Aviso tipo="alerta" titulo="Não deu para carregar os talentos agora">
        Tente de novo em instantes.
      </Aviso>
    );
  }
  // o % pelo contexto: a função que a IA leu da vaga e de cada experiência (claude/plano-match-pelo-contexto.md)
  const [[vagaComCbo], experiencias, diaADia, jeitos] = await Promise.all([
    comFuncaoDasVagas([anuncio]),
    comFuncoes(lista.map((t) => ({ experiencias: t.experiencias }))),
    diaADiaDasVagas([vaga.id]),
    jeitosDasPessoas(lista.map((t) => t.perfil_id)),
  ]);
  const requisitos = { ...requisitosDaVaga(vagaComCbo), perguntas: [], dia_a_dia: diaADia.get(vaga.id) ?? null };
  // a vaga de entrada (aceita quem está começando) que diz a função: a lista é de quem mora perto e pode no horário
  const entrada = perfilDaVaga(requisitos) === "entrada" && dizAFuncao(requisitos);
  const comAderencia = lista
    .map((t, i) => ({
      t,
      a: calcularAderencia(
        requisitos,
        {
          curriculo: {
            escolaridade: t.escolaridade,
            curso: t.curso,
            experiencias: experiencias[i].experiencias ?? t.experiencias,
            cursos: t.cursos,
            cnh: t.cnh,
            disponibilidade: t.disponibilidade,
            estudos: t.estudos,
            titulo: t.titulo,
            habilidades: t.habilidades,
            jeito: jeitos.get(t.perfil_id),
          },
          respostas: {},
          cidade: t.cidade,
          bairro: t.bairro,
        },
        agora,
      ),
    }))
    .filter(({ a }) => entraEmParaAVaga(a))
    .sort((x, y) => ordemDaNota(y.a) - ordemDaNota(x.a));
  const rigidos = comAderencia.filter(({ a }) => atendeAVaga(a));
  const todos = nivel === "rigida" ? rigidos : comAderencia;
  const niveis = (
    <div role="group" aria-label="Quanto o currículo precisa combinar" className="flex flex-wrap gap-2">
      <Link
        href={href(1, "leve")}
        aria-current={nivel === "leve" ? "true" : undefined}
        className={classesChip(nivel === "leve")}
        scroll={false}
      >
        Mais gente
        <span className="tabular-nums opacity-70">{comAderencia.length}</span>
      </Link>
      <Link
        href={href(1, "rigida")}
        aria-current={nivel === "rigida" ? "true" : undefined}
        className={classesChip(nivel === "rigida")}
        scroll={false}
      >
        Atende a vaga
        <span className="tabular-nums opacity-70">{rigidos.length}</span>
      </Link>
    </div>
  );

  if (nivel === "rigida" && rigidos.length === 0 && comAderencia.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        {niveis}
        <Vazio
          icone={UserSearch}
          titulo={`Ninguém atende tudo o que “${vaga.titulo}” pede ainda`}
          acao={
            <BotaoLink href={href(1, "leve")} tamanho="sm" variante="secundario">
              Ver {plural(comAderencia.length, "pessoa", "pessoas")} que chegam perto
            </BotaoLink>
          }
        >
          {entrada
            ? "Aqui só entra quem atende cada item da vaga (escolaridade, CNH, horário e distância)."
            : "Aqui só entra quem já trabalhou na mesma função e atende cada item da vaga (escolaridade, tempo de experiência, CNH, horário e distância)."}
        </Vazio>
      </div>
    );
  }

  if (todos.length === 0 && lista.length > 0) {
    return (
      <Vazio
        icone={UserSearch}
        titulo={
          entrada
            ? `Ninguém em Talentos perto e no horário de “${vaga.titulo}” ainda`
            : `Ninguém em Talentos com experiência para “${vaga.titulo}” ainda`
        }
        acao={
          <BotaoLink href="/talentos?ver=todos" tamanho="sm" variante="secundario">
            Ver todos os talentos
          </BotaoLink>
        }
      >
        {entrada
          ? "Aqui aparece quem mora perto e pode no horário da vaga, ou já tem experiência, estudo ou curso na função."
          : "Aqui só aparece quem já trabalhou na função, numa área parecida, estudou ou fez um curso dela."}{" "}
        Divulgue o link da vaga ou procure em todos os talentos.
      </Vazio>
    );
  }

  if (todos.length === 0) {
    return (
      <Vazio
        icone={UserSearch}
        titulo="Ninguém em Talentos para esta vaga ainda"
        acao={
          <BotaoLink href="/painel/links" tamanho="sm">
            <Link2 aria-hidden />
            Divulgar a vaga
          </BotaoLink>
        }
      >
        Aparece quem tem currículo e deixou as empresas acharem (quem já curtiu a vaga está nos candidatos). Enquanto
        isso, divulgue o link da vaga.
      </Vazio>
    );
  }

  const paginas = Math.min(Math.ceil(todos.length / TALENTOS_POR_PAGINA), MAX_PAGINAS_TALENTOS);
  const aqui = Math.min(pagina, paginas);
  const talentos = todos.slice((aqui - 1) * TALENTOS_POR_PAGINA, aqui * TALENTOS_POR_PAGINA);
  const hoje = new Date(agora).toISOString().slice(0, 7);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-h3">
          {plural(todos.length, "pessoa", "pessoas")} para “{vaga.titulo}”
        </h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          {nivel === "rigida"
            ? entrada
              ? "Só quem atende cada item da vaga."
              : "Só quem já trabalhou na mesma função e atende cada item da vaga."
            : entrada
              ? "Vaga de entrada: quem mora perto e pode no horário, e quem tem experiência, estudo ou curso na função. Quem mais combina primeiro."
              : "Quem tem experiência, área parecida, estudo ou curso na função, quem mais combina primeiro."}{" "}
          Convide: a pessoa vê a vaga e, se curtir, chega na sua caixa de entrada.
        </p>
      </div>
      {niveis}
      {copiloto && (
        <Link
          href={`/painel/anuncio/${vaga.id}/copiloto`}
          className="flex items-center gap-3 rounded-lg border border-terra/40 bg-terra-soft p-3 text-body-sm hover:border-terra"
        >
          <Sparkles aria-hidden className="size-5 shrink-0 text-terra-text" />
          <span className="min-w-0 flex-1">
            <b className="font-semibold">Triagem com IA:</b> <IA /> lê estes currículos contra os critérios da vaga e
            mostra o trecho que comprova. <SeloCortesia curto className="align-middle" />
          </span>
          <ChevronRight aria-hidden className="size-4 shrink-0 text-terra-text" />
        </Link>
      )}
      <ConviteEmLote vagas={[{ id: vaga.id, titulo: vaga.titulo }]}>
      <MarcarTodos perfis={talentos.filter(({ t }) => !t.convidado).map(({ t }) => t.perfil_id)} />
      <ul aria-label={`Talentos para ${vaga.titulo}`} className="flex flex-col gap-3">
        {talentos.map(({ t, a }) => {
          const estudo = nomeEscolaridade(t.escolaridade);
          const contou = oQueContou(a);
          return (
            <li key={t.perfil_id} className="rounded-lg border border-line bg-surface-200 p-4 shadow-card sm:p-5">
              <div className="flex gap-3">
                <Avatar nome={t.nome} foto={t.foto} tamanho={48} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-label">{t.nome}</span>
                    {t.titulo && <span className="text-body-sm text-ink-muted">· {t.titulo}</span>}
                    <NotaAderencia a={a} longo />
                  </p>
                  <p className="text-body-sm text-ink-muted">
                    {formatarLugar(t.bairro, t.cidade)} · currículo atualizado {tempoRelativo(t.atualizado_em, agora)}
                  </p>
                  <p className="mt-1 text-body-sm">
                    {t.experiencias.length
                      ? t.experiencias
                          .slice(0, 2)
                          .map((e) => [e.cargo, e.onde].filter(Boolean).join(" · "))
                          .join(" / ")
                      : contou
                        ? `Primeiro emprego · ${contou}`
                        : "Primeiro emprego"}
                    {estudo && <span className="text-ink-muted"> · {estudo}</span>}
                    {t.disponibilidade.length > 0 && (
                      <span className="text-ink-muted">
                        {" "}
                        · pode {t.disponibilidade.map(nomeDisponibilidade).join(", ").toLowerCase()}
                      </span>
                    )}
                  </p>
                </div>
                <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
                  <BotaoConvidar anuncioId={vaga.id} perfilId={t.perfil_id} convidado={t.convidado} />
                  {!t.convidado && <MarcarConvite perfilId={t.perfil_id} nome={t.nome} />}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 sm:hidden">
                <BotaoConvidar anuncioId={vaga.id} perfilId={t.perfil_id} convidado={t.convidado} />
                {!t.convidado && <MarcarConvite perfilId={t.perfil_id} nome={t.nome} />}
              </div>
              <details className="group mt-3 border-t border-line pt-2">
                <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 text-label text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
                  Ver currículo e o que combina
                  <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 grid gap-4 md:grid-cols-2">
                  <CurriculoResumo
                    curriculo={{
                      escolaridade: t.escolaridade,
                      curso: t.curso,
                      estudos: t.estudos,
                      experiencias: t.experiencias,
                      cursos: t.cursos,
                      cnh: t.cnh,
                      disponibilidade: t.disponibilidade,
                      arquivo: null,
                      atualizado_em: t.atualizado_em,
                      titulo: t.titulo,
                      habilidades: t.habilidades,
                      jeito: jeitos.get(t.perfil_id),
                    }}
                    linkPdf={null}
                    hoje={hoje}
                  />
                  <CriteriosDaAderencia a={a} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
      </ConviteEmLote>
      {paginas > 1 && (
        <nav aria-label="Páginas" className="flex items-center justify-center gap-3">
          {aqui > 1 ? (
            <BotaoLink href={href(aqui - 1, nivel)} tamanho="sm" variante="fantasma">
              <ChevronLeft aria-hidden />
              Anterior
            </BotaoLink>
          ) : (
            <span className="w-24" />
          )}
          <span className="text-body-sm text-ink-muted">
            Página {aqui} de {paginas}
          </span>
          {aqui < paginas ? (
            <BotaoLink href={href(aqui + 1, nivel)} tamanho="sm" variante="fantasma">
              Próxima
              <ChevronRight aria-hidden />
            </BotaoLink>
          ) : (
            <span className="w-24" />
          )}
        </nav>
      )}
      <p className="text-body-sm text-ink-muted">
        O telefone e o e-mail só aparecem se a pessoa curtir a vaga e você aceitar. Quem não quiser mais aparecer tira o
        currículo de Talentos quando quiser.
      </p>
    </div>
  );
}
