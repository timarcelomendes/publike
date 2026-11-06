"use client";

import { HeartHandshake, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import {
  abrirConversaDoMatch,
  EVENTO_DEU_MATCH,
  marcarPerguntaDoMatchNaPagina,
  type PedidoDoMatch,
} from "@/lib/abrir-conversa";
import { marcarMatchPerguntado, matchParaPerguntar } from "@/lib/acoes/pergunta-do-match";
import { linkWhatsApp } from "@/lib/formato";
import { Botao } from "./ui/botao";

// onde a pergunta ao entrar não aparece: o admin, a entrada e as conversas (lá a pessoa já está conversando)
const SEM_PERGUNTA_AO_ENTRAR = [/^\/admin/, /^\/auth\//, /^\/entrar/, /^\/painel\/conversas/];

/**
 * Deu match com o WhatsApp de quem publicou liberado: "Quer falar agora com X?". Aparece na hora da curtida com
 * contato direto e, para os outros matches (o aceite com a pessoa fora do site, e os que já existiam), no primeiro
 * acesso depois deles: uma vez por match, um por acesso, o mais novo primeiro. O "Chamar no WhatsApp" é um link de
 * verdade (o toque abre o WhatsApp, no celular o app, com a mensagem pronta, também no iPhone) e conta em
 * Admin › Curtidas como toque da pessoa. Respondida a pergunta (ou fechada), a conversa abre no Chat.
 * Um só na página (no Chat do canto, para quem tem conta): a lista que recarrega embaixo não leva a pergunta junto.
 */
export function PerguntaDoMatch() {
  const router = useRouter();
  const id = useId();
  const janela = useRef<HTMLDialogElement>(null);
  const [pedido, setPedido] = useState<PedidoDoMatch | null>(null);

  const aoDarMatch = useEffectEvent((e: Event) => setPedido((e as CustomEvent<PedidoDoMatch>).detail));
  useEffect(() => {
    marcarPerguntaDoMatchNaPagina(true);
    const ouvir = (e: Event) => aoDarMatch(e);
    window.addEventListener(EVENTO_DEU_MATCH, ouvir);
    return () => {
      marcarPerguntaDoMatchNaPagina(false);
      window.removeEventListener(EVENTO_DEU_MATCH, ouvir);
    };
  }, []);

  // ao entrar (uma vez por carregamento do site): o match mais novo que ainda não teve a pergunta
  useEffect(() => {
    if (SEM_PERGUNTA_AO_ENTRAR.some((r) => r.test(window.location.pathname))) return;
    let vivo = true;
    // um respiro depois de a página abrir; outra janela aberta (as boas-vindas, instalar o app) fica para a próxima
    const espera = window.setTimeout(async () => {
      const achado = await matchParaPerguntar().catch(() => null);
      if (!vivo || !achado || document.querySelector("dialog[open]")) return;
      setPedido((atual) => atual ?? achado);
    }, 1500);
    return () => {
      vivo = false;
      window.clearTimeout(espera);
    };
  }, []);

  useEffect(() => {
    if (!pedido) return;
    if (!janela.current?.open) janela.current?.showModal();
    // a pergunta apareceu: não aparece de novo para este match (nem ao entrar)
    marcarMatchPerguntado(pedido.anuncioId).catch(() => {});
  }, [pedido]);

  // fechou (respondeu, "Agora não", Esc ou toque fora): a conversa abre no Chat
  function fechou() {
    const conversa = pedido?.conversa;
    setPedido(null);
    if (conversa) abrirConversaDoMatch(conversa, (caminho) => router.push(caminho));
  }

  function contarToque() {
    if (!pedido) return;
    const corpo = new Blob(
      [JSON.stringify({ anuncio: pedido.anuncioId, perfil: pedido.perfilId, canal: "whatsapp" })],
      { type: "application/json" },
    );
    try {
      if (!navigator.sendBeacon?.("/api/contato-candidato", corpo)) throw new Error("sem beacon");
    } catch {
      fetch("/api/contato-candidato", { method: "POST", body: corpo, keepalive: true }).catch(() => {});
    }
  }

  const nome = pedido?.conversa?.outroNome || "quem publicou";
  const [primeira, ...resto] = (pedido?.mensagem ?? "").split("\n");

  return (
    <dialog
      ref={janela}
      aria-labelledby={`${id}-titulo`}
      aria-describedby={`${id}-texto`}
      onClose={fechou}
      onClick={(e) => {
        // toque fora do quadro: "agora não"
        if (e.target === e.currentTarget) janela.current?.close();
      }}
      className="m-0 mt-auto w-full max-w-none rounded-t-lg border border-line-strong bg-surface-200 p-0 text-ink shadow-raised backdrop:bg-veu sm:m-auto sm:max-w-md sm:rounded-lg"
    >
      {pedido?.whatsapp && (
        <div className="flex flex-col gap-5 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-7">
          <div className="flex flex-col gap-3">
            <span
              aria-hidden
              className="flex size-12 items-center justify-center rounded-pill bg-cerrado text-on-cerrado"
            >
              <HeartHandshake className="size-6" />
            </span>
            <h2 id={`${id}-titulo`} className="text-h2 text-balance">
              Deu match! Quer falar agora com {nome}?
            </h2>
            <p id={`${id}-texto`} className="text-body text-ink-muted">
              {pedido.direto === false
                ? // o match veio do aceite (a pergunta ao entrar)
                  `${pedido.conversa?.outroNome || "Quem publicou"} aceitou ${pedido.servico ? "o seu pedido" : "a sua candidatura"}${pedido.conversa?.titulo ? ` em “${pedido.conversa.titulo}”` : ""}.`
                : `${pedido.conversa?.outroNome || "Quem publicou"} libera o WhatsApp para quem se ${pedido.servico ? "interessa" : "candidata"}.`}{" "}
              A mensagem já vai pronta
              {resto.length ? `, com o link ${pedido.servico ? "do anúncio" : "da vaga"}` : ""}. Dá para mudar antes de
              enviar.
            </p>
          </div>
          {primeira && <p className="rounded-md bg-surface-300 p-3 text-body-sm italic">“{primeira}”</p>}
          <div className="flex flex-col gap-3">
            <a
              href={linkWhatsApp(pedido.whatsapp, pedido.mensagem)}
              target="_blank"
              rel="noopener noreferrer"
              autoFocus
              onClick={() => {
                contarToque();
                // fecha depois do clique: o link abre o WhatsApp antes
                window.setTimeout(() => janela.current?.close(), 0);
              }}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-pill bg-cerrado px-5 text-label text-on-cerrado hover:brightness-110"
            >
              <MessageCircle aria-hidden className="size-5" />
              Chamar no WhatsApp
            </a>
            <Botao variante="fantasma" onClick={() => janela.current?.close()} className="w-full">
              Agora não
            </Botao>
          </div>
        </div>
      )}
    </dialog>
  );
}
