import { Briefcase, ChevronDown, ChevronLeft, ChevronRight, Clock, GraduationCap, Link2, MapPin, Sparkles, UserSearch } from "lucide-react";
import { diaADiaDasVagas, jeitosDasPessoas } from "@/lib/servidor/jeito-de-trabalhar";
import { IA } from "@/components/apelido-da-ia";
import Link from "next/link";
import type { Aderencia } from "@/lib/aderencia";
import { aderenciasDaVaga } from "@/lib/talentos-da-vaga";
import { nomeDisponibilidade, nomeEscolaridade } from "@/lib/constantes";
import { copilotoLiberado, obterAnuncio, talentosParaVaga } from "@/lib/dados";
import { formatarLugar, plural, tempoRelativo } from "@/lib/formato";
import { MAX_PAGINAS_TALENTOS, TALENTOS_POR_PAGINA } from "@/lib/talentos";
import { CurriculoResumo } from "../curriculo-resumo";
import { SeloCortesia } from "../selo-cortesia";
import { BotaoConvidar } from "../painel/botao-convidar";
import { ConviteEmLote, MarcarConvite, MarcarTodos } from "./convite-em-lote";
import { CriteriosDaAderencia, MedidorAderencia } from "../painel/nota-aderencia";
import { Aviso, Avatar, Vazio } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";
import { classesChip } from "../painel/fluxo";
import { comFuncaoDasVagas, comFuncoes } from "@/lib/servidor/funcoes-pelo-contexto";
import { atividadesDaVaga } from "@/lib/servidor/atividades-da-vaga";
import { distanciaAproximada, montarMapa, SEM_BAIRRO, type Ponto } from "@/lib/mapa-dos-talentos";
import { lugaresDosTalentos, minhasVagasNoMapa } from "@/lib/servidor/mapa-dos-talentos";
import { MapaDosTalentos } from "./mapa-dos-talentos";

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

/** "≈ 3 km da vaga"; sem bairro no perfil, isso; com um bairro que o mapa não achou (ou a vaga sem lugar), nada. */
function distanciaDaVaga(lugar: Ponto | undefined, vaga: Ponto | null, bairro: string | null) {
  if (!vaga) return null;
  if (!lugar) return bairro?.trim() ? null : SEM_BAIRRO;
  const d = distanciaAproximada(lugar, vaga);
  return d && `${d} da vaga`;
}

export type NivelDaSugestao = "leve" | "rigida";

export async function ParaAVaga({
  vaga,
  pagina,
  href,
  agora,
  nivel = "rigida",
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
  const [[vagaComCbo], experiencias, diaADia, jeitos, atividades] = await Promise.all([
    comFuncaoDasVagas([anuncio]),
    comFuncoes(lista.map((t) => ({ experiencias: t.experiencias }))),
    diaADiaDasVagas([vaga.id]),
    jeitosDasPessoas(lista.map((t) => t.perfil_id)),
    // se cada um fazia as mesmas atividades da vaga (a IA leu; migração 20270831120000)
    atividadesDaVaga(vaga.id),
  ]);
  const { entrada, comAderencia, rigidos, mais } = aderenciasDaVaga(
    vagaComCbo,
    lista,
    {
      experiencias: experiencias.map((e) => e.experiencias),
      diaADia: diaADia.get(vaga.id) ?? null,
      jeitos,
      atividades,
    },
    agora,
  );
  const todos = nivel === "rigida" ? rigidos : mais;
  const niveis = (
    <div role="group" aria-label="Quanto o currículo precisa combinar" className="flex flex-wrap gap-2">
      <Link
        href={href(1, "rigida")}
        aria-current={nivel === "rigida" ? "true" : undefined}
        className={classesChip(nivel === "rigida")}
        scroll={false}
      >
        Atende a vaga
        <span className="tabular-nums opacity-70">{rigidos.length}</span>
      </Link>
      <Link
        href={href(1, "leve")}
        aria-current={nivel === "leve" ? "true" : undefined}
        className={classesChip(nivel === "leve")}
        scroll={false}
      >
        Ver mais gente
        <span className="tabular-nums opacity-70">{mais.length}</span>
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
            ? "Aqui só entra quem tem experiência, estudo ou curso na função e atende cada item da vaga (escolaridade, CNH, horário e distância)."
            : "Aqui só entra quem já trabalhou na mesma função e atende cada item da vaga (escolaridade, tempo de experiência, CNH, horário e distância)."}
        </Vazio>
      </div>
    );
  }

  if (nivel === "leve" && mais.length === 0 && rigidos.length > 0) {
    return (
      <div className="flex flex-col gap-4">
        {niveis}
        <Vazio
          icone={UserSearch}
          titulo={`Ninguém além de quem atende “${vaga.titulo}”`}
          acao={
            <BotaoLink href={href(1, "rigida")} tamanho="sm" variante="secundario">
              Ver {plural(rigidos.length, "pessoa", "pessoas")} que atendem a vaga
            </BotaoLink>
          }
        >
          Todo mundo com experiência, área parecida, estudo ou curso na função já está em “Atende a vaga”.
        </Vazio>
      </div>
    );
  }

  if (todos.length === 0 && lista.length > 0) {
    return (
      <Vazio
        icone={UserSearch}
        titulo={`Ninguém em Talentos com experiência para “${vaga.titulo}” ainda`}
        acao={
          <BotaoLink href="/talentos?ver=todos" tamanho="sm" variante="secundario">
            Ver todos os talentos
          </BotaoLink>
        }
      >
        Aqui só aparece quem já trabalhou na função, numa área parecida, estudou ou fez um curso dela. Divulgue o link
        da vaga ou procure em todos os talentos.
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

  // onde moram (o centro do bairro de cada um) e onde fica a vaga: o mapa e a distância de cada um até a vaga
  const [lugares, vagasNoMapa] = await Promise.all([
    lugaresDosTalentos(todos.map(({ t }) => t.perfil_id)),
    minhasVagasNoMapa(),
  ]);
  const ondeFica = vagasNoMapa.find((v) => v.id === vaga.id) ?? null;
  const mapa = lugares
    ? montarMapa(
        todos.map(({ t, a }) => ({
          id: t.perfil_id,
          nome: t.nome,
          titulo: t.titulo,
          nota: a.eliminado ? null : a.nota,
          lugar: lugares.get(t.perfil_id) ?? null,
        })),
        ondeFica ? [ondeFica] : [],
      )
    : null;

  const paginas = Math.min(Math.ceil(todos.length / TALENTOS_POR_PAGINA), MAX_PAGINAS_TALENTOS);
  const aqui = Math.min(pagina, paginas);
  const talentos = todos.slice((aqui - 1) * TALENTOS_POR_PAGINA, aqui * TALENTOS_POR_PAGINA);
  const hoje = new Date(agora).toISOString().slice(0, 7);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-h3">
          {plural(todos.length, "pessoa", "pessoas")}{nivel === "leve" ? " a mais" : ""} para “{vaga.titulo}”
        </h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          {nivel === "rigida"
            ? entrada
              ? "Só quem tem experiência, estudo ou curso na função e atende cada item da vaga."
              : "Só quem já trabalhou na mesma função e atende cada item da vaga."
            : "Quem chega perto sem atender tudo: experiência, área parecida, estudo ou curso na função, quem mais combina primeiro. Quem atende a vaga fica em “Atende a vaga”."}{" "}
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
      {mapa && mapa.bairros.length > 0 && (
        <MapaDosTalentos
          dados={mapa}
          titulo={`Onde moram as pessoas para “${vaga.titulo}”`}
          descricao={`Cada círculo é um bairro, do tamanho de quantas pessoas moram nele${ondeFica ? "; a vaga está em verde" : ""}. Toque num bairro para ver quem mora lá e o quanto combina.`}
        />
      )}
      <ConviteEmLote vagas={[{ id: vaga.id, titulo: vaga.titulo }]}>
      <MarcarTodos perfis={talentos.filter(({ t }) => !t.convidado).map(({ t }) => t.perfil_id)} />
      <ul aria-label={`Talentos para ${vaga.titulo}`} className="flex flex-col gap-3">
        {talentos.map(({ t, a }) => (
          <TalentoDaVaga
            key={t.perfil_id}
            t={t}
            a={a}
            vagaId={vaga.id}
            distancia={lugares ? distanciaDaVaga(lugares.get(t.perfil_id), ondeFica, t.bairro) : null}
            jeito={jeitos.get(t.perfil_id)}
            hoje={hoje}
            agora={agora}
          />
        ))}
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
        O telefone e o e-mail aparecem se a pessoa curtir a vaga e você aceitar, ou quando ela aceita uma conexão; nos
        planos, já no pedido de conexão, se a pessoa deixou. Quem não quiser mais aparecer tira o currículo de Talentos
        quando quiser.
      </p>
    </div>
  );
}

type TalentoDaLista = Awaited<ReturnType<typeof talentosParaVaga>>[number];

/**
 * Uma pessoa do "Para a sua vaga": a foto (ou as iniciais em cor), o nome, onde mora e a distância até a vaga, o que já
 * fez, o estudo e os horários; ao lado, o quanto combina (o medidor); embaixo, o Convidar e o "Ver currículo e o que
 * combina" (o currículo e o porquê da nota).
 */
export function TalentoDaVaga({
  t,
  a,
  vagaId,
  distancia,
  jeito,
  hoje,
  agora,
}: {
  t: TalentoDaLista;
  a: Aderencia;
  vagaId: string;
  /** "≈ 3 km da vaga" (do centro do bairro da pessoa até a vaga), "sem bairro no perfil…"; null sem o lugar da vaga */
  distancia: string | null;
  jeito: Parameters<typeof CurriculoResumo>[0]["curriculo"]["jeito"];
  hoje: string;
  agora: number;
}) {
  const estudo = nomeEscolaridade(t.escolaridade);
  const contou = oQueContou(a);
  const turnos = t.disponibilidade.map(nomeDisponibilidade).join(", ").toLowerCase();
  return (
    <li
      id={`talento-${t.perfil_id}`}
      className="scroll-mt-24 overflow-hidden rounded-lg border border-line bg-surface-200 shadow-card"
    >
      {/* a foto, o nome e o medidor numa linha; o resto embaixo: no celular, na largura toda; no computador, embaixo do
          nome, com a foto e o medidor ao lado */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 p-4 sm:gap-x-4 sm:p-5">
        <Avatar nome={t.nome} foto={t.foto} tamanho={52} colorida className="sm:row-span-2" />
        <div className="min-w-0">
          <h3 className="text-h3 break-words">{t.nome}</h3>
          <p className="text-body-sm text-ink-muted">
            {t.titulo && <span className="text-ink">{t.titulo} · </span>}
            atualizou {tempoRelativo(t.atualizado_em, agora)}
          </p>
          {/* o resumo de recrutador (migração 20270901120000) */}
          {t.resumo && <p className="mt-1 line-clamp-2 text-body-sm">{t.resumo}</p>}
        </div>
        <div className="sm:row-span-2">
          <MedidorAderencia a={a} tamanho={60} />
        </div>
        <ul className="col-span-3 mt-3 flex flex-col gap-1.5 text-body-sm sm:col-span-1 sm:col-start-2 sm:mt-2">
          <li className="flex items-start gap-2">
            <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-terra-text" />
            <span>
              {formatarLugar(t.bairro, t.cidade)}
              {distancia && <span className="text-ink-muted"> · {distancia}</span>}
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Briefcase aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
            <span className="line-clamp-2">
              {t.experiencias.length
                ? t.experiencias
                    .slice(0, 2)
                    .map((e) => [e.cargo, e.onde].filter(Boolean).join(" · "))
                    .join(" / ")
                : contou
                  ? `Primeiro emprego · ${contou}`
                  : "Primeiro emprego"}
            </span>
          </li>
          {(estudo || turnos) && (
            <li className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-muted">
              {estudo && (
                <span className="inline-flex items-center gap-2">
                  <GraduationCap aria-hidden className="size-4 shrink-0" />
                  {estudo}
                </span>
              )}
              {turnos && (
                <span className="inline-flex items-center gap-2">
                  <Clock aria-hidden className="size-4 shrink-0" />
                  Pode {turnos}
                </span>
              )}
            </li>
          )}
        </ul>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-2.5 sm:px-5">
        <BotaoConvidar anuncioId={vagaId} perfilId={t.perfil_id} convidado={t.convidado} />
        {!t.convidado && <MarcarConvite perfilId={t.perfil_id} nome={t.nome} />}
      </div>
      <details className="group border-t border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-label text-ink-muted hover:text-ink sm:px-5 [&::-webkit-details-marker]:hidden">
          Ver currículo e o que combina
          <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="grid gap-4 px-4 pb-4 sm:px-5 md:grid-cols-2">
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
              jeito,
              resumo: t.resumo,
            }}
            linkPdf={null}
            hoje={hoje}
          />
          <CriteriosDaAderencia a={a} />
        </div>
      </details>
    </li>
  );
}
