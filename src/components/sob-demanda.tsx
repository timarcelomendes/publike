"use client";

import dynamic from "next/dynamic";

// O que o layout mostra só para algumas pessoas, cada um no seu próprio pedaço de JavaScript (17/11/2026, "deixe a
// performance invejável"). O Next junta num bloco só tudo o que os componentes do servidor do layout importam, e
// todas as páginas baixavam o código do sino, do menu da conta, da pergunta do match, dos banners e da faixa do "só
// olhar", mesmo quem está sem conta (a maior parte de quem chega). Com o dynamic(), cada um vira um pedaço à parte,
// que só baixa quando o servidor desenha o componente (e já vem no HTML: nada pisca).

/** O sino (quem entrou). */
export const Notificacoes = dynamic(() => import("./notificacoes").then((m) => m.Notificacoes));

/** O menu da conta (quem entrou). */
export const MenuUsuario = dynamic(() => import("./menu-usuario").then((m) => m.MenuUsuario));

/** "Quer falar agora?" depois do match (quem entrou). */
export const PerguntaDoMatch = dynamic(() => import("./pergunta-do-match").then((m) => m.PerguntaDoMatch));

/** Os banners do admin (só quando há banner para quem chega). */
export const BannerDoSite = dynamic(() => import("./home/banner-da-home").then((m) => m.BannerDoSite));

/** A faixa do "só olhar" (empresa vendo como pessoa). */
export const FaixaSoOlhar = dynamic(() => import("./faixa-so-olhar").then((m) => m.FaixaSoOlhar));
