import { BadgeCheck, MapPin } from "lucide-react";
import Link from "next/link";
import {
  formatarDistancia,
  formatarLugar,
  formatarValor,
  rotuloConta,
  rotuloModalidade,
  tempoRelativo,
} from "@/lib/formato";
import type { DadosCard } from "@/lib/tipos";
import { BotaoCurtir } from "./botao-curtir";
import { Selo } from "./ui/basicos";

const DOIS_DIAS = 48 * 3600 * 1000;

/** CardVaga do Design System: serve para vaga e para serviço. */
export function CardAnuncio({
  anuncio,
  agora,
  usuarioId,
}: {
  anuncio: DadosCard;
  agora: number;
  usuarioId: string | null;
}) {
  const novo = agora - new Date(anuncio.criado_em).getTime() < DOIS_DIAS;
  const distancia = formatarDistancia(anuncio.distancia_km);
  const proprio = usuarioId !== null && usuarioId === anuncio.autor_id;

  return (
    <article
      id={`anuncio-${anuncio.id}`}
      className="relative flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card transition-shadow hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus sm:p-5"
    >
      <div className="flex flex-wrap gap-2">
        {novo && <Selo variante="novo">Novo</Selo>}
        <Selo>{rotuloModalidade(anuncio.tipo, anuncio.regime)}</Selo>
        {anuncio.minha_curtida === "match" && <Selo variante="match">Deu match</Selo>}
        {proprio && <Selo variante="contorno">Seu anúncio</Selo>}
      </div>

      <div>
        <h3 className="text-h3">
          <Link
            href={`/anuncio/${anuncio.id}`}
            className="outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
          >
            {anuncio.titulo}
          </Link>
        </h3>
        <p className="mt-0.5 flex items-center gap-1 text-body-sm text-ink-muted">
          <span className="truncate">
            {anuncio.autor_nome} · {rotuloConta(anuncio.autor_tipo)}
          </span>
          {anuncio.autor_verificado && (
            <BadgeCheck aria-label="Perfil verificado" className="size-4 shrink-0 text-cerrado-text" />
          )}
        </p>
      </div>

      <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
        <MapPin aria-hidden className="size-4 shrink-0 text-terra-text" fill="currentColor" stroke="var(--pk-surface-200)" />
        <span>
          {formatarLugar(anuncio.bairro, anuncio.cidade)}
          {distancia && ` · ${distancia}`}
        </span>
      </p>

      <p className="text-label">
        {formatarValor(anuncio.pagamento_valor, anuncio.pagamento_unidade, anuncio.beneficios)}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-body-sm text-ink-muted">
        <span>{tempoRelativo(anuncio.criado_em, agora)}</span>
        {!proprio && (
          <BotaoCurtir
            className="relative z-10"
            anuncioId={anuncio.id}
            status={anuncio.minha_curtida}
            logado={usuarioId !== null}
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
