/**
 * O app Android do Publike (Play Store): o próprio site em tela cheia (Trusted Web Activity).
 * O Android só abre sem a barra do navegador quando o site prova que o app é dele, em
 * /.well-known/assetlinks.json, com o nome do pacote e a impressão digital SHA-256 das chaves
 * que assinam o app: a de envio (a do pacote gerado) e a da Play (Play Console › Integridade do app
 * › Assinatura de apps). As impressões digitais são públicas (não são senha).
 */
export const PACOTE_ANDROID = "org.publike.app";

/** Formato "AA:BB:…" (32 pares). Vazio: a rota responde [] e o app abre com a barra do navegador. */
export const DIGITAIS_ANDROID: string[] = [];
