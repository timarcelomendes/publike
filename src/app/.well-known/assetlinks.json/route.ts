import { DIGITAIS_ANDROID, PACOTE_ANDROID } from "@/lib/android";

// Digital Asset Links: diz ao Android que o app org.publike.app é deste site (o app abre em tela
// cheia, sem a barra do navegador). Sem impressão digital, responde uma lista vazia. Não lê nada
// da requisição: o Next guarda a resposta pronta.

export function GET() {
  const digitais = DIGITAIS_ANDROID.filter((d) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(d));
  const corpo = digitais.length
    ? [
        {
          relation: ["delegate_permission/common.handle_all_urls"],
          target: { namespace: "android_app", package_name: PACOTE_ANDROID, sha256_cert_fingerprints: digitais },
        },
      ]
    : [];
  return Response.json(corpo, { headers: { "cache-control": "public, max-age=3600" } });
}
