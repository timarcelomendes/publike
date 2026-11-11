import { Bus, CalendarClock, Footprints, Heart, MapPin, MessageCircleReply, UserCheck, Users, Zap } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  formatarDistancia,
  formatarLugar,
  rotuloModalidade,
  tempoRelativo,
  urlDaFotoTrabalho,
  valorDoAnuncio,
} from "@/lib/formato";
import { deslocamentoCurto } from "@/lib/deslocamento";
import { nomeBeneficio } from "@/lib/constantes";
import { comoResponde, type Resposta } from "@/lib/resposta";
import type { ResumoComentarios } from "@/lib/comentarios";
import type { DadosCard } from "@/lib/tipos";
import type { GanhoExtra } from "@/lib/vaga-extra";
import { NotaDoProfissional } from "./avaliacoes";
import { AcoesDaVagaNoCartao } from "./anuncio/acoes-no-feed";
import { BotaoSalvarVaga } from "./anuncio/salvar-vaga";
import { BotaoCurtir } from "./botao-curtir";
import { AnelDeMatch, ehOutraArea, SeloMatch, type MatchResumo } from "./match-vaga";
import { AnelMatchFechado, SeloMatchFechado } from "./selo-match-fechado";
import { Avatar, Selo } from "./ui/basicos";
import { SeloVerificado } from "@/components/selo-verificado";

const DOIS_DIAS = 48 * 3600 * 1000;
/** Quantas etiquetas o cartão mostra antes do "+N". */
const MAX_ETIQUETAS = 4;
const DIA = 24 * 3600 * 1000;

/** No cartão, os benefícios mais comuns com o nome curto. */
const BENEFICIO_CURTO: Record<string, string> = { vale_transporte: "VT", vale_refeicao: "VR", vale_alimentacao: "VA" };

/** O que a vaga oferece e pede, numa linha do cartão. */
export type ExtrasDaVaga = {
  pedeCurriculo: boolean;
  beneficios: string[];
  vagas: number;
  expiraEm: string;
  /** a vaga foi preenchida: continua na busca, com a marcação, e não dá mais para curtir */
  preenchida?: boolean;
  /** quem curte já vê o WhatsApp de quem publicou, sem esperar o aceite */
  contatoDireto?: boolean;
  /** precisa de alguém para começar logo */
  comecaJa?: boolean;
  /** comissão, bônus, gorjeta... (vão junto do valor) */
  ganhos?: GanhoExtra[];
  /** o começo da descrição (duas linhas no cartão) */
  resumo?: string | null;
};

/** Para quem publicou: o que chegou na própria vaga. */
export type MinhaVaga = { curtidas: number; novas: number };

/** "Encerra hoje", "Encerra amanhã", "Encerra em 3 dias" (só nos 3 últimos dias). */
function encerra(expiraEm: string, agora: number) {
  const dias = Math.ceil((new Date(expiraEm).getTime() - agora) / DIA);
  if (dias > 3 || dias < 0) return null;
  return dias <= 0 ? "Encerra hoje" : dias === 1 ? "Encerra amanhã" : `Encerra em ${dias} dias`;
}

/** O tipo de quem publicou, curto, ao lado de quando publicou ("Empresa · há 2 horas"). */
function tipoCurto(tipo: string, servico: boolean) {
  if (tipo === "agencia") return "Agência";
  if (tipo === "empresa") return "Empresa";
  if (tipo === "comercio") return "Comércio";
  return servico ? "Profissional" : "Pessoa";
}

/** Uma etiqueta do cartão (contratação, benefício, prazo): pílula em letra normal, para ler de relance. */
function Etiqueta({ children, className = "bg-surface-300 text-ink" }: { children: ReactNode; className?: string }) {
  return (
    <li
      className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-[12px] leading-5 font-semibold ${className}`}
    >
      {children}
    </li>
  );
}

/**
 * CardVaga do Design System: serve para vaga e para serviço (com a primeira foto de trabalho).
 * Em Blocos: a faixa "Contratando N pessoas" (vaga com mais de uma vaga), quem publicou (o logo
 * ou as iniciais), o título, o valor com o lugar e o tempo de ônibus, as etiquetas e o rodapé com o % de match
 * num anel, o tempo de resposta e os botões. Lista e Grade (VisaoExplorar, grupo
 * `visao`) reaproveitam as mesmas partes, compactas.
 */
export function CardAnuncio({
  anuncio,
  agora,
  usuarioId,
  pertoDeCasa = null,
  tempoDe = null,
  match = null,
  resposta = null,
  curtidas = null,
  extras = null,
  salva = null,
  minha = null,
  semAutor = false,
  para = null,
  comentarios = null,
}: {
  anuncio: DadosCard;
  agora: number;
  usuarioId: string | null;
  /** Da busca com "Onde você mora?": 0 = no bairro da pessoa, 1 = na região dela. */
  pertoDeCasa?: number | null;
  /** Mostra o tempo de ônibus (ou a pé) a partir da casa da pessoa (CEP) ou de onde ela está (GPS). */
  tempoDe?: "casa" | "voce" | null;
  /** Vaga, para quem tem currículo: o % de match (sem currículo ou com pouco para comparar, null). */
  match?: MatchResumo | null;
  /** Vaga: quanto quem publicou costuma responder as curtidas (só com 5 curtidas ou mais). */
  resposta?: Resposta | null;
  /** Vaga: quantas pessoas já curtiram (só a partir de 3; quem curtiu nunca aparece). */
  curtidas?: number | null;
  /** Vaga: benefícios, se pede currículo, quantas pessoas e até quando fica no ar. */
  extras?: ExtrasDaVaga | null;
  /** Vaga de outra pessoa, para quem tem conta: se está salva (null: sem a estrela). */
  salva?: boolean | null;
  /** A própria vaga: curtidas e quantas esperam resposta. */
  minha?: MinhaVaga | null;
  /** Na página de vagas da própria empresa: sem a logo e o nome (que já estão no alto), só há quanto tempo. */
  semAutor?: boolean;
  /** Vaga de agência: para qual empresa é ("Spoleto"; confidencial: "empresa confidencial"). */
  para?: string | null;
  /**
   * Vaga de outra conta: quantos comentários tem e o último (com o resumo, aparecem os comentários, que abrem numa
   * janela por cima da lista, e o Indicar).
   */
  comentarios?: ResumoComentarios | null;
}) {
  const novo = agora - new Date(anuncio.criado_em).getTime() < DOIS_DIAS;
  const distancia = formatarDistancia(anuncio.distancia_km);
  const tempo = tempoDe && anuncio.tipo === "vaga" ? deslocamentoCurto(anuncio.distancia_km) : null;
  const proprio = usuarioId !== null && usuarioId === anuncio.autor_id;
  const servico = anuncio.tipo === "servico";
  const foto = servico ? urlDaFotoTrabalho(anuncio.foto) : null;
  // depois do match, o "Deu match" já diz tudo (e não se confunde com o %); 0% no cartão
  // só desanima (o porquê fica na página da vaga)
  // a vaga de outra área fica sem selo na lista (o "Outra área" fica na página da vaga e no Descobrir)
  const comMatch =
    match && (match.nota ?? 0) > 0 && !ehOutraArea(match) && anuncio.minha_curtida !== "match" ? match : null;
  // "Outro" não diz nada sobre a contratação: sem etiqueta
  const modalidade =
    anuncio.tipo === "vaga" && anuncio.regime === "outro" ? null : rotuloModalidade(anuncio.tipo, anuncio.regime);
  const preenchida = Boolean(extras?.preenchida);
  // sem conta: o % embaçado chama para entrar e ver o quanto a vaga combina (11/11/2026)
  const fechado = usuarioId === null && anuncio.tipo === "vaga" && !preenchida && !match;
  const anel = Boolean(comMatch) || fechado;
  const prazo = extras && !proprio && !preenchida ? encerra(extras.expiraEm, agora) : null;
  // mais de uma vaga: a faixa no alto do cartão (preenchida, não conta mais)
  const vagas = extras && !servico && !preenchida ? extras.vagas : 1;
  const respostaDaVaga = resposta && !proprio ? comoResponde(resposta) : null;
  // só a partir de 3 (o banco já não manda menos), e não na própria vaga (lá vai o botão dos candidatos)
  const curtidasDeOutros = curtidas !== null && curtidas >= 3 && !proprio ? curtidas : null;
  // o próprio anúncio fora da busca (no perfil, por exemplo) não tem o que mostrar no rodapé
  const temRodape = !proprio || Boolean(minha);

  // um selo só no alto, o que mais importa
  const seloPrincipal = preenchida ? (
    <Selo variante="aviso">
      <UserCheck aria-hidden />
      Vaga preenchida
    </Selo>
  ) : anuncio.minha_curtida === "match" ? (
    <Selo variante="match">Deu match</Selo>
  ) : proprio ? (
    <Selo variante="contorno">Seu anúncio</Selo>
  ) : novo ? (
    <Selo variante="novo">Novo</Selo>
  ) : null;

  const etiquetas: ReactNode[] = [];
  // na lista, a modalidade já vai na linha do lugar ("CLT · Setor Sul")
  if (modalidade)
    etiquetas.push(
      <Etiqueta key="modalidade" className="bg-surface-300 text-ink group-data-[visao=lista]/visao:hidden">
        {modalidade}
      </Etiqueta>,
    );
  if (extras?.comecaJa && !preenchida)
    etiquetas.push(
      <Etiqueta key="comeca" className="bg-terra-soft text-terra-text">
        <CalendarClock aria-hidden className="mr-1 size-3.5" />
        Começa já
      </Etiqueta>,
    );
  if (prazo) {
    etiquetas.push(
      <Etiqueta key="prazo" className="bg-surface-300 text-terra-text">
        {prazo}
      </Etiqueta>,
    );
  }
  if (pertoDeCasa === 0) {
    etiquetas.push(
      <Etiqueta key="perto" className="bg-terra-soft text-terra-text">
        No seu bairro
      </Etiqueta>,
    );
  } else if (pertoDeCasa === 1) {
    etiquetas.push(
      <Etiqueta key="perto" className="text-ink-muted ring-1 ring-line-strong ring-inset">
        Na sua região
      </Etiqueta>,
    );
  }
  if (extras?.contatoDireto && !preenchida && !proprio)
    etiquetas.push(
      <Etiqueta key="direto" className="bg-surface-300 text-cerrado-text">
        <Zap aria-hidden className="mr-1 size-3.5" />
        Contato direto
      </Etiqueta>,
    );
  for (const b of extras?.beneficios.slice(0, 3) ?? []) {
    etiquetas.push(<Etiqueta key={b}>{BENEFICIO_CURTO[b] ?? nomeBeneficio(b) ?? b}</Etiqueta>);
  }
  if (extras?.pedeCurriculo) etiquetas.push(<Etiqueta key="curriculo">Pede currículo</Etiqueta>);
  // no máximo 4 etiquetas (o resto, "+2", fica na página da vaga): com 8, o cartão virava uma parede de pílulas
  // (02/11/2026, claude/plano-home-visitante.md). Com uma a mais só, ela aparece no lugar do "+1".
  if (etiquetas.length > MAX_ETIQUETAS + 1) {
    const escondidas = etiquetas.length - MAX_ETIQUETAS;
    etiquetas.splice(
      MAX_ETIQUETAS,
      escondidas,
      <Etiqueta key="mais" className="text-ink-muted ring-1 ring-line-strong ring-inset">
        +{escondidas}
        <span className="sr-only"> na página da vaga</span>
      </Etiqueta>,
    );
  }

  return (
    <article
      id={`anuncio-${anuncio.id}`}
      className="group/cartao @container relative flex min-w-0 flex-col rounded-lg border border-line bg-surface-200 shadow-card transition-shadow hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus group-data-[visao=lista]/visao:grid group-data-[visao=lista]/visao:grid-cols-[minmax(0,1fr)_auto] group-data-[visao=lista]/visao:items-center group-data-[visao=lista]/visao:gap-x-4 group-data-[visao=lista]/visao:gap-y-1 group-data-[visao=lista]/visao:p-3 group-data-[visao=lista]/visao:sm:px-4"
    >
      {vagas > 1 && (
        // o raio de dentro do cartão (o de fora menos a borda)
        // uma faixa no alto do cartão (02/11/2026: o cartão largo deixou de crescer, a capa alta saiu)
        <p className="flex items-center rounded-t-[21px] bg-ipe px-4 py-1.5 sm:px-5 group-data-[visao=grade]/visao:hidden group-data-[visao=lista]/visao:hidden">
          <span className="inline-flex items-center gap-1.5 text-caption text-on-ipe uppercase">
            <Users aria-hidden className="size-3.5 shrink-0" />
            Contratando {vagas} pessoas
          </span>
        </p>
      )}

      {/* Na lista, as partes entram direto na grade do cartão (display: contents) */}
      <div className="flex flex-1 flex-col gap-2.5 p-4 group-data-[visao=grade]/visao:gap-2 group-data-[visao=grade]/visao:p-3 group-data-[visao=grade]/visao:sm:p-4 group-data-[visao=lista]/visao:contents">
        {/* Quem publicou. Na grade, só os selos; na lista, só o nome. */}
        <div
          className={`flex items-center gap-3 group-data-[visao=lista]/visao:col-start-1 ${
            seloPrincipal || anel ? "" : "group-data-[visao=grade]/visao:hidden"
          }`}
        >
          {semAutor ? (
            <p className="min-w-0 flex-1 truncate text-body-sm text-ink-muted group-data-[visao=grade]/visao:hidden">
              {para ? `Para ${para} · ` : ""}
              {tempoRelativo(anuncio.criado_em, agora)}
            </p>
          ) : (
            <>
              <span className="contents group-data-[visao=grade]/visao:hidden group-data-[visao=lista]/visao:hidden">
                <Avatar
                  nome={anuncio.autor_nome}
                  foto={anuncio.autor_foto}
                  tamanho={40}
                  forma={anuncio.autor_tipo === "pessoa" ? "redonda" : "quadrada"}
                  colorida
                />
              </span>
              <div className="min-w-0 flex-1 group-data-[visao=grade]/visao:hidden">
                <p className="flex items-center gap-1 text-label">
                  <span className="truncate">{anuncio.autor_nome}</span>
                  {anuncio.autor_verificado && <SeloVerificado agencia={anuncio.autor_tipo === "agencia"} />}
                </p>
                <p className="truncate text-body-sm text-ink-muted group-data-[visao=lista]/visao:hidden">
                  <span>{tipoCurto(anuncio.autor_tipo, servico)}</span> · {tempoRelativo(anuncio.criado_em, agora)}
                </p>
              </div>
            </>
          )}
          {seloPrincipal && (
            <span className="shrink-0 self-start group-data-[visao=lista]/visao:hidden">{seloPrincipal}</span>
          )}
          {(comMatch || fechado) && (
            // na grade, o % fica junto dos selos (o rodapé some)
            <span className="hidden shrink-0 group-data-[visao=grade]/visao:inline-flex">
              {comMatch ? <SeloMatch match={comMatch} /> : <SeloMatchFechado />}
            </span>
          )}
        </div>

        <div className="flex items-start gap-3 group-data-[visao=lista]/visao:col-start-1 group-data-[visao=lista]/visao:row-start-1">
          <div className="min-w-0 flex-1">
            <h3 className="text-h3 group-data-[visao=grade]/visao:line-clamp-2 group-data-[visao=grade]/visao:text-label group-data-[visao=lista]/visao:truncate group-data-[visao=lista]/visao:text-label group-data-[visao=lista]/visao:sm:text-body-lg">
              <Link
                href={`/anuncio/${anuncio.id}`}
                className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
              >
                {anuncio.titulo}
              </Link>
            </h3>
            {servico && <NotaDoProfissional media={anuncio.autor_nota} total={anuncio.autor_avaliacoes} compacto />}
          </div>
          {(comMatch || fechado) && (
            // na lista, os selos de cima somem: o % fica ao lado do título
            <span className="hidden shrink-0 group-data-[visao=lista]/visao:block">
              {comMatch ? <SeloMatch match={comMatch} /> : <SeloMatchFechado />}
            </span>
          )}
          {foto && (
            <Image
              src={foto}
              alt=""
              width={72}
              height={72}
              unoptimized
              className="size-18 shrink-0 rounded-md bg-surface-300 object-cover group-data-[visao=grade]/visao:size-12 group-data-[visao=lista]/visao:hidden"
            />
          )}
        </div>

        {/* O valor, o lugar e o tempo até lá: uma linha que quebra quando falta espaço */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 group-data-[visao=grade]/visao:flex-col group-data-[visao=grade]/visao:items-start group-data-[visao=lista]/visao:contents">
          <p className="text-body font-bold group-data-[visao=grade]/visao:order-last group-data-[visao=grade]/visao:text-body-sm group-data-[visao=lista]/visao:col-start-2 group-data-[visao=lista]/visao:row-start-1 group-data-[visao=lista]/visao:max-w-48 group-data-[visao=lista]/visao:text-right group-data-[visao=lista]/visao:text-label">
            {valorDoAnuncio(extras?.ganhos ? { ...anuncio, ganhos_extras: extras.ganhos } : anuncio)}
          </p>
          <p className="flex items-start gap-1 text-body-sm font-semibold text-terra-text group-data-[visao=grade]/visao:font-normal group-data-[visao=grade]/visao:text-ink-muted group-data-[visao=lista]/visao:col-start-1 group-data-[visao=lista]/visao:font-normal group-data-[visao=lista]/visao:text-ink-muted">
            {/* no alto da primeira linha, quando o endereço quebra */}
            <MapPin
              aria-hidden
              className="mt-0.5 size-4 shrink-0 text-terra-text"
              fill="currentColor"
              stroke="var(--pk-surface-200)"
            />
            <span className="min-w-0">
              {modalidade && <span className="hidden group-data-[visao=lista]/visao:inline">{modalidade} · </span>}
              {formatarLugar(anuncio.bairro, anuncio.cidade)}
              {distancia && ` · ${distancia}`}
            </span>
          </p>
          {tempo && (
            <p className="flex items-center gap-1 text-body-sm text-ink-muted group-data-[visao=lista]/visao:col-start-1">
              {tempo.includes("a pé") ? (
                <Footprints aria-hidden className="size-4 shrink-0" />
              ) : (
                <Bus aria-hidden className="size-4 shrink-0" />
              )}
              <span>
                {tempo} {tempoDe === "casa" ? "da sua casa" : "de onde você está"}
              </span>
            </p>
          )}
        </div>

        {extras?.resumo && (
          <p className="line-clamp-2 text-body-sm text-ink-muted group-data-[visao=grade]/visao:hidden group-data-[visao=lista]/visao:hidden">
            {extras.resumo}
          </p>
        )}

        {etiquetas.length > 0 && (
          // na lista, numa linha embaixo do lugar (benefícios, currículo, prazo): o que ajuda a escolher
          <ul
            className={`flex flex-wrap gap-1.5 group-data-[visao=grade]/visao:hidden ${
              etiquetas.length === (modalidade ? 1 : 0)
                ? "group-data-[visao=lista]/visao:hidden"
                : "group-data-[visao=lista]/visao:col-start-1 group-data-[visao=lista]/visao:gap-1"
            }`}
          >
            {etiquetas}
          </ul>
        )}

        {temRodape && (
          <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-2.5 border-t border-line pt-2.5 text-body-sm text-ink-muted group-data-[visao=grade]/visao:hidden group-data-[visao=lista]/visao:col-start-2 group-data-[visao=lista]/visao:row-span-2 group-data-[visao=lista]/visao:row-start-2 group-data-[visao=lista]/visao:mt-0 group-data-[visao=lista]/visao:justify-end group-data-[visao=lista]/visao:self-start group-data-[visao=lista]/visao:border-0 group-data-[visao=lista]/visao:pt-0">
            {anel && (
              // em Blocos, o % de match num anel à esquerda dos botões, na mesma linha e do tamanho deles (11/11/2026:
              // o selo largo empurrava os botões para outra linha); sem conta, o anel chama para entrar. flex: sem a
              // linha de texto em volta, o anel fica no meio da altura dos botões
              <span className="flex shrink-0 group-data-[visao=lista]/visao:hidden">
                {comMatch ? <AnelDeMatch match={comMatch} /> : <AnelMatchFechado />}
              </span>
            )}
            {/* os indicadores, também para quem está sem conta: como quem publicou responde e quantos já curtiram */}
            {/* sem espaço ao lado dos botões, vão para uma linha só deles, em cima (antes, espremiam e cortavam) */}
            <span
              className={`flex flex-1 flex-wrap items-center gap-x-3 gap-y-1 group-data-[visao=lista]/visao:hidden ${
                respostaDaVaga || curtidasDeOutros !== null ? "min-w-[13rem]" : "min-w-0"
              }`}
            >
              {respostaDaVaga && (
                <span className={`flex items-center gap-1 ${respostaDaVaga.bom ? "text-cerrado-text" : ""}`}>
                  <MessageCircleReply aria-hidden className="size-4 shrink-0" />
                  <span className="leading-tight">{respostaDaVaga.texto}</span>
                </span>
              )}
              {curtidasDeOutros !== null && (
                <span className="flex items-center gap-1">
                  <Heart aria-hidden className="size-4 shrink-0 text-like" />
                  <span className="leading-tight">
                    <b className="font-semibold tabular-nums">{curtidasDeOutros}</b> já curtiram
                  </span>
                </span>
              )}
            </span>
            {proprio && minha && (
              <Link
                href={`/painel/anuncio/${anuncio.id}`}
                className="relative z-10 inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-pill border border-line-strong px-4 text-label text-ink hover:bg-surface-300"
              >
                <Users aria-hidden className="size-4 shrink-0" />
                {minha.curtidas === 0
                  ? "Ninguém curtiu ainda"
                  : minha.novas > 0
                    ? `${minha.novas} para responder`
                    : `${minha.curtidas} ${minha.curtidas === 1 ? "candidato" : "candidatos"}`}
              </Link>
            )}
            {!proprio && (
              <span className="ml-auto flex shrink-0 items-center gap-2">
                {comentarios !== null && !servico && !preenchida && (
                  <AcoesDaVagaNoCartao
                    anuncioId={anuncio.id}
                    titulo={anuncio.titulo}
                    comentarios={comentarios}
                    logado={usuarioId !== null}
                  />
                )}
                {salva !== null && !servico && !preenchida && (
                  <BotaoSalvarVaga anuncioId={anuncio.id} salva={salva} logado compacto />
                )}
                {preenchida && anuncio.minha_curtida !== "match" ? (
                  <span className="text-label text-ink-muted">Vaga preenchida</span>
                ) : (
                  <BotaoCurtir
                    className="relative z-10"
                    anuncioId={anuncio.id}
                    status={anuncio.minha_curtida}
                    logado={usuarioId !== null}
                    servico={servico}
                    quem={anuncio.autor_nome}
                  />
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function EsqueletoCards({ quantos = 4 }: { quantos?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: quantos }, (_, i) => (
        <div key={i} className="flex h-64 flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5">
          <div className="flex items-center gap-3">
            <div className="size-11 animate-pulse rounded-md bg-surface-300" />
            <div className="flex flex-1 flex-col gap-1.5">
              <div className="h-4 w-1/2 animate-pulse rounded-md bg-surface-300" />
              <div className="h-3 w-1/3 animate-pulse rounded-md bg-surface-300" />
            </div>
          </div>
          <div className="h-6 w-3/4 animate-pulse rounded-md bg-surface-300" />
          <div className="h-4 w-2/3 animate-pulse rounded-md bg-surface-300" />
          <div className="flex gap-1.5">
            {Array.from({ length: 3 }, (_, j) => (
              <div key={j} className="h-6 w-14 animate-pulse rounded-pill bg-surface-300" />
            ))}
          </div>
          <div className="mt-auto h-10 w-full animate-pulse rounded-md bg-surface-300" />
        </div>
      ))}
    </div>
  );
}
