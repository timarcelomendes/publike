"use client";

import {
  Banknote,
  Briefcase,
  Building2,
  CalendarClock,
  Clock,
  Coins,
  ExternalLink,
  Gift,
  ListChecks,
  MapPin,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { DetalheDaLista } from "@/lib/detalhe-da-lista";
import { SeloVerificado } from "../selo-verificado";
import { Esqueleto, Selo } from "../ui/basicos";
import { BotaoLink } from "../ui/botao";

const DA_VAGA = /^\/anuncio\/([^/]+)$/;

/**
 * Lista + detalhes (na vitrine, no computador): a lista à esquerda e, à direita, o anúncio escolhido,
 * sem sair da página. Tocar num cartão abre o anúncio ao lado (com Ctrl ou ⌘, abre a página dele, como
 * antes). Começa pelo primeiro da lista.
 */
export function ListaComDetalhe({ children }: { children: ReactNode }) {
  const lista = useRef<HTMLDivElement>(null);
  const [escolhido, setEscolhido] = useState<string | null>(null);

  // o primeiro da lista, e de novo quando a lista muda (outra busca, outra página) e o escolhido saiu dela
  useEffect(() => {
    const el = lista.current;
    if (!el) return;
    const conferir = () => {
      if (escolhido && el.querySelector(`#anuncio-${CSS.escape(escolhido)}`)) return;
      const primeiro = el.querySelector<HTMLElement>('article[id^="anuncio-"]');
      const id = primeiro?.id.slice("anuncio-".length) ?? null;
      if (id !== escolhido) setEscolhido(id);
    };
    conferir();
    const olhar = new MutationObserver(conferir);
    olhar.observe(el, { childList: true, subtree: true });
    return () => olhar.disconnect();
  }, [escolhido]);

  function aoTocar(e: MouseEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    const id = new URL(link.href, window.location.href).pathname.match(DA_VAGA)?.[1];
    if (!id || link.closest('[data-detalhe="fora"]')) return;
    e.preventDefault();
    setEscolhido(id);
  }

  return (
    <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-6">
      {/* o cartão aberto, marcado na lista */}
      {escolhido && (
        <style>{`#anuncio-${CSS.escape(escolhido)}{border-color:var(--color-terra);box-shadow:0 0 0 1px var(--color-terra)}`}</style>
      )}
      <div ref={lista} onClickCapture={aoTocar} className="min-w-0">
        {children}
      </div>
      <section
        aria-label="Anúncio aberto"
        aria-live="polite"
        className="sticky top-20 max-h-[calc(100dvh-6rem)] min-w-0 overflow-y-auto overscroll-contain rounded-lg border border-line bg-surface-200 shadow-card"
      >
        {escolhido ? (
          <DetalheDoAnuncio key={escolhido} id={escolhido} />
        ) : (
          <p className="p-6 text-body-sm text-ink-muted">Escolha um anúncio na lista para ver aqui.</p>
        )}
      </section>
    </div>
  );
}

// os já abertos nesta visita (voltar a um não busca de novo)
const abertos = new Map<string, DetalheDaLista>();

function DetalheDoAnuncio({ id }: { id: string }) {
  const [detalhe, setDetalhe] = useState<DetalheDaLista | null>(abertos.get(id) ?? null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (abertos.has(id)) return;
    const parar = new AbortController();
    fetch(`/api/vaga/${id}`, { signal: parar.signal })
      .then(async (r) => {
        const corpo = (await r.json().catch(() => null)) as { ok: boolean; detalhe?: DetalheDaLista; erro?: string } | null;
        if (corpo?.ok && corpo.detalhe) {
          abertos.set(id, corpo.detalhe);
          setDetalhe(corpo.detalhe);
        } else setErro(corpo?.erro ?? "Não deu para abrir este anúncio agora.");
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setErro("Não deu para abrir este anúncio agora.");
      });
    return () => parar.abort();
  }, [id]);

  if (erro) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-body text-ink">{erro}</p>
        <Link href={`/anuncio/${id}`} className="text-label text-ink underline underline-offset-2 hover:text-terra-text">
          Abrir a página do anúncio
        </Link>
      </div>
    );
  }
  if (!detalhe) return <EsqueletoDoDetalhe />;

  const d = detalhe;
  return (
    <article className="flex flex-col gap-6 p-6 xl:p-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {d.selos.map((s, i) => (
            <Selo key={s} variante={i === 0 ? "neutro" : "contorno"}>
              {s}
            </Selo>
          ))}
          {d.preenchida && <Selo variante="aviso">Vaga preenchida</Selo>}
        </div>
        <h2 className="text-h2">{d.titulo}</h2>
        <p className="flex flex-wrap items-center gap-1 text-body text-ink-muted">
          <Link href={`/perfil/${d.autor.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">
            {d.autor.nome}
          </Link>
          · {d.autor.conta}
          {d.autor.verificado && <SeloVerificado agencia={d.autor.agencia} />}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          <BotaoLink href={`/anuncio/${d.id}`} variante="primario">
            {d.vaga ? "Ver a vaga e curtir" : "Ver o serviço"}
          </BotaoLink>
          <a
            href={`/anuncio/${d.id}`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-10 items-center gap-1.5 text-label text-ink underline-offset-2 hover:underline"
          >
            <ExternalLink aria-hidden className="size-4" />
            Abrir em outra aba
          </a>
        </div>
      </header>

      <dl className="grid gap-5 rounded-lg border border-line bg-surface-100 p-5 xl:grid-cols-2">
        <Fato icone={MapPin} rotulo={d.vaga ? "Onde é" : "Onde fica"}>
          {d.lugar}
          {d.lugarAproximado && <span className="block text-body-sm font-normal text-ink-muted">região aproximada</span>}
        </Fato>
        <Fato icone={Banknote} rotulo={d.vaga ? "Valor" : "Preço"}>
          {d.valor}
        </Fato>
        {/* os ganhos a mais lado a lado, na largura toda, logo abaixo do valor: um por linha dentro do valor, o
            quadro dele ficava comprido e o do lado, vazio */}
        {d.ganhos.length > 0 && (
          <Fato icone={Coins} rotulo="Ganhos a mais" largo>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {d.ganhos.map((g) => {
                // "Comissão: até 4%": o nome e, mais apagado, como funciona
                const [nome, ...resto] = g.split(": ");
                const detalhe = resto.join(": ");
                return (
                  <li key={g} className="rounded-pill bg-surface-300 px-2.5 py-0.5 text-body-sm font-normal">
                    {nome}
                    {detalhe && <span className="text-ink-muted">: {detalhe}</span>}
                  </li>
                );
              })}
            </ul>
          </Fato>
        )}
        {d.contratante && (
          <Fato icone={Building2} rotulo="Empresa contratante">
            {d.contratante}
          </Fato>
        )}
        {d.contratacao && (
          <Fato icone={Briefcase} rotulo="Contratação">
            {d.contratacao}
            {d.jornada && <span className="block text-body-sm font-normal text-ink-muted">{d.jornada}</span>}
          </Fato>
        )}
        {d.atende && (
          <Fato icone={Wrench} rotulo="Atende">
            {d.atende}
          </Fato>
        )}
        {d.horario && (
          <Fato icone={Clock} rotulo={d.vaga ? "Quando" : "Quando atende"}>
            {d.horario}
          </Fato>
        )}
        {d.beneficios.length > 0 && (
          <Fato icone={Gift} rotulo="Benefícios">
            {d.beneficios.join(", ")}
          </Fato>
        )}
        {d.requisitos.length > 0 && (
          <Fato icone={ListChecks} rotulo="Requisitos">
            {d.requisitos.join(" · ")}
          </Fato>
        )}
        {d.pessoas > 1 && (
          <Fato icone={Users} rotulo="Vagas">
            {d.pessoas} pessoas
          </Fato>
        )}
        <Fato icone={CalendarClock} rotulo="Publicado">
          {d.publicado}
          <span className="block text-body-sm font-normal text-ink-muted">{d.noAr}</span>
        </Fato>
      </dl>

      <section className="flex flex-col gap-3">
        <h3 className="text-h3">{d.vaga ? "Sobre a vaga" : "Sobre o serviço"}</h3>
        <div className="text-body whitespace-pre-line text-ink">{d.descricao}</div>
      </section>

      <div className="border-t border-line pt-5">
        <BotaoLink href={`/anuncio/${d.id}`} variante="secundario">
          {d.vaga ? "Ver a vaga completa" : "Ver o serviço completo"}
        </BotaoLink>
      </div>
    </article>
  );
}

/** Um par da lista de fatos. `largo`: nas duas colunas (os ganhos a mais, lado a lado). */
function Fato({
  icone: Icone,
  rotulo,
  largo = false,
  children,
}: {
  icone: LucideIcon;
  rotulo: string;
  largo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`relative min-h-10 pl-[52px] ${largo ? "xl:col-span-2" : ""}`}>
      <dt className="text-body-sm text-ink-muted">
        <span
          aria-hidden
          className="absolute top-0 left-0 flex size-10 items-center justify-center rounded-pill bg-surface-300 text-ink"
        >
          <Icone className="size-5" />
        </span>
        {rotulo}
      </dt>
      <dd className="text-label text-ink">{children}</dd>
    </div>
  );
}

function EsqueletoDoDetalhe() {
  return (
    <div className="flex flex-col gap-4 p-6 xl:p-8" aria-busy>
      <Esqueleto className="h-6 w-40" />
      <Esqueleto className="h-9 w-3/4" />
      <Esqueleto className="h-5 w-1/2" />
      <Esqueleto className="h-11 w-48" />
      <Esqueleto className="h-40 w-full" />
      <Esqueleto className="h-24 w-full" />
    </div>
  );
}
