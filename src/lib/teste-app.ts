// Os números da página do teste do app (/testar-app), sem saber quem: abriu a página (e de onde veio, pelo
// ?de= do link) e tocou em cada passo. Contados por /api/teste-app; o admin mostra.

export const EVENTOS_TESTE_APP = ["abriu", "grupo", "aceitar", "instalar", "whatsapp"] as const;
export type EventoTesteApp = (typeof EVENTOS_TESTE_APP)[number];

/** De onde veio: o convite do Painel, o "Instalar app" no Android ou o convite mandado no WhatsApp. */
export const ORIGENS_TESTE_APP = ["painel", "instalar", "whatsapp", "outro"] as const;
export type OrigemTesteApp = (typeof ORIGENS_TESTE_APP)[number];

export const NOMES_EVENTOS_TESTE_APP: Record<EventoTesteApp, string> = {
  abriu: "Abriram a página",
  grupo: "Tocaram em “Entrar no grupo”",
  aceitar: "Tocaram em “Aceitar o teste”",
  instalar: "Tocaram em “Instalar no Google Play”",
  whatsapp: "Chamaram alguém no WhatsApp",
};

export const NOMES_ORIGENS_TESTE_APP: Record<OrigemTesteApp, string> = {
  painel: "convite no Painel",
  instalar: "“Instalar app” no Android",
  whatsapp: "convite no WhatsApp",
  outro: "outro link",
};
