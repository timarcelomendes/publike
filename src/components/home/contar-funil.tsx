"use client";

import { useEffect } from "react";
import { registrarFunilVisitante } from "@/lib/acoes/funil-visitante";

// O funil de quem chega sem conta (claude/plano-home-visitante.md, "Como medir"): na home de quem não entrou, conta
// que ela abriu e os toques em Curtir (o botão marcado com data-funil), Publicar, Currículo e Entrar (pelos links,
// onde estiverem: no topo, na faixa, na lista). Só a contagem do dia, sem saber quem.

function eventoDoClique(alvo: EventTarget | null): string | null {
  if (!(alvo instanceof Element)) return null;
  const marcado = alvo.closest<HTMLElement>("[data-funil]");
  if (marcado?.dataset.funil) return marcado.dataset.funil;
  const link = alvo.closest<HTMLAnchorElement>("a[href]");
  if (!link) return null;
  const caminho = new URL(link.href, window.location.href).pathname;
  if (caminho === "/publicar") return "publicar";
  if (caminho === "/perfil/curriculo") return "curriculo";
  if (caminho === "/entrar") return "entrar";
  return null;
}

// a última vez que contou a home: o React em desenvolvimento monta o efeito duas vezes seguidas
let contouEm = 0;

export function ContarFunilDaVitrine() {
  useEffect(() => {
    if (Date.now() - contouEm > 2000) {
      contouEm = Date.now();
      void registrarFunilVisitante("home").catch(() => {});
    }
    const clicou = (e: MouseEvent) => {
      const evento = eventoDoClique(e.target);
      if (evento) void registrarFunilVisitante(evento).catch(() => {});
    };
    // na captura: conta antes de a navegação trocar a página
    document.addEventListener("click", clicou, true);
    return () => document.removeEventListener("click", clicou, true);
  }, []);
  return null;
}
