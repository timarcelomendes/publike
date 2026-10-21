import { Bus, CircleCheck, Footprints, MapPin, MessageCircle, MessagesSquare } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { nomeBeneficio } from "@/lib/constantes";
import { caminhoConversa } from "@/lib/conversas";
import { deslocamentoCurto } from "@/lib/deslocamento";
import {
  formatarDistancia,
  formatarLugar,
  formatarMoeda,
  linkWhatsApp,
  rotuloModalidade,
  urlDaFotoTrabalho,
} from "@/lib/formato";
import type { AnuncioNaLinha } from "@/lib/servidor/linha";
import type { Match } from "@/lib/tipos";
import { NotaDoProfissional } from "../../avaliacoes";
import { BotaoCurtir } from "../../botao-curtir";
import { SeloMatch } from "../../match-vaga";
import { SeloVerificado } from "../../selo-verificado";
import { Avatar } from "../../ui/basicos";

/**
 * Os objetos da linha do tempo: cada tipo tem a sua forma, para dar para saber o que é antes de
 * ler. Vaga = tíquete (o valor e o Curtir no canhoto); serviço = o cartão do profissional; aceite =
 * o cartão verde. A hora fica fora (na coluna da linha); no celular, no canto de cada um (`hora`).
 */

const POR_UNIDADE: Record<string, string> = {
  hora: "por hora",
  dia: "a diária",
  semana: "por semana",
  mes: "por mês",
  m2: "por m²",
  visita: "a visita",
  servico: "pelo serviço",
};

/** O valor grande e o que ele quer dizer, em duas partes ("R$ 1.800" e "por mês"). */
function valorEmDuas(a: AnuncioNaLinha["anuncio"]) {
  if (a.pagamento_valor == null || !a.pagamento_unidade) return { valor: "A combinar", unidade: null };
  const ate = a.pagamento_ate != null && a.pagamento_ate > a.pagamento_valor ? a.pagamento_ate : null;
  // no serviço, "a partir de" já diz tudo quando o valor é pelo serviço
  const unidade =
    a.tipo === "servico" && a.pagamento_unidade === "servico" ? null : (POR_UNIDADE[a.pagamento_unidade] ?? null);
  return {
    valor: formatarMoeda(a.pagamento_valor),
    unidade: [a.tipo === "servico" ? "a partir de" : null, ate ? `até ${formatarMoeda(ate)}` : null, unidade]
      .filter(Boolean)
      .join(" · "),
  };
}

const BENEFICIO_CURTO: Record<string, string> = { vale_transporte: "VT", vale_refeicao: "VR", vale_alimentacao: "VA" };

/** A hora no canto do objeto (só no celular: no computador ela fica na coluna da linha). */
function HoraNoCanto({ hora, claro = false }: { hora: string; claro?: boolean }) {
  return (
    <span
      className={`shrink-0 pt-0.5 text-body-sm font-semibold tabular-nums sm:hidden ${
        claro ? "text-on-cerrado/80" : "text-ink-muted"
      }`}
    >
      {hora}
    </span>
  );
}

function Lugar({ item, tempoDe }: { item: AnuncioNaLinha; tempoDe: "casa" | "voce" | null }) {
  const a = item.anuncio;
  const distancia = formatarDistancia(a.distancia_km);
  const tempo = tempoDe && a.tipo === "vaga" ? deslocamentoCurto(a.distancia_km) : null;
  return (
    <p className="mt-1.5 flex flex-wrap gap-x-3.5 gap-y-1 text-body-sm text-ink-muted">
      <span className="inline-flex items-center gap-1">
        <MapPin aria-hidden className="size-4 shrink-0 text-terra-text" />
        {formatarLugar(a.bairro, a.cidade)}
        {distancia && `, ${distancia}`}
      </span>
      {tempo && (
        <span className="inline-flex items-center gap-1">
          {tempo.includes("a pé") ? (
            <Footprints aria-hidden className="size-4 shrink-0" />
          ) : (
            <Bus aria-hidden className="size-4 shrink-0" />
          )}
          {tempo}
        </span>
      )}
    </p>
  );
}

/** O tíquete da vaga. */
export function TicketDaVaga({
  item,
  hora,
  usuarioId,
  tempoDe,
}: {
  item: AnuncioNaLinha;
  hora: string;
  usuarioId: string | null;
  tempoDe: "casa" | "voce" | null;
}) {
  const a = item.anuncio;
  const proprio = usuarioId !== null && usuarioId === a.autor_id;
  const preenchida = Boolean(item.requisitos?.preenchida_em);
  const modalidade = a.regime === "outro" ? null : rotuloModalidade(a.tipo, a.regime);
  const beneficios = (item.requisitos?.beneficios_lista ?? []).slice(0, 2);
  const match = item.match && (item.match.nota ?? 0) > 0 && a.minha_curtida !== "match" ? item.match : null;
  const { valor, unidade } = valorEmDuas(a);
  const etiquetas: ReactNode[] = [];
  if (modalidade) etiquetas.push(<li key="m">{modalidade}</li>);
  for (const b of beneficios) etiquetas.push(<li key={b}>{BENEFICIO_CURTO[b] ?? nomeBeneficio(b) ?? b}</li>);
  if (preenchida) etiquetas.push(<li key="p">Vaga preenchida</li>);

  return (
    <article
      id={`anuncio-${a.id}`}
      className="tiquete grid min-w-0 grid-rows-[auto_var(--canhoto)] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus sm:grid-cols-[minmax(0,1fr)_var(--canhoto)] sm:grid-rows-1 sm:rounded-lg"
    >
      <span aria-hidden className="tiquete-fundo" />
      <span aria-hidden className="tiquete-picote" />
      <div className="flex min-w-0 gap-3 p-4 sm:gap-4 sm:p-5">
        <Avatar
          nome={a.autor_nome}
          foto={item.foto}
          tamanho={48}
          forma={a.autor_tipo === "pessoa" ? "redonda" : "quadrada"}
          colorida
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 font-display text-[19px] leading-6 font-bold tracking-[-0.01em] sm:text-[21px] sm:leading-[26px]">
              <Link href={`/anuncio/${a.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
                {a.titulo}
              </Link>
            </h3>
            <HoraNoCanto hora={hora} />
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-body font-medium">
            <span className="truncate">{a.autor_nome}</span>
            {a.autor_verificado && <SeloVerificado agencia={a.autor_tipo === "agencia"} />}
            {a.autor_tipo === "agencia" && (
              // a agência contrata para outra empresa: quem procura precisa saber
              <>
                <span aria-hidden className="text-ink-muted">
                  ·
                </span>
                <span className="shrink-0 text-body-sm text-ink-muted">Agência</span>
              </>
            )}
          </p>
          <Lugar item={item} tempoDe={tempoDe} />
          {(etiquetas.length > 0 || match) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {match && <SeloMatch match={match} />}
              <ul className="contents [&>li]:rounded-pill [&>li]:bg-surface-300 [&>li]:px-2.5 [&>li]:py-0.5 [&>li]:text-[13px] [&>li]:leading-[18px] [&>li]:font-semibold">
                {etiquetas}
              </ul>
            </div>
          )}
        </div>
      </div>
      {/* o canhoto: o valor e o Curtir */}
      <div className="flex items-center justify-between gap-3 px-4 sm:flex-col sm:items-stretch sm:justify-between sm:p-5 sm:pl-6">
        <p className="flex items-baseline gap-1.5 sm:flex-col sm:gap-0.5">
          <span className="font-display text-[22px] leading-6 font-extrabold tracking-[-0.02em] tabular-nums sm:text-[26px] sm:leading-[30px]">
            {valor}
          </span>
          {unidade && <span className="text-body-sm text-ink-muted">{unidade}</span>}
        </p>
        {proprio ? (
          <Link
            href={`/painel/anuncio/${a.id}`}
            className="relative z-10 inline-flex min-h-10 items-center justify-center rounded-pill border border-line-strong px-4 text-label hover:bg-surface-300"
          >
            Seu anúncio
          </Link>
        ) : preenchida && a.minha_curtida !== "match" ? (
          <span className="text-label text-ink-muted">Preenchida</span>
        ) : (
          <span className="relative z-10 flex items-center gap-2 sm:flex-col sm:items-stretch">
            <BotaoCurtir
              className="[&>button]:whitespace-nowrap sm:[&>button]:w-full sm:[&>button]:justify-center"
              anuncioId={a.id}
              status={a.minha_curtida}
              logado={usuarioId !== null}
              quem={a.autor_nome}
            />
          </span>
        )}
      </div>
    </article>
  );
}

/** O cartão do profissional (serviço). */
export function CartaoDoServico({
  item,
  hora,
  usuarioId,
}: {
  item: AnuncioNaLinha;
  hora: string;
  usuarioId: string | null;
}) {
  const a = item.anuncio;
  const proprio = usuarioId !== null && usuarioId === a.autor_id;
  const foto = urlDaFotoTrabalho(a.foto);
  const { valor, unidade } = valorEmDuas(a);
  return (
    <article
      id={`anuncio-${a.id}`}
      className="relative grid min-w-0 grid-cols-[48px_minmax(0,1fr)] gap-3 rounded-lg border border-line bg-surface-200 p-4 shadow-card has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus sm:grid-cols-[56px_minmax(0,1fr)_auto] sm:gap-4 sm:p-5"
    >
      <Avatar nome={a.autor_nome} foto={item.foto} tamanho={56} className="max-sm:size-12" />
      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 font-display text-[19px] leading-6 font-bold tracking-[-0.01em] sm:text-[20px] sm:leading-[25px]">
            <Link href={`/anuncio/${a.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
              {a.titulo}
            </Link>
          </h3>
          <HoraNoCanto hora={hora} />
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-body font-medium">
          {a.autor_nome}
          <NotaDoProfissional media={a.autor_nota} total={a.autor_avaliacoes} compacto />
        </p>
        <Lugar item={item} tempoDe={null} />
      </div>
      <div className="col-span-2 flex items-center justify-between gap-3 border-t border-line pt-3 sm:col-span-1 sm:flex-col sm:items-end sm:border-0 sm:pt-0 sm:text-right">
        <p className="flex items-baseline gap-1.5 sm:flex-col sm:items-end sm:gap-0.5">
          <span className="font-display text-[20px] leading-6 font-extrabold tracking-[-0.02em] tabular-nums sm:text-[22px] sm:leading-[26px]">
            {valor}
          </span>
          {unidade && <span className="text-body-sm text-ink-muted">{unidade}</span>}
        </p>
        {foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" className="hidden size-16 rounded-md object-cover sm:block" />
        )}
        {!proprio && (
          <BotaoCurtir
            className="relative z-10"
            anuncioId={a.id}
            status={a.minha_curtida}
            logado={usuarioId !== null}
            servico
            quem={a.autor_nome}
          />
        )}
      </div>
    </article>
  );
}

/** O cartão verde: o outro lado aceitou a curtida (ou o pedido de serviço) da pessoa. */
export function CartaoDoAceite({ m, hora }: { m: Match; hora: string }) {
  const servico = m.anuncio_tipo === "servico";
  return (
    <article className="flex flex-col gap-1 rounded-lg bg-cerrado px-5 py-4 text-on-cerrado sm:px-6 sm:py-5">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-display text-[19px] leading-6 font-bold tracking-[-0.01em] sm:text-[21px] sm:leading-[26px]">
          {m.outro_nome} aceitou {servico ? "seu pedido" : "sua curtida"}
        </h3>
        <HoraNoCanto hora={hora} claro />
      </div>
      <p className="text-body text-on-cerrado/90">
        Vocês estão conectados {servico ? "pelo serviço" : "pela vaga"} de{" "}
        <Link href={`/anuncio/${m.anuncio_id}`} className="font-semibold underline underline-offset-2">
          {m.anuncio_titulo}
        </Link>
        . {servico ? "Combinem o serviço." : "Combine a entrevista."}
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {m.outro_whatsapp && (
          <a
            href={linkWhatsApp(m.outro_whatsapp, `Oi! Vi no Publike que deu match em "${m.anuncio_titulo}".`)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 items-center gap-2 rounded-md bg-surface-200 px-4 text-label font-bold text-cerrado-text"
          >
            <MessageCircle aria-hidden className="size-4" />
            Chamar no WhatsApp
          </a>
        )}
        <Link
          href={caminhoConversa(m.outro_id)}
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-on-cerrado/55 px-4 text-label"
        >
          <MessagesSquare aria-hidden className="size-4" />
          Conversar no Publike
        </Link>
      </div>
    </article>
  );
}

/** O ícone do nó do aceite, no traço da linha. */
export const IconeAceite = CircleCheck;
