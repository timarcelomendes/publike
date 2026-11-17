"use client";

import { LocateFixed, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarMeuBairro } from "@/lib/acoes/bairro";
import { buscarEnderecoDoPonto } from "@/lib/acoes/cep";
import {
  COOKIE_BAIRRO_ADIADO,
  COOKIE_BAIRRO_PERTO,
  COOKIE_CONVITE_LOCAL_ADIADO,
  COOKIE_PERMISSAO_LOCAL,
  TRINTA_DIAS_S,
  UM_DIA_S,
  type InicioDoConvite,
} from "@/lib/convite-local";
import { pertoGuardadoNoNavegador } from "@/lib/perto-guardado";
import { AVISOS_GPS, pedirPosicao } from "../explorar/barra-busca";

// O convite antes do pedido do navegador (16/11/2026): o navegador só pergunta depois que a pessoa toca em "Usar minha
// localização" (pedir logo na entrada leva ao "Bloquear", e aí o site não pode mais perguntar). "Agora não" cala o
// convite por 30 dias; com a permissão negada, ele nunca aparece. Com a localização liberada e o perfil de pessoa sem
// bairro, a pergunta "Você está no Setor Bueno. É onde você mora?": o sim grava só o nome do bairro no perfil.
//
// O que aparece vem do servidor, pelos cookies (`inicial`, src/lib/convite-local.ts, 17/11/2026): o navegador só
// tira o convite (a permissão mudou desde a última vez), nunca o põe sozinho no meio da página. A sugestão do bairro
// que o navegador descobre fica anotada para a próxima abertura; só aparece na hora depois de um toque da pessoa.

/** Os adiamentos de antes (só neste aparelho, até 17/11/2026): passam para o cookie, que o servidor lê. */
const ADIADO_ANTES = { convite: "publike_convite_local_ate", bairro: "publike_bairro_sugerido_ate" } as const;

function guardarCookie(nome: string, valor: string, segundos: number) {
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${nome}=${encodeURIComponent(valor)}; Max-Age=${segundos}; Path=/; SameSite=Lax${seguro}`;
}

function temCookie(nome: string) {
  return document.cookie.split("; ").some((c) => c.startsWith(`${nome}=`));
}

/** O adiamento antigo (localStorage) vira cookie pelo tempo que faltava; diz se ainda vale. */
function adiadoAntes(chave: string, cookie: string) {
  try {
    const ate = Number(localStorage.getItem(chave) ?? 0);
    if (!ate) return false;
    localStorage.removeItem(chave);
    const falta = Math.round((ate - Date.now()) / 1000);
    if (falta <= 0) return false;
    if (!temCookie(cookie)) guardarCookie(cookie, "1", falta);
    return true;
  } catch {
    return false;
  }
}

type Estado =
  | { tipo: "nada" }
  | { tipo: "convite"; erro: string | null }
  | { tipo: "bairro"; bairro: string }
  | { tipo: "pronto"; texto: string };

const NADA: Estado = { tipo: "nada" };

function doInicio(inicial: InicioDoConvite): Estado {
  return inicial.tipo === "convite" ? { tipo: "convite", erro: null } : inicial;
}

export function ConviteDaLocalizacao({
  pedirBairro = null,
  inicial,
}: {
  pedirBairro?: { cidade: string } | null;
  /** o que o servidor já pôs no HTML (LocalizacaoDaPagina) */
  inicial: InicioDoConvite;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>(() => doInicio(inicial));
  const [pendente, iniciar] = useTransition();

  /** Depois de um toque em "Usar minha localização": o bairro de lá, para perguntar se é onde a pessoa mora. */
  function sugerirBairro(ponto: { lat: number; lng: number }, depois: Estado) {
    if (!pedirBairro || temCookie(COOKIE_BAIRRO_ADIADO)) return setEstado(depois);
    buscarEnderecoDoPonto(ponto.lat, ponto.lng)
      .then((r) => {
        if (r.ok && r.endereco.bairro && r.endereco.cidade === pedirBairro.cidade) {
          setEstado({ tipo: "bairro", bairro: r.endereco.bairro.slice(0, 80) });
        } else {
          setEstado(depois);
        }
      })
      .catch(() => setEstado(depois));
  }

  useEffect(() => {
    const conviteAdiado = adiadoAntes(ADIADO_ANTES.convite, COOKIE_CONVITE_LOCAL_ADIADO);
    const bairroAdiado = adiadoAntes(ADIADO_ANTES.bairro, COOKIE_BAIRRO_ADIADO) || temCookie(COOKIE_BAIRRO_ADIADO);
    const tirarConvite = () => setEstado((e) => (e.tipo === "convite" ? NADA : e));
    if (conviteAdiado) tirarConvite();
    if (!("geolocation" in navigator)) {
      tirarConvite();
      return;
    }
    let ativo = true;
    const guardado = pertoGuardadoNoNavegador();
    /** O bairro de onde a pessoa está, anotado para a próxima abertura (agora, aparecer empurraria a página). */
    const anotarBairro = (ponto: { lat: number; lng: number }) => {
      if (!pedirBairro) return;
      buscarEnderecoDoPonto(ponto.lat, ponto.lng)
        .then((r) => {
          if (ativo && r.ok && r.endereco.bairro && r.endereco.cidade === pedirBairro.cidade) {
            guardarCookie(COOKIE_BAIRRO_PERTO, r.endereco.bairro.slice(0, 80), UM_DIA_S);
          }
        })
        .catch(() => {});
    };
    const decidir = (permissao: PermissionState | null) => {
      if (!ativo) return;
      if (permissao) guardarCookie(COOKIE_PERMISSAO_LOCAL, permissao, 12 * TRINTA_DIAS_S);
      // o convite do servidor sai se não vale mais: a posição já está guardada, ou a permissão já foi dada ou negada
      if (guardado || permissao === "granted" || permissao === "denied") tirarConvite();
      if (!pedirBairro || bairroAdiado || temCookie(COOKIE_BAIRRO_PERTO)) return;
      if (guardado) return anotarBairro(guardado);
      if (permissao === "granted") {
        // liberada, mas sem a posição guardada: lê agora (o navegador não pergunta nada)
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => ativo && anotarBairro({ lat: coords.latitude, lng: coords.longitude }),
          () => {},
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
        );
      }
    };
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((p) => decidir(p.state))
        .catch(() => decidir(null));
    } else {
      decidir(null);
    }
    return () => {
      ativo = false;
    };
    // só na chegada à página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function usar() {
    pedirPosicao(
      (ponto) => {
        guardarCookie(COOKIE_PERMISSAO_LOCAL, "granted", 12 * TRINTA_DIAS_S);
        router.refresh();
        sugerirBairro(ponto, { tipo: "pronto", texto: "Pronto: o Publike mostra primeiro o que está perto de você." });
      },
      (motivo) => setEstado({ tipo: "convite", erro: AVISOS_GPS[motivo] }),
    );
  }

  function adiar(cookie: string) {
    guardarCookie(cookie, "1", TRINTA_DIAS_S);
    setEstado(NADA);
  }

  function confirmarBairro(bairro: string) {
    iniciar(async () => {
      const r = await chamarAcao(() => salvarMeuBairro(bairro));
      if (r.ok) {
        guardarCookie(COOKIE_BAIRRO_PERTO, "", 0);
        setEstado({ tipo: "pronto", texto: r.mensagem ?? "Bairro salvo no seu perfil." });
      } else {
        setEstado({ tipo: "pronto", texto: r.erro });
      }
    });
  }

  if (estado.tipo === "nada") return null;

  const caixa = "relative flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-4 pr-12 shadow-card";
  const fechar = (cookie: string) => (
    <button
      type="button"
      onClick={() => adiar(cookie)}
      className="absolute top-2 right-2 flex size-10 items-center justify-center rounded-pill text-ink-muted hover:bg-surface-300"
      aria-label="Agora não"
    >
      <X aria-hidden className="size-4" />
    </button>
  );

  if (estado.tipo === "pronto") {
    return (
      <p role="status" className="rounded-lg border border-line bg-surface-200 px-4 py-3 text-body-sm text-cerrado-text">
        {estado.texto}
      </p>
    );
  }

  if (estado.tipo === "bairro") {
    return (
      <section aria-labelledby="sugestao-bairro" className={caixa}>
        {fechar(COOKIE_BAIRRO_ADIADO)}
        <h2 id="sugestao-bairro" className="inline-flex items-center gap-2 text-label">
          <MapPin aria-hidden className="size-5 shrink-0 text-terra-text" />
          Você está no {estado.bairro}. É onde você mora?
        </h2>
        <p className="text-body-sm text-ink-muted">
          O bairro aparece no seu cartão para as empresas verem que você mora perto. Só o nome do bairro: nunca o seu
          endereço.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pendente}
            onClick={() => confirmarBairro(estado.bairro)}
            className="inline-flex min-h-10 items-center rounded-md bg-ink px-4 text-label text-surface-100 hover:opacity-90 disabled:opacity-60"
          >
            {pendente ? "Salvando…" : "Sim, é o meu bairro"}
          </button>
          <Link
            href="/perfil/curriculo#onde-mora"
            onClick={() => guardarCookie(COOKIE_BAIRRO_ADIADO, "1", TRINTA_DIAS_S)}
            className="inline-flex min-h-10 items-center px-2 text-label underline underline-offset-2"
          >
            Não, moro em outro
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="convite-localizacao" className={caixa}>
      {fechar(COOKIE_CONVITE_LOCAL_ADIADO)}
      <h2 id="convite-localizacao" className="inline-flex items-center gap-2 text-label">
        <LocateFixed aria-hidden className="size-5 shrink-0 text-terra-text" />
        Ver primeiro o que está perto de você?
      </h2>
      <p className="text-body-sm text-ink-muted">
        Com a sua localização, o Publike mostra a distância de cada vaga e de cada talento, e quem contrata perto. Ela fica
        só no seu aparelho: ninguém vê onde você está.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={usar}
          className="inline-flex min-h-10 items-center gap-2 rounded-md bg-ink px-4 text-label text-surface-100 hover:opacity-90"
        >
          <LocateFixed aria-hidden className="size-4" />
          Usar minha localização
        </button>
        <button
          type="button"
          onClick={() => adiar(COOKIE_CONVITE_LOCAL_ADIADO)}
          className="inline-flex min-h-10 items-center px-2 text-label text-ink-muted underline-offset-2 hover:underline"
        >
          Agora não
        </button>
      </div>
      {estado.erro && (
        <p role="alert" className="text-body-sm text-danger">
          {estado.erro}
        </p>
      )}
    </section>
  );
}
