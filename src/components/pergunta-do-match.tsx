"use client";

import { HeartHandshake, MessageCircle, MessagesSquare } from "lucide-react";
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
import { LINHA_DO_CURRICULO } from "@/lib/link-do-match";
import { PassoDoCurriculo } from "./curriculo/passo-do-curriculo";
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
  // a resposta da pergunta só pelo chat: "Abrir a conversa" abre o Chat; "Agora não" só fecha
  const abrirAoFechar = useRef(false);
  // tocou no "Chamar no WhatsApp" (sem o toque, fechar é o "agora não", que fica registrado)
  const tocouNoWhatsApp = useRef(false);
  // foi fazer o currículo: fechar não é o "agora não", e a conversa não abre por cima da página do currículo
  const foiAoCurriculo = useRef(false);

  // os matches desta visita que já tiveram a resposta da tela (a pergunta ao entrar não repete nenhum deles)
  const tratados = useRef(new Set<string>());
  const aoDarMatch = useEffectEvent((e: Event) => {
    const novo = (e as CustomEvent<PedidoDoMatch>).detail;
    tratados.current.add(novo.anuncioId);
    if (novo.whatsapp) {
      setPedido(novo);
      return;
    }
    // sem o WhatsApp (a vaga só pelo chat): a conversa abre direto, e o match fica como perguntado
    marcarMatchPerguntado(novo.anuncioId).catch(() => {});
    if (novo.conversa) abrirConversaDoMatch(novo.conversa, (caminho) => router.push(caminho));
  });
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
      if (!vivo || !achado || tratados.current.has(achado.anuncioId) || document.querySelector("dialog[open]")) return;
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

  // fechou (respondeu, "Agora não", Esc ou toque fora): a conversa abre no Chat, com as perguntas do match. Com o
  // WhatsApp, fechar sem tocar nele é o "agora não", que fica em Admin › Curtidas
  // (claude/plano-agora-nao-no-whatsapp.md).
  // Na vaga só pelo chat, a conversa abre só quando a pessoa pediu ("Abrir a conversa"); o "Agora não" fica valendo.
  function fechou() {
    const conversa = pedido?.conversa;
    const curriculo = foiAoCurriculo.current;
    const abrir = !curriculo && (pedido?.whatsapp ? true : abrirAoFechar.current);
    if (pedido?.whatsapp && !pedido.soChat && !tocouNoWhatsApp.current && !curriculo) contar("descartou");
    abrirAoFechar.current = false;
    tocouNoWhatsApp.current = false;
    foiAoCurriculo.current = false;
    setPedido(null);
    if (conversa && abrir) abrirConversaDoMatch(conversa, (caminho) => router.push(caminho));
  }

  // o toque no WhatsApp ou o "agora não", no histórico da candidatura (chega mesmo indo para outro app)
  function contar(canal: "whatsapp" | "descartou") {
    if (!pedido) return;
    const corpo = new Blob(
      [
        JSON.stringify({
          anuncio: pedido.anuncioId,
          perfil: pedido.perfilId,
          canal,
        }),
      ],
      { type: "application/json" },
    );
    try {
      if (!navigator.sendBeacon?.("/api/contato-candidato", corpo)) throw new Error("sem beacon");
    } catch {
      fetch("/api/contato-candidato", {
        method: "POST",
        body: corpo,
        keepalive: true,
      }).catch(() => {});
    }
  }

  const nome = pedido?.conversa?.outroNome || "quem publicou";
  const [primeira, ...resto] = (pedido?.mensagem ?? "").split("\n");
  // o link do currículo na mensagem (contato direto, com o currículo à mostra)
  const comCurriculo = resto.some((l) => l.startsWith(LINHA_DO_CURRICULO));
  // sem currículo, numa vaga: depois do WhatsApp (que vem primeiro), o convite para fazer
  const pedirCurriculo = Boolean(pedido?.semCurriculo && !pedido.servico);

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
      {pedido && (pedido.whatsapp || pedido.soChat) && (
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
                : pedido.soChat
                  ? `${pedido.conversa?.outroNome || "Quem publicou"} conversa com quem se ${pedido.servico ? "interessa" : "candidata"}${pedido.conversa?.titulo ? ` em “${pedido.conversa.titulo}”` : ""}.`
                  : `${pedido.conversa?.outroNome || "Quem publicou"} libera o WhatsApp para quem se ${pedido.servico ? "interessa" : "candidata"}.`}{" "}
              {pedido.soChat ? (
                "A conversa é pelo chat do Publike: mande uma mensagem e se apresente."
              ) : (
                <>
                  A mensagem já vai pronta
                  {resto.length
                    ? `, com o link ${pedido.servico ? "do anúncio" : "da vaga"}${comCurriculo ? " e o do seu currículo" : ""}`
                    : ""}
                  . Dá para mudar antes de enviar.
                </>
              )}
            </p>
          </div>
          {primeira && !pedido.soChat && (
            <p className="rounded-md bg-surface-300 p-3 text-body-sm italic">“{primeira}”</p>
          )}
          <div className="flex flex-col gap-3">
            {pedido.soChat || !pedido.whatsapp ? (
              // a vaga só pelo chat do Publike: abrir a conversa no Chat
              <button
                type="button"
                autoFocus
                onClick={() => {
                  abrirAoFechar.current = true;
                  janela.current?.close();
                }}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-pill bg-cerrado px-5 text-label text-on-cerrado hover:brightness-110"
              >
                <MessagesSquare aria-hidden className="size-5" />
                Abrir a conversa
              </button>
            ) : (
              <a
                href={linkWhatsApp(pedido.whatsapp, pedido.mensagem)}
                target="_blank"
                rel="noopener noreferrer"
                autoFocus
                onClick={() => {
                  tocouNoWhatsApp.current = true;
                  contar("whatsapp");
                  // fecha depois do clique: o link abre o WhatsApp antes
                  window.setTimeout(() => janela.current?.close(), 0);
                }}
                className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-pill bg-cerrado px-5 text-label text-on-cerrado hover:brightness-110"
              >
                <MessageCircle aria-hidden className="size-5" />
                Chamar no WhatsApp
              </a>
            )}
            {pedirCurriculo && (
              // o WhatsApp vem primeiro (o encontro não espera); o currículo, logo embaixo (claude/plano-mais-curriculos.md)
              <PassoDoCurriculo
                anuncioId={pedido.anuncioId}
                quem={pedido.conversa?.outroNome}
                // com o WhatsApp do contato direto, o link do currículo vai na mensagem; no resto, quem publicou vê no painel
                jeito={pedido.whatsapp && !pedido.soChat && pedido.direto !== false ? "match" : "quadro"}
                secundario
                aoIr={() => {
                  foiAoCurriculo.current = true;
                  janela.current?.close();
                }}
              />
            )}
            <Botao variante="fantasma" onClick={() => janela.current?.close()} className="w-full">
              Agora não
            </Botao>
          </div>
        </div>
      )}
    </dialog>
  );
}
