"use client";

import { Check, Download, Lock, Smartphone, UserPlus, type LucideIcon } from "lucide-react";
import { useMemo, useSyncExternalStore } from "react";
import { ACEITAR_TESTE, APP_NA_PLAY, GRUPO_TESTADORES } from "@/lib/android";
import type { EventoTesteApp } from "@/lib/teste-app";
import { classesBotao } from "./ui/botao";
import { LinkDoTesteApp } from "./numeros-teste-app";

// Os 3 passos do teste do app (/testar-app), em ordem: o "Instalar" fica fechado até a pessoa tocar em "Aceitar o
// teste" (sem aceitar, a Play diz que o app não existe e a pessoa acha que está quebrado). O que já foi tocado
// fica guardado no aparelho (a pessoa sai para o Google e volta), com o ✓ no passo. "Já aceitei" abre o Instalar
// para quem aceitou em outro dia ou por outro link.

type Passo = {
  icone: LucideIcon;
  titulo: string;
  texto: string;
  botao: string;
  link: string;
  evento: Exclude<EventoTesteApp, "abriu" | "whatsapp">;
  nota?: string;
};

const PASSOS: Passo[] = [
  {
    icone: UserPlus,
    titulo: "Entre no grupo dos testadores",
    texto: "Use a mesma conta Google do seu celular Android. No grupo, toque em “Participar do grupo”.",
    botao: "Entrar no grupo",
    link: GRUPO_TESTADORES,
    evento: "grupo",
    nota: "Só a equipe do Publike vê quem está no grupo. Ninguém recebe e-mail por causa dele.",
  },
  {
    icone: Smartphone,
    titulo: "Aceite o teste no Google Play",
    texto: "Abra o link e toque em “Tornar-se testador”.",
    botao: "Aceitar o teste",
    link: ACEITAR_TESTE,
    evento: "aceitar",
    nota: "Apareceu que não está disponível? Espere uns minutos depois de entrar no grupo e abra de novo.",
  },
  {
    icone: Download,
    titulo: "Instale e use por 14 dias",
    texto:
      "Instale o Publike pelo Google Play e fique com ele no celular por 14 dias. Abra de vez em quando: é o mesmo Publike de sempre, com as vagas perto de você.",
    botao: "Instalar no Google Play",
    link: APP_NA_PLAY,
    evento: "instalar",
  },
];

const CHAVE = "publike_teste_app_passos";
type Feitos = Partial<Record<Passo["evento"], true>>;

// o que já foi tocado, guardado no aparelho (sem localStorage, vale só enquanto a página está aberta)
let naMemoria = "{}";
const ouvintes = new Set<() => void>();

function lerGuardado() {
  try {
    return localStorage.getItem(CHAVE) ?? naMemoria;
  } catch {
    return naMemoria;
  }
}

function assinar(avisar: () => void) {
  ouvintes.add(avisar);
  window.addEventListener("storage", avisar);
  return () => {
    ouvintes.delete(avisar);
    window.removeEventListener("storage", avisar);
  };
}

function marcar(evento: Passo["evento"]) {
  let feitos: Feitos = {};
  try {
    feitos = JSON.parse(lerGuardado()) as Feitos;
  } catch {
    // guardado estragado: começa de novo
  }
  naMemoria = JSON.stringify({ ...feitos, [evento]: true });
  try {
    localStorage.setItem(CHAVE, naMemoria);
  } catch {
    // sem localStorage: fica na memória
  }
  for (const avisar of ouvintes) avisar();
}

export function PassosDoTesteApp() {
  const guardado = useSyncExternalStore(assinar, lerGuardado, () => "{}");
  const feitos = useMemo<Feitos>(() => {
    try {
      return JSON.parse(guardado) as Feitos;
    } catch {
      return {};
    }
  }, [guardado]);

  // o próximo passo é o primeiro que falta: só ele tem o botão principal
  const proximo = PASSOS.findIndex((p) => !feitos[p.evento]);

  return (
    <ol className="mt-8 flex flex-col gap-4">
      {PASSOS.map(({ icone: Icone, titulo, texto, botao, link, evento, nota }, i) => {
        const feito = Boolean(feitos[evento]);
        const fechado = evento === "instalar" && !feitos.aceitar;
        return (
          <li key={titulo} className="flex gap-4 rounded-lg border border-line bg-surface-200 p-5 shadow-card">
            <span
              aria-hidden
              className={`flex size-10 shrink-0 items-center justify-center rounded-pill text-label ${
                feito ? "bg-cerrado text-on-cerrado" : "bg-surface-300"
              }`}
            >
              {feito ? <Check className="size-5" /> : i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="flex items-center gap-2 text-h3">
                <Icone aria-hidden className="size-5 shrink-0 text-terra-text" />
                {titulo}
                {feito && <span className="sr-only"> (feito)</span>}
              </h2>
              <p className="mt-1 text-body text-ink-muted">{texto}</p>
              {fechado ? (
                <div className="mt-4 flex flex-col gap-2">
                  <span
                    aria-disabled="true"
                    className={classesBotao("secundario", "md", "cursor-not-allowed self-start opacity-50")}
                  >
                    <Lock aria-hidden />
                    {botao}
                  </span>
                  <p className="text-body-sm text-ink-muted">
                    Primeiro aceite o teste (passo 2): sem isso, o Google Play diz que o app não existe.{" "}
                    <button
                      type="button"
                      onClick={() => marcar("aceitar")}
                      className="inline-flex min-h-10 items-center font-semibold text-ink underline underline-offset-2"
                    >
                      Já aceitei
                    </button>
                  </p>
                </div>
              ) : (
                <LinkDoTesteApp
                  evento={evento}
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => marcar(evento)}
                  className={classesBotao(i === proximo ? "primario" : "secundario", "md", "mt-4")}
                >
                  {botao}
                </LinkDoTesteApp>
              )}
              {nota && !fechado && <p className="mt-3 text-body-sm text-ink-muted">{nota}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
