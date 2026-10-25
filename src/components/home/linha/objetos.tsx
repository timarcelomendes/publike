import {
  ArrowRight,
  Bus,
  CircleCheck,
  Footprints,
  Heart,
  MapPin,
  MessageCircle,
  MessagesSquare,
  Zap,
} from "lucide-react";
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
import { linkDoMatch, mensagemComLink } from "@/lib/link-do-match";
import { TEMAS_NOTICIA, type Noticia } from "@/lib/noticias";
import type { AnuncioNaLinha } from "@/lib/servidor/linha";
import type { Match } from "@/lib/tipos";
import { NotaDoProfissional } from "../../avaliacoes";
import { BotaoCurtir } from "../../botao-curtir";
import { CapaNoticia } from "../../noticias/capa";
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
  if (a.pagamento_valor == null || !a.pagamento_unidade) return { valor: "A combinar", unidade: null, partes: [] };
  const ate = a.pagamento_ate != null && a.pagamento_ate > a.pagamento_valor ? a.pagamento_ate : null;
  // no serviço, "a partir de" já diz tudo quando o valor é pelo serviço
  const unidade =
    a.tipo === "servico" && a.pagamento_unidade === "servico" ? null : (POR_UNIDADE[a.pagamento_unidade] ?? null);
  const partes = [
    a.tipo === "servico" ? "a partir de" : null,
    ate ? `até ${formatarMoeda(ate)}` : null,
    unidade,
  ].filter((p): p is string => Boolean(p));
  return { valor: formatarMoeda(a.pagamento_valor), unidade: partes.join(" · "), partes };
}

/**
 * O valor no canhoto: em Bricolage 800 e, embaixo, o que ele quer dizer ("a partir de", "até R$ 2.100",
 * "por mês"). No celular, numa linha só; no computador, uma parte embaixo da outra (não quebra no meio).
 */
function Valor({ a }: { a: AnuncioNaLinha["anuncio"] }) {
  const { valor, partes } = valorEmDuas(a);
  return (
    <p className="flex items-baseline gap-1.5 sm:flex-col sm:gap-0">
      <span
        className={`font-display font-extrabold tracking-[-0.02em] whitespace-nowrap tabular-nums ${
          partes.length
            ? "text-[20px] leading-6 sm:text-[22px] sm:leading-[26px]"
            : "text-[17px] leading-6 sm:text-[18px]"
        }`}
      >
        {valor}
      </span>
      {partes.length > 0 && (
        <span className="text-body-sm text-ink-muted sm:leading-[18px]">
          {partes.map((p, i) => (
            <span key={p} className="sm:block">
              {i > 0 && <span className="sm:hidden"> · </span>}
              {p}
            </span>
          ))}
        </span>
      )}
    </p>
  );
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

/** O lugar (e o tempo de ônibus) numa linha, com as etiquetas (`children`) logo depois. */
function Lugar({
  item,
  tempoDe,
  children,
}: {
  item: AnuncioNaLinha;
  tempoDe: "casa" | "voce" | null;
  children?: ReactNode;
}) {
  const a = item.anuncio;
  const distancia = formatarDistancia(a.distancia_km);
  const tempo = tempoDe && a.tipo === "vaga" ? deslocamentoCurto(a.distancia_km) : null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-body-sm text-ink-muted">
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
      {children}
    </div>
  );
}

/** O começo da descrição: a introdução do anúncio, em até 2 linhas. */
function Resumo({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return <p className="mt-1 line-clamp-2 text-body-sm text-ink/80">{texto}</p>;
}

/** O tíquete da vaga (fundo no tom de vaga). */
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
  // as etiquetas numa linha só: a modalidade, o primeiro benefício e "+N" com o resto (a vaga mostra todos)
  const todosBeneficios = item.requisitos?.beneficios_lista ?? [];
  const direto = Boolean(item.requisitos?.contato_direto) && !preenchida && !proprio;
  // com o "Contato direto", os benefícios ficam todos no "+N" (cabe numa linha)
  const beneficios = todosBeneficios.slice(0, direto ? 0 : 1);
  const outros = todosBeneficios.length - beneficios.length;
  const match = item.match && (item.match.nota ?? 0) > 0 && a.minha_curtida !== "match" ? item.match : null;
  const etiquetas: ReactNode[] = [];
  if (modalidade) etiquetas.push(<li key="m">{modalidade}</li>);
  // quem curte já vê o WhatsApp: a etiqueta vem logo depois da contratação
  if (direto)
    etiquetas.push(
      <li key="d" className="inline-flex items-center gap-1 text-cerrado-text">
        <Zap aria-hidden className="size-3.5" />
        Contato direto
      </li>,
    );
  for (const b of beneficios) etiquetas.push(<li key={b}>{BENEFICIO_CURTO[b] ?? nomeBeneficio(b) ?? b}</li>);
  if (outros > 0) {
    // o "+N" mostra quais são ao passar o mouse ou tocar (fica por cima do link do cartão)
    const nomes = todosBeneficios.slice(beneficios.length).map((x) => nomeBeneficio(x) ?? x);
    etiquetas.push(
      <li key="mais" className="group/mais relative z-10">
        <span
          tabIndex={0}
          className="cursor-help rounded-pill outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          +{outros}
          <span className="sr-only">
            {" "}
            {outros === 1 ? "benefício" : "benefícios"}: {nomes.join(", ")}
          </span>
        </span>
        <span
          aria-hidden
          className="pointer-events-none absolute right-0 bottom-full mb-1.5 hidden w-max max-w-56 rounded-md bg-ink px-2.5 py-1.5 text-[12px] leading-4 font-semibold whitespace-normal text-surface-100 shadow-raised group-focus-within/mais:block group-hover/mais:block"
        >
          {nomes.join(", ")}
        </span>
      </li>,
    );
  }
  if (preenchida) etiquetas.push(<li key="p">Vaga preenchida</li>);

  return (
    <article
      id={`anuncio-${a.id}`}
      className="tiquete grid min-w-0 grid-rows-[auto_var(--canhoto)] [--tom:var(--pk-tom-vaga)] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus sm:grid-cols-[minmax(0,1fr)_var(--canhoto)] sm:grid-rows-1 sm:rounded-lg"
    >
      <span aria-hidden className="tiquete-fundo" />
      <span aria-hidden className="tiquete-picote" />
      <div className="flex min-w-0 gap-3 p-3.5 sm:px-4 sm:py-3.5">
        <Avatar
          nome={a.autor_nome}
          foto={item.foto}
          tamanho={40}
          forma={a.autor_tipo === "pessoa" ? "redonda" : "quadrada"}
          colorida
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 font-display text-[17px] leading-[22px] font-bold tracking-[-0.01em] sm:text-[19px] sm:leading-6">
              <Link href={`/anuncio/${a.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
                {a.titulo}
              </Link>
            </h3>
            <HoraNoCanto hora={hora} />
          </div>
          <p className="flex items-center gap-1 text-body-sm font-semibold">
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
          <Resumo texto={item.resumo} />
          <Lugar item={item} tempoDe={tempoDe}>
            {(etiquetas.length > 0 || match) && (
              <span className="flex flex-wrap items-center gap-1.5 text-ink [&_li]:whitespace-nowrap">
                {match && <SeloMatch match={match} />}
                <ul className="contents [&>li]:rounded-pill [&>li]:bg-surface-100 [&>li]:px-2.5 [&>li]:py-0.5 [&>li]:text-[13px] [&>li]:leading-[18px] [&>li]:font-semibold">
                  {etiquetas}
                </ul>
              </span>
            )}
          </Lugar>
        </div>
      </div>
      {/* o canhoto: o valor e o Curtir */}
      <div className="flex items-center justify-between gap-3 px-3.5 sm:flex-col sm:items-stretch sm:justify-center sm:gap-2.5 sm:p-3.5 sm:pl-5">
        <Valor a={a} />
        {proprio ? (
          <Link
            href={`/painel/anuncio/${a.id}`}
            className="relative z-10 inline-flex min-h-9 items-center justify-center rounded-pill border border-line-strong px-3 text-label whitespace-nowrap hover:bg-surface-300"
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

/**
 * Em cima da vaga que as pessoas estão curtindo: quantas já curtiram (nunca quem) e o convite para
 * curtir também. Quem já curtiu se vê no número; quem publicou vê o atalho para os candidatos.
 */
export function FaixaDeCurtidas({ item, usuarioId }: { item: AnuncioNaLinha; usuarioId: string | null }) {
  const c = item.curtidas;
  if (!c) return null;
  const a = item.anuncio;
  const proprio = usuarioId !== null && usuarioId === a.autor_id;
  const curti = a.minha_curtida != null;
  return (
    // o coração fica ao lado da primeira linha do texto, mesmo quando ele quebra
    <p className="flex items-start gap-1.5 px-1 text-body-sm text-ink">
      <Heart aria-hidden className="mt-0.5 size-4 shrink-0 fill-like text-like" />
      {proprio ? (
        <span className="min-w-0">
          Sua vaga já tem <b className="font-semibold tabular-nums">{c.total} curtidas</b>.{" "}
          <Link
            href={`/painel/anuncio/${a.id}`}
            className="font-semibold whitespace-nowrap text-ink underline underline-offset-2 hover:text-terra-text"
          >
            Ver quem curtiu
          </Link>
        </span>
      ) : curti ? (
        <span className="min-w-0">
          <b className="font-semibold">Você e mais {c.total - 1} pessoas</b> curtiram esta vaga
        </span>
      ) : (
        <span className="min-w-0">
          <b className="font-semibold tabular-nums">{c.total} pessoas</b> já curtiram esta vaga.{" "}
          <span className="text-ink-muted">Curta também, se ela combina com você.</span>
        </span>
      )}
    </p>
  );
}

/**
 * O tíquete do profissional (serviço): o mesmo da vaga ("todo trabalho conta"), com o canhoto no tom de
 * serviço. A foto de um trabalho, se tiver, fica ao lado do texto (no computador).
 */
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
  return (
    <article
      id={`anuncio-${a.id}`}
      className="tiquete grid min-w-0 grid-rows-[auto_var(--canhoto)] [--tom:var(--pk-tom-servico)] has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus sm:grid-cols-[minmax(0,1fr)_var(--canhoto)] sm:grid-rows-1 sm:rounded-lg"
    >
      <span aria-hidden className="tiquete-fundo" />
      <span aria-hidden className="tiquete-picote" />
      <div className="flex min-w-0 gap-3 p-3.5 sm:px-4 sm:py-3.5">
        <Avatar
          nome={a.autor_nome}
          foto={item.foto}
          tamanho={40}
          forma={a.autor_tipo === "pessoa" ? "redonda" : "quadrada"}
          colorida
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 font-display text-[17px] leading-[22px] font-bold tracking-[-0.01em] sm:text-[19px] sm:leading-6">
              <Link href={`/anuncio/${a.id}`} className="outline-none after:absolute after:inset-0 after:content-['']">
                {a.titulo}
              </Link>
            </h3>
            <HoraNoCanto hora={hora} />
          </div>
          <p className="flex flex-wrap items-center gap-x-1.5 text-body-sm font-semibold">
            {a.autor_nome}
            <NotaDoProfissional media={a.autor_nota} total={a.autor_avaliacoes} compacto />
          </p>
          <Resumo texto={item.resumo} />
          <Lugar item={item} tempoDe={null} />
        </div>
        {foto && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={foto} alt="" className="hidden size-14 shrink-0 self-center rounded-md object-cover sm:block" />
        )}
      </div>
      {/* o canhoto: o valor e o Contratar */}
      <div className="flex items-center justify-between gap-3 px-3.5 sm:flex-col sm:items-stretch sm:justify-center sm:gap-2.5 sm:p-3.5 sm:pl-5">
        <Valor a={a} />
        {proprio ? (
          <Link
            href={`/painel/anuncio/${a.id}`}
            className="relative z-10 inline-flex min-h-9 items-center justify-center rounded-pill border border-line-strong px-3 text-label whitespace-nowrap hover:bg-surface-300"
          >
            Seu anúncio
          </Link>
        ) : (
          <span className="relative z-10 flex items-center gap-2 sm:flex-col sm:items-stretch">
            <BotaoCurtir
              className="[&>button]:whitespace-nowrap sm:[&>button]:w-full sm:[&>button]:justify-center"
              anuncioId={a.id}
              status={a.minha_curtida}
              logado={usuarioId !== null}
              servico
              quem={a.autor_nome}
            />
          </span>
        )}
      </div>
    </article>
  );
}

/** O cartão verde: o outro lado aceitou a curtida (ou o pedido de serviço) da pessoa. */
export function CartaoDoAceite({
  m,
  hora,
  usuarioId,
  direto = false,
}: {
  m: Match;
  hora: string;
  /** quem curtiu (a ficha dela vai no link, para quem publicou) */
  usuarioId: string | null;
  /** contato direto: o match saiu na hora, sem aceite */
  direto?: boolean;
}) {
  const servico = m.anuncio_tipo === "servico";
  // o link da mensagem: o aceite (a ficha, para quem publicou) ou, no contato direto, o anúncio
  const link = linkDoMatch({
    anuncioId: m.anuncio_id,
    perfilId: usuarioId ?? "",
    para: "quem_publicou",
    direto,
    servico,
  });
  return (
    <article className="flex flex-col gap-1 rounded-[18px] bg-cerrado px-4 py-3.5 text-on-cerrado sm:px-5">
      <div className="flex items-start gap-2">
        <h3 className="min-w-0 flex-1 font-display text-[17px] leading-[22px] font-bold tracking-[-0.01em] sm:text-[19px] sm:leading-6">
          {direto
            ? `Deu match com ${m.outro_nome}`
            : `${m.outro_nome} aceitou ${servico ? "seu pedido" : "sua curtida"}`}
        </h3>
        <HoraNoCanto hora={hora} claro />
      </div>
      <p className="text-body-sm text-on-cerrado/90">
        Vocês estão conectados {servico ? "pelo serviço" : "pela vaga"} de{" "}
        <Link href={`/anuncio/${m.anuncio_id}`} className="font-semibold underline underline-offset-2">
          {m.anuncio_titulo}
        </Link>
        . {servico ? "Combinem o serviço." : "Combine a entrevista."}
      </p>
      {/* os dois lado a lado, do mesmo tamanho (no celular estreito também) */}
      <div className="mt-2 flex gap-2">
        {m.outro_whatsapp && (
          <a
            href={linkWhatsApp(
              m.outro_whatsapp,
              mensagemComLink(`Oi! Vi no Publike que deu match em “${m.anuncio_titulo}”.`, link),
            )}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-pill bg-surface-200 px-3 text-label font-bold whitespace-nowrap text-cerrado-text hover:bg-surface-100 sm:flex-none sm:px-4"
          >
            <MessageCircle aria-hidden className="size-4 shrink-0" />
            <span aria-hidden>WhatsApp</span>
            <span className="sr-only">Chamar no WhatsApp</span>
          </a>
        )}
        <Link
          href={caminhoConversa(m.outro_id)}
          className="inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-pill border border-on-cerrado/55 px-3 text-label whitespace-nowrap hover:bg-on-cerrado/10 sm:flex-none sm:px-4"
        >
          <MessagesSquare aria-hidden className="size-4 shrink-0" />
          <span aria-hidden>Conversar</span>
          <span className="sr-only">Conversar no Publike</span>
        </Link>
      </div>
    </article>
  );
}

/** O ícone do nó do aceite, no traço da linha. */
export const IconeAceite = CircleCheck;

/**
 * A notícia do Publike na linha do tempo: a capa (a foto ou o desenho do tema), o assunto, o título,
 * o resumo e o link para ler. Atualizada depois de publicada, ela sobe de novo com "Atualizada".
 */
export function CartaoDaNoticia({ n, atualizada, hora }: { n: Noticia; atualizada: boolean; hora: string }) {
  return (
    <article className="relative flex flex-col overflow-hidden rounded-[18px] sm:flex-row border border-line bg-surface-200 shadow-card transition-shadow hover:shadow-raised has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-focus">
      <CapaNoticia n={n} className="aspect-[2/1] w-full shrink-0 sm:aspect-auto sm:w-[148px] sm:self-stretch" />
      <div className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3.5 sm:px-5">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-body-sm text-ink-muted">
            <span className="font-semibold text-terra-text">Notícia</span>
            {" · "}
            {TEMAS_NOTICIA[n.tema]?.curto ?? n.tema}
            {n.cidade && ` · ${n.cidade}`}
            {atualizada && (
              <span className="ml-1.5 rounded-pill bg-ipe px-2 py-px text-caption font-semibold text-on-ipe">
                Atualizada
              </span>
            )}
          </p>
          <HoraNoCanto hora={hora} />
        </div>
        <h3 className="font-display text-[17px] leading-[22px] font-bold tracking-[-0.01em] sm:text-[19px] sm:leading-6">
          <Link href={`/noticias/${n.slug}`} className="outline-none after:absolute after:inset-0 after:content-['']">
            {n.titulo}
          </Link>
        </h3>
        <p className="line-clamp-2 text-body-sm text-ink-muted">{n.resumo}</p>
        <span className="mt-1 inline-flex items-center gap-1.5 text-label text-ink">
          Ler a notícia
          <ArrowRight aria-hidden className="size-4 text-terra-text" />
        </span>
      </div>
    </article>
  );
}
