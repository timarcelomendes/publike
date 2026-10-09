import { BadgeCheck, Bus, MapPin } from "lucide-react";
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
import type { DadosCard } from "@/lib/tipos";
import { NotaDoProfissional } from "./avaliacoes";
import { BotaoCurtir } from "./botao-curtir";
import { Selo } from "./ui/basicos";

const DOIS_DIAS = 48 * 3600 * 1000;

/** CardVaga do Design System: serve para vaga e para serviço (com a primeira foto de trabalho). */
export function CardAnuncio({
  anuncio,
  agora,
  usuarioId,
  pertoDeCasa = null,
  tempoDe = null,
}: {
  anuncio: DadosCard;
  agora: number;
  usuarioId: string | null;
  /** Da busca com "Onde você mora?": 0 = no bairro da pessoa, 1 = na região dela. */
  pertoDeCasa?: number | null;
  /** Mostra o tempo de ônibus (ou a pé) a partir da casa da pessoa (CEP) ou de onde ela está (GPS). */
  tempoDe?: "casa" | "voce" | null;
}) {
  const novo = agora - new Date(anuncio.criado_em).getTime() < DOIS_DIAS;
  const distancia = formatarDistancia(anuncio.distancia_km);
  const tempo = tempoDe && anuncio.tipo === "vaga" ? deslocamentoCurto(anuncio.distancia_km) : null;
  const proprio = usuarioId !== null && usuarioId === anuncio.autor_id;
  const servico = anuncio.tipo === "servico";
  const foto = servico ? urlDaFotoTrabalho(anuncio.foto) : null;

  return (
    <article
      id={`anuncio-${anuncio.id}`}
      className="relative flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card transition-shadow hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus sm:p-5 group-data-[visao=grade]/visao:gap-2 group-data-[visao=grade]/visao:p-3 group-data-[visao=grade]/visao:sm:p-4"
    >
      <div className="flex flex-wrap gap-2">
        {novo && <Selo variante="novo">Novo</Selo>}
        <Selo>{rotuloModalidade(anuncio.tipo, anuncio.regime)}</Selo>
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

      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-h3 group-data-[visao=grade]/visao:text-label group-data-[visao=grade]/visao:line-clamp-2">
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
              <BadgeCheck aria-label="Perfil verificado" className="size-4 shrink-0 text-cerrado-text" />
            )}
          </p>
          {servico && <NotaDoProfissional media={anuncio.autor_nota} total={anuncio.autor_avaliacoes} compacto />}
        </div>
        {foto && (
          <Image
            src={foto}
            alt=""
            width={72}
            height={72}
            unoptimized
            className="size-18 shrink-0 rounded-md bg-surface-300 object-cover group-data-[visao=grade]/visao:size-12"
          />
        )}
      </div>

      <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
        <MapPin
          aria-hidden
          className="size-4 shrink-0 text-terra-text"
          fill="currentColor"
          stroke="var(--pk-surface-200)"
        />
        <span>
          {formatarLugar(anuncio.bairro, anuncio.cidade)}
          {distancia && ` · ${distancia}`}
        </span>
      </p>
      {tempo && (
        <p className="-mt-2 flex items-center gap-1.5 text-body-sm text-ink-muted">
          <Bus aria-hidden className="size-4 shrink-0 text-ink-muted" />
          <span>
            {tempo} {tempoDe === "casa" ? "da sua casa" : "de onde você está"}
          </span>
        </p>
      )}

      <p className="text-label group-data-[visao=grade]/visao:text-body-sm">{valorDoAnuncio(anuncio)}</p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-body-sm text-ink-muted group-data-[visao=grade]/visao:hidden">
        <span>{tempoRelativo(anuncio.criado_em, agora)}</span>
        {!proprio && (
          <BotaoCurtir
            className="relative z-10"
            anuncioId={anuncio.id}
            status={anuncio.minha_curtida}
            logado={usuarioId !== null}
            servico={servico}
          />
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
