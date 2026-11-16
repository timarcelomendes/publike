"use client";

import { LocateFixed, MapPin, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { chamarAcao } from "@/lib/acao-segura";
import { salvarMeuBairro } from "@/lib/acoes/bairro";
import { buscarEnderecoDoPonto } from "@/lib/acoes/cep";
import { pertoGuardadoNoNavegador } from "@/lib/perto-guardado";
import { AVISOS_GPS, pedirPosicao } from "../explorar/barra-busca";

// O convite antes do pedido do navegador (16/11/2026): o navegador só pergunta depois que a pessoa toca em "Usar minha
// localização" (pedir logo na entrada leva ao "Bloquear", e aí o site não pode mais perguntar). "Agora não" cala o
// convite por 30 dias; com a permissão negada, ele nunca aparece. Com a localização liberada e o perfil de pessoa sem
// bairro, a pergunta "Você está no Setor Bueno. É onde você mora?": o sim grava só o nome do bairro no perfil.

const ADIAR_CONVITE = "publike_convite_local_ate";
const ADIAR_BAIRRO = "publike_bairro_sugerido_ate";
const TRINTA_DIAS = 30 * 24 * 3600 * 1000;

function adiado(chave: string) {
  try {
    return Number(localStorage.getItem(chave) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

function adiar(chave: string) {
  try {
    localStorage.setItem(chave, String(Date.now() + TRINTA_DIAS));
  } catch {
    // sem localStorage (aba privada): some só nesta tela
  }
}

type Estado =
  | { tipo: "nada" }
  | { tipo: "convite"; erro: string | null }
  | { tipo: "bairro"; bairro: string }
  | { tipo: "pronto"; texto: string };

export function ConviteDaLocalizacao({ pedirBairro = null }: { pedirBairro?: { cidade: string } | null }) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "nada" });
  const [pendente, iniciar] = useTransition();

  /** Com a posição em mãos: o bairro de lá, para perguntar se é onde a pessoa mora. */
  function sugerirBairro(ponto: { lat: number; lng: number }, depois: Estado) {
    if (!pedirBairro || adiado(ADIAR_BAIRRO)) return setEstado(depois);
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
    if (!("geolocation" in navigator)) return;
    let ativo = true;
    const guardado = pertoGuardadoNoNavegador();
    const decidir = (permissao: PermissionState | null) => {
      if (!ativo) return;
      if (guardado) return sugerirBairro(guardado, { tipo: "nada" });
      if (permissao === "granted") {
        // liberada, mas ainda sem a posição guardada: lê agora (o navegador não pergunta nada)
        navigator.geolocation.getCurrentPosition(
          ({ coords }) => ativo && sugerirBairro({ lat: coords.latitude, lng: coords.longitude }, { tipo: "nada" }),
          () => {},
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
        );
        return;
      }
      if (permissao === "denied" || adiado(ADIAR_CONVITE)) return;
      setEstado({ tipo: "convite", erro: null });
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
        router.refresh();
        sugerirBairro(ponto, { tipo: "pronto", texto: "Pronto: o Publike mostra primeiro o que está perto de você." });
      },
      (motivo) => setEstado({ tipo: "convite", erro: AVISOS_GPS[motivo] }),
    );
  }

  function confirmarBairro(bairro: string) {
    iniciar(async () => {
      const r = await chamarAcao(() => salvarMeuBairro(bairro));
      if (r.ok) setEstado({ tipo: "pronto", texto: r.mensagem ?? "Bairro salvo no seu perfil." });
      else setEstado({ tipo: "pronto", texto: r.erro });
    });
  }

  if (estado.tipo === "nada") return null;

  const caixa = "relative flex flex-col gap-3 rounded-lg border border-line-strong bg-surface-200 p-4 pr-12 shadow-card";
  const fechar = (chave: string) => (
    <button
      type="button"
      onClick={() => {
        adiar(chave);
        setEstado({ tipo: "nada" });
      }}
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
        {fechar(ADIAR_BAIRRO)}
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
            onClick={() => adiar(ADIAR_BAIRRO)}
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
      {fechar(ADIAR_CONVITE)}
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
          onClick={() => {
            adiar(ADIAR_CONVITE);
            setEstado({ tipo: "nada" });
          }}
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
