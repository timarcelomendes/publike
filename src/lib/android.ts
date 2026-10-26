/**
 * O app Android do Publike (Play Store): o próprio site em tela cheia (Trusted Web Activity).
 * O Android só abre sem a barra do navegador quando o site prova que o app é dele, em
 * /.well-known/assetlinks.json, com o nome do pacote e a impressão digital SHA-256 das chaves
 * que assinam o app: a de envio (a do pacote gerado) e a da Play (Play Console › Integridade do app
 * › Assinatura de apps). As impressões digitais são públicas (não são senha).
 */
export const PACOTE_ANDROID = "org.publike.app";

/** Formato "AA:BB:…" (32 pares). Vazio: a rota responde [] e o app abre com a barra do navegador. */
export const DIGITAIS_ANDROID: string[] = [
  // a chave de assinatura do app, que o Google Play guarda (o app instalado pela Play)
  "4F:79:DD:4D:A3:E5:CC:39:A7:45:5F:A1:18:BA:BA:47:A6:B1:D3:6A:62:C6:6A:F7:EA:9C:78:7B:A3:E8:E0:19",
  // a chave de envio, a do pacote gerado no PWABuilder em 26/10/2026
  "EF:13:CC:99:1A:29:FD:A6:64:AF:EE:C4:B3:9E:30:70:9B:0B:FA:82:5C:B2:7B:1A:78:7F:76:BB:43:C6:24:01",
];

/**
 * O teste fechado da Play (conta pessoal: 12 testadores por 14 dias antes da produção). Quem entra no
 * Grupo do Google vira testador; depois aceita o teste na Play e instala. A página /testar-app explica.
 */
export const GRUPO_TESTADORES = "https://groups.google.com/g/testadores-publike";
export const ACEITAR_TESTE = `https://play.google.com/apps/testing/${PACOTE_ANDROID}`;
export const APP_NA_PLAY = `https://play.google.com/store/apps/details?id=${PACOTE_ANDROID}`;
