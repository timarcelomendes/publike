"use client";

import { Heart, MapPin, MessageCircle } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { Selo } from "./ui/basicos";

// Um anúncio de exemplo que mostra como o Publike funciona: quem procura
// curte, quem publicou curte de volta e dá match. Toca uma vez. Com
// "reduzir movimento" ligado, já começa no fim.

export type Etapa = "curtir" | "curtido" | "match";

/** Anda pelas etapas uma vez: logo ao abrir ou quando o elemento aparece na tela. */
export function useEtapasDemo(alvo?: RefObject<HTMLElement | null>) {
  const [etapa, setEtapa] = useState<Etapa>("curtir");

  useEffect(() => {
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tocar = () => {
      if (reduzir) {
        timers.push(setTimeout(() => setEtapa("match"), 0));
        return;
      }
      timers.push(setTimeout(() => setEtapa("curtido"), 1100));
      timers.push(setTimeout(() => setEtapa("match"), 2700));
    };

    const el = alvo?.current;
    if (!el || reduzir || !("IntersectionObserver" in window)) {
      tocar();
      return () => timers.forEach(clearTimeout);
    }
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return;
        observador.disconnect();
        tocar();
      },
      { threshold: 0.6 },
    );
    observador.observe(el);
    return () => {
      observador.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [alvo]);

  return etapa;
}

const BOTAO: Record<Etapa, string> = {
  curtir: "border-line-strong bg-surface-200 text-ink",
  curtido: "border-like-soft bg-like-soft text-like-text",
  match: "border-transparent bg-cerrado text-on-cerrado",
};

/** O cartão de exemplo (igual ao card de anúncio do site), sem nada clicável; `servico`: um serviço com preço. */
export function CartaoDemo({ etapa, servico = false }: { etapa: Etapa; servico?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none -rotate-2 select-none">
      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-raised">
        <div className="flex min-h-6 flex-wrap gap-2">
          <Selo variante="novo">Novo</Selo>
          <Selo>{servico ? "Serviço" : "Diária"}</Selo>
          {etapa === "match" && (
            <Selo variante="match" className="motion-safe:animate-[pk-surge_300ms_ease-out]">
              Deu match
            </Selo>
          )}
        </div>
        <div>
          <p className="font-display text-h3">
            {servico ? "Eletricista: instalação e reparo" : "Ajudante de cozinha no almoço"}
          </p>
          <p className="mt-0.5 text-body-sm text-ink-muted">
            {servico ? "Seu João · Pessoa" : "Restaurante · Comércio"}
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-body-sm text-ink-muted">
          <MapPin className="size-4 shrink-0 text-terra-text" fill="currentColor" stroke="var(--pk-surface-200)" />
          Setor Bueno, Goiânia · 2 km
        </p>
        <p className="text-label">{servico ? "A partir de R$ 80 a visita" : "R$ 120 por dia, com almoço"}</p>
        <div className="flex items-center justify-between gap-3 border-t border-line pt-3 text-body-sm text-ink-muted">
          <span>há 2 horas</span>
          <span
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-pill border px-3.5 text-label transition-colors duration-300 ${BOTAO[etapa]}`}
          >
            <Heart
              key={etapa}
              className={`size-4 motion-safe:animate-[pk-pulsa_350ms_ease-out] ${etapa === "curtido" ? "text-like" : ""}`}
              fill={etapa === "curtir" ? "none" : "currentColor"}
            />
            {etapa === "match"
              ? "Deu match"
              : etapa === "curtido"
                ? servico
                  ? "Pedido enviado"
                  : "Curtido"
                : servico
                  ? "Contratar"
                  : "Curtir"}
          </span>
        </div>
      </div>
    </div>
  );
}

type LadoDemo = "quem-faz" | "quem-publica" | "vitrine" | "pedido";

/** As legendas mudam conforme quem está entrando: quem procura trabalho, quem publica, quem mostra ou pede serviço. */
const LEGENDAS: Record<LadoDemo, Record<Etapa, string>> = {
  "quem-faz": {
    curtir: "Viu uma vaga que combina com você? Curta.",
    curtido: "Quem publicou vê seu perfil e pode curtir de volta.",
    match: "Deu match: o WhatsApp dos dois aparece.",
  },
  "quem-publica": {
    curtir: "Você publica a vaga ou mostra seus serviços.",
    curtido: "Quem tem interesse curte ou pede, e você vê o perfil da pessoa.",
    match: "Aceitou? Deu match: o WhatsApp dos dois aparece.",
  },
  vitrine: {
    curtir: "Você mostra seus serviços, com o preço e onde atende.",
    curtido: "Quem mora perto pede, e você vê o perfil da pessoa.",
    match: "Aceitou? Deu match: o WhatsApp dos dois aparece.",
  },
  pedido: {
    curtir: "Achou quem faz perto de você? Toque em Contratar.",
    curtido: "O profissional vê seu perfil e decide se aceita.",
    match: "Aceitou? Deu match: o WhatsApp dos dois aparece.",
  },
};

/** Tela de entrar: o cartão com uma legenda que acompanha cada etapa. */
export function DemoMatch({ lado = "quem-faz" }: { lado?: LadoDemo }) {
  const etapa = useEtapasDemo();
  return (
    <figure className="w-full max-w-sm">
      <CartaoDemo etapa={etapa} servico={lado === "vitrine" || lado === "pedido"} />
      <figcaption className="mt-6 flex min-h-12 items-start gap-2.5 text-body text-ink-muted">
        <MessageCircle
          aria-hidden
          className={`mt-0.5 size-5 shrink-0 transition-colors duration-300 ${etapa === "match" ? "text-cerrado-text" : ""}`}
        />
        <span aria-hidden>{LEGENDAS[lado][etapa]}</span>
        <span className="sr-only">
          Como funciona: quem procura curte o anúncio, quem publicou vê o perfil e curte de volta e, quando dá match, o
          WhatsApp dos dois aparece.
        </span>
      </figcaption>
    </figure>
  );
}
