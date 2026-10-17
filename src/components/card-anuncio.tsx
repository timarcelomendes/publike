import { Building2, Bus, Footprints, MapPin, MessageCircleReply, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  formatarDistancia,
  formatarLugar,
  rotuloConta,
  rotuloModalidade,
  tempoRelativo,
  urlDaFotoTrabalho,
  valorDoAnuncio,
} from "@/lib/formato";
import { deslocamentoCurto } from "@/lib/deslocamento";
import { nomeBeneficio } from "@/lib/constantes";
import { comoResponde, type Resposta } from "@/lib/resposta";
import type { DadosCard } from "@/lib/tipos";
import { NotaDoProfissional } from "./avaliacoes";
import { BotaoSalvarVaga } from "./anuncio/salvar-vaga";
import { BotaoCurtir } from "./botao-curtir";
import { SeloMatch, type MatchResumo } from "./match-vaga";
import { Selo } from "./ui/basicos";
import { SeloVerificado } from "@/components/selo-verificado";

const DOIS_DIAS = 48 * 3600 * 1000;
const DIA = 24 * 3600 * 1000;

/** No cartão, os benefícios mais comuns com o nome curto. */
const BENEFICIO_CURTO: Record<string, string> = { vale_transporte: "VT", vale_refeicao: "VR", vale_alimentacao: "VA" };

/** O que a vaga oferece e pede, numa linha do cartão. */
export type ExtrasDaVaga = { pedeCurriculo: boolean; beneficios: string[]; vagas: number; expiraEm: string };

/** Para quem publicou: o que chegou na própria vaga. */
export type MinhaVaga = { curtidas: number; novas: number };

/** "Encerra hoje", "Encerra amanhã", "Encerra em 3 dias" (só nos 3 últimos dias). */
function encerra(expiraEm: string, agora: number) {
  const dias = Math.ceil((new Date(expiraEm).getTime() - agora) / DIA);
  if (dias > 3 || dias < 0) return null;
  return dias <= 0 ? "Encerra hoje" : dias === 1 ? "Encerra amanhã" : `Encerra em ${dias} dias`;
}

/** CardVaga do Design System: serve para vaga e para serviço (com a primeira foto de trabalho). */
export function CardAnuncio({
  anuncio,
  agora,
  usuarioId,
  pertoDeCasa = null,
  tempoDe = null,
  match = null,
  resposta = null,
  extras = null,
  salva = null,
  minha = null,
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
  /** Vaga: benefícios, se pede currículo, quantas pessoas e até quando fica no ar. */
  extras?: ExtrasDaVaga | null;
  /** Vaga de outra pessoa, para quem tem conta: se está salva (null: sem a estrela). */
  salva?: boolean | null;
  /** A própria vaga: curtidas e quantas esperam resposta. */
  minha?: MinhaVaga | null;
}) {
  const novo = agora - new Date(anuncio.criado_em).getTime() < DOIS_DIAS;
  const distancia = formatarDistancia(anuncio.distancia_km);
  const tempo = tempoDe && anuncio.tipo === "vaga" ? deslocamentoCurto(anuncio.distancia_km) : null;
  const proprio = usuarioId !== null && usuarioId === anuncio.autor_id;
  const servico = anuncio.tipo === "servico";
  const foto = servico ? urlDaFotoTrabalho(anuncio.foto) : null;
  // depois do match, o "Deu match" já diz tudo (e não se confunde com o %); 0% no cartão
  // só desanima (o porquê fica na página da vaga)
  const comMatch = match && (match.nota ?? 0) > 0 && anuncio.minha_curtida !== "match" ? match : null;
  // "Outro" não diz nada sobre a contratação: sem selo
  const modalidade =
    anuncio.tipo === "vaga" && anuncio.regime === "outro" ? null : rotuloModalidade(anuncio.tipo, anuncio.regime);
  const linhaExtras = extras
    ? [
        ...extras.beneficios.slice(0, 3).map((b) => BENEFICIO_CURTO[b] ?? nomeBeneficio(b) ?? b),
        extras.pedeCurriculo ? "Pede currículo" : null,
        extras.vagas > 1 ? `${extras.vagas} vagas` : null,
      ].filter((x): x is string => Boolean(x))
    : [];
  const prazo = extras && !proprio ? encerra(extras.expiraEm, agora) : null;

  return (
    <article
      id={`anuncio-${anuncio.id}`}
      className="relative flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card transition-shadow hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus sm:p-5 group-data-[visao=grade]/visao:gap-2 group-data-[visao=grade]/visao:p-3 group-data-[visao=grade]/visao:sm:p-4 group-data-[visao=lista]/visao:grid group-data-[visao=lista]/visao:grid-cols-[minmax(0,1fr)_auto] group-data-[visao=lista]/visao:items-center group-data-[visao=lista]/visao:gap-x-4 group-data-[visao=lista]/visao:gap-y-1 group-data-[visao=lista]/visao:p-3 group-data-[visao=lista]/visao:sm:px-4"
    >
      <div className="flex flex-wrap gap-2 group-data-[visao=lista]/visao:hidden">
        {comMatch && <SeloMatch match={comMatch} />}
        {novo && <Selo variante="novo">Novo</Selo>}
        {modalidade && <Selo>{modalidade}</Selo>}
        {!servico && anuncio.autor_tipo === "agencia" && (
          <Selo variante="contorno">
            <Building2 aria-hidden />
            Agência
          </Selo>
        )}
        {pertoDeCasa === 0 && (
          <Selo variante="aviso" className="group-data-[visao=grade]/visao:hidden">
            No seu bairro
          </Selo>
        )}
        {pertoDeCasa === 1 && (
          <Selo variante="contorno" className="group-data-[visao=grade]/visao:hidden">
            Na sua região
          </Selo>
        )}
        {anuncio.minha_curtida === "match" && <Selo variante="match">Deu match</Selo>}
        {proprio && (
          <Selo variante="contorno" className="group-data-[visao=grade]/visao:hidden">
            Seu anúncio
          </Selo>
        )}
      </div>

      <div className="flex items-start gap-3 group-data-[visao=lista]/visao:col-start-1">
        <div className="min-w-0 flex-1">
          <h3 className="text-h3 group-data-[visao=grade]/visao:text-label group-data-[visao=grade]/visao:line-clamp-2 group-data-[visao=lista]/visao:text-label group-data-[visao=lista]/visao:sm:text-body-lg group-data-[visao=lista]/visao:truncate">
            <Link
              href={`/anuncio/${anuncio.id}`}
              className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
            >
              {anuncio.titulo}
            </Link>
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-body-sm text-ink-muted group-data-[visao=grade]/visao:hidden">
            <span className="truncate">
              {anuncio.autor_nome} · {rotuloConta(anuncio.autor_tipo)}
            </span>
            {anuncio.autor_verificado && (
              <SeloVerificado agencia={anuncio.autor_tipo === "agencia"} />
            )}
          </p>
          {servico && <NotaDoProfissional media={anuncio.autor_nota} total={anuncio.autor_avaliacoes} compacto />}
          {resposta && !proprio && (
            <p
              className={`mt-0.5 flex items-center gap-1 text-body-sm group-data-[visao=grade]/visao:hidden ${
                comoResponde(resposta).bom ? "text-cerrado-text" : "text-ink-muted"
              }`}
            >
              <MessageCircleReply aria-hidden className="size-4 shrink-0" />
              <span className="truncate">{comoResponde(resposta).texto}</span>
            </p>
          )}
        </div>
        {comMatch && (
          // na lista, os selos de cima somem: o % fica ao lado do título
          <span className="hidden shrink-0 group-data-[visao=lista]/visao:block">
            <SeloMatch match={comMatch} />
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

      <p className="flex items-start gap-1.5 text-body-sm text-ink-muted group-data-[visao=lista]/visao:col-start-1">
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
        <p className="-mt-2 flex items-center gap-1.5 text-body-sm text-ink-muted group-data-[visao=lista]/visao:col-start-1 group-data-[visao=lista]/visao:mt-0">
          {tempo.includes("a pé") ? (
            <Footprints aria-hidden className="size-4 shrink-0 text-ink-muted" />
          ) : (
            <Bus aria-hidden className="size-4 shrink-0 text-ink-muted" />
          )}
          <span>
            {tempo} {tempoDe === "casa" ? "da sua casa" : "de onde você está"}
          </span>
        </p>
      )}

      <p className="text-label group-data-[visao=grade]/visao:text-body-sm group-data-[visao=lista]/visao:col-start-2 group-data-[visao=lista]/visao:row-start-1 group-data-[visao=lista]/visao:max-w-48 group-data-[visao=lista]/visao:text-right">
        {valorDoAnuncio(anuncio)}
      </p>
      {(linhaExtras.length > 0 || prazo) && (
        <p className="-mt-1.5 text-body-sm text-ink-muted group-data-[visao=grade]/visao:hidden group-data-[visao=lista]/visao:hidden">
          {linhaExtras.join(" · ")}
          {prazo && (
            <span className="font-semibold whitespace-nowrap text-terra-text">
              {linhaExtras.length > 0 && " · "}
              {prazo}
            </span>
          )}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-body-sm text-ink-muted group-data-[visao=grade]/visao:hidden group-data-[visao=lista]/visao:col-start-2 group-data-[visao=lista]/visao:row-span-2 group-data-[visao=lista]/visao:row-start-2 group-data-[visao=lista]/visao:mt-0 group-data-[visao=lista]/visao:justify-end group-data-[visao=lista]/visao:self-start group-data-[visao=lista]/visao:border-0 group-data-[visao=lista]/visao:pt-0">
        <span className="group-data-[visao=lista]/visao:hidden">{tempoRelativo(anuncio.criado_em, agora)}</span>
        {proprio && minha && (
          <Link
            href={`/painel/anuncio/${anuncio.id}`}
            className="relative z-10 inline-flex min-h-11 items-center gap-1.5 rounded-pill border border-line-strong px-4 text-label text-ink hover:bg-surface-300"
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
          <span className="flex items-center gap-2">
            {salva !== null && !servico && <BotaoSalvarVaga anuncioId={anuncio.id} salva={salva} logado compacto />}
            <BotaoCurtir
              className="relative z-10"
              anuncioId={anuncio.id}
              status={anuncio.minha_curtida}
              logado={usuarioId !== null}
              servico={servico}
              quem={anuncio.autor_nome}
            />
          </span>
        )}
      </div>
    </article>
  );
}

export function EsqueletoCards({ quantos = 4 }: { quantos?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: quantos }, (_, i) => (
        <div key={i} className="flex h-60 flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5">
          <div className="h-6 w-28 animate-pulse rounded-pill bg-surface-300" />
          <div className="h-6 w-3/4 animate-pulse rounded-md bg-surface-300" />
          <div className="h-4 w-1/2 animate-pulse rounded-md bg-surface-300" />
          <div className="h-4 w-2/3 animate-pulse rounded-md bg-surface-300" />
          <div className="mt-auto h-10 w-full animate-pulse rounded-md bg-surface-300" />
        </div>
      ))}
    </div>
  );
}
