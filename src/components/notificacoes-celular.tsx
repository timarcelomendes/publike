"use client";

import { BellOff, BellRing, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { removerInscricaoPush, salvarInscricaoPush } from "@/lib/acoes/notificacoes-celular";
import { Botao } from "./ui/botao";

// "Ativar notificações": os avisos do sino também chegam no celular (Web Push), mesmo com o Publike
// fechado. Cada aparelho liga o seu. No iPhone só funciona com o Publike na Tela de Início.

type Estado = "carregando" | "sem-suporte" | "iphone" | "negado" | "ativo" | "inativo";

function chaveEmBytes(base64url: string) {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function nomeDoAparelho() {
  const ua = navigator.userAgent;
  const sistema = /iPhone|iPad/.test(ua)
    ? "iPhone"
    : /Android/.test(ua)
      ? "Android"
      : /Mac/.test(ua)
        ? "Mac"
        : /Windows/.test(ua)
          ? "Windows"
          : "Computador";
  const app = window.matchMedia("(display-mode: standalone)").matches ? "app" : "navegador";
  return `${sistema} (${app})`;
}

async function registro() {
  return navigator.serviceWorker.register("/sw.js");
}

/** Manda a inscrição para o servidor (ligar, ou manter em dia quando o navegador troca o endereço). */
async function guardar(inscricao: PushSubscription) {
  const json = inscricao.toJSON();
  return chamarAcao(() =>
    salvarInscricaoPush({
      endpoint: inscricao.endpoint,
      p256dh: json.keys?.p256dh ?? "",
      auth: json.keys?.auth ?? "",
      navegador: nomeDoAparelho(),
    }),
  );
}

export function AtivarNotificacoes({ vapid, jeito = "sino" }: { vapid: string; jeito?: "sino" | "cartao" }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const iphone = /iPhone|iPad/.test(navigator.userAgent);
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // no iPhone, a notificação só existe com o Publike na Tela de Início
        if (vivo) setEstado(iphone ? "iphone" : "sem-suporte");
        return;
      }
      if (Notification.permission === "denied") {
        if (vivo) setEstado("negado");
        return;
      }
      try {
        const reg = await registro();
        const atual = await reg.pushManager.getSubscription();
        if (atual && Notification.permission === "granted") {
          // mantém o servidor em dia (o navegador pode ter trocado o endereço), uma vez por visita
          if (!sessionStorage.getItem("publike_push_ok")) {
            const r = await guardar(atual);
            if (r.ok) sessionStorage.setItem("publike_push_ok", "1");
          }
          if (vivo) setEstado("ativo");
        } else if (vivo) setEstado("inativo");
      } catch {
        if (vivo) setEstado("inativo");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function ativar() {
    setOcupado(true);
    setAviso(null);
    try {
      const permissao = await Notification.requestPermission();
      if (permissao !== "granted") {
        setEstado(permissao === "denied" ? "negado" : "inativo");
        return;
      }
      const reg = await registro();
      await navigator.serviceWorker.ready;
      let inscricao = await reg.pushManager.getSubscription();
      // a chave do Publike mudou: a inscrição antiga não serve mais
      if (inscricao) {
        const chave = inscricao.options.applicationServerKey;
        const igual =
          chave &&
          btoa(String.fromCharCode(...new Uint8Array(chave))) === btoa(String.fromCharCode(...chaveEmBytes(vapid)));
        if (!igual) {
          await inscricao.unsubscribe().catch(() => undefined);
          inscricao = null;
        }
      }
      inscricao ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: chaveEmBytes(vapid),
      });
      const r = await guardar(inscricao);
      if (!r.ok) {
        setAviso({ ok: false, texto: r.erro });
        return;
      }
      sessionStorage.setItem("publike_push_ok", "1");
      setEstado("ativo");
      setAviso({ ok: true, texto: "Pronto: os avisos vão chegar neste aparelho." });
    } catch {
      setAviso({ ok: false, texto: "Este navegador não deixou ativar. Tente de novo ou use outro navegador." });
    } finally {
      setOcupado(false);
    }
  }

  async function desativar() {
    setOcupado(true);
    setAviso(null);
    try {
      const reg = await registro();
      const inscricao = await reg.pushManager.getSubscription();
      if (inscricao) {
        await chamarAcao(() => removerInscricaoPush(inscricao.endpoint));
        await inscricao.unsubscribe().catch(() => undefined);
      }
      sessionStorage.removeItem("publike_push_ok");
      setEstado("inativo");
    } finally {
      setOcupado(false);
    }
  }

  if (estado === "carregando" || estado === "sem-suporte") return null;
  // no sino, só aparece o que ainda dá para fazer (ligado, sem ruído)
  if (jeito === "sino" && estado === "ativo" && !aviso) return null;

  const texto = {
    iphone:
      "No iPhone, os avisos chegam com o Publike na Tela de Início: no Safari, toque em Compartilhar › Adicionar à Tela de Início e abra por lá.",
    negado:
      "As notificações do Publike estão bloqueadas neste navegador. Para receber, libere nas configurações do site (o cadeado ao lado do endereço).",
    ativo: "Os avisos do sino chegam neste aparelho, mesmo com o Publike fechado.",
    inativo:
      "Curtidas, matches, mensagens e respostas das suas candidaturas chegam no celular, mesmo com o Publike fechado.",
  }[estado];
  const Icone =
    estado === "ativo" ? BellRing : estado === "iphone" ? Smartphone : estado === "negado" ? BellOff : BellRing;

  const conteudo = (
    <>
      <Icone
        aria-hidden
        className={`mt-0.5 size-[18px] shrink-0 ${estado === "ativo" ? "text-cerrado-text" : "text-terra-text"}`}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-label">
          {estado === "ativo" ? "Notificações ligadas neste aparelho" : "Receber os avisos no celular"}
        </span>
        <span className="text-body-sm text-ink-muted">{texto}</span>
        {aviso && (
          <span role="status" className={`text-body-sm ${aviso.ok ? "text-cerrado-text" : "text-danger"}`}>
            {aviso.texto}
          </span>
        )}
        {estado === "inativo" && (
          <span>
            <Botao tamanho="sm" disabled={ocupado} onClick={ativar}>
              <BellRing aria-hidden />
              {ocupado ? "Ativando…" : "Ativar notificações"}
            </Botao>
          </span>
        )}
        {estado === "ativo" && jeito === "cartao" && (
          <span>
            <Botao tamanho="sm" variante="fantasma" disabled={ocupado} onClick={desativar}>
              <BellOff aria-hidden />
              Desligar neste aparelho
            </Botao>
          </span>
        )}
      </span>
    </>
  );

  return jeito === "sino" ? (
    <div className="mx-1 mb-2 flex gap-3 rounded-sm bg-surface-300 px-3 py-2.5">{conteudo}</div>
  ) : (
    <section
      aria-label="Notificações no celular"
      className="flex gap-3 rounded-lg border border-line bg-surface-200 p-5 shadow-card"
    >
      {conteudo}
    </section>
  );
}
