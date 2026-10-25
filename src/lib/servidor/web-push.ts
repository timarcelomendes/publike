import "server-only";
import { createCipheriv, createECDH, createHmac, createPrivateKey, randomBytes, sign } from "node:crypto";

// Notificação no celular (Web Push) sem biblioteca: a mensagem vai criptografada para o navegador
// (RFC 8291, aes128gcm) e assinada com as chaves VAPID do Publike (RFC 8292). Quem entrega é o
// serviço do navegador (Google, Apple, Mozilla), pelo endereço da inscrição.

export type InscricaoPush = { endpoint: string; p256dh: string; auth: string };
export type ChavesVapid = { publica: string; privada: string; contato: string };

const b64 = (b: Buffer) => b.toString("base64url");
const deB64 = (s: string) => Buffer.from(s, "base64url");
const hmac = (chave: Buffer, dado: Buffer) => createHmac("sha256", chave).update(dado).digest();

/** A chave pública (65 bytes, "04" + x + y) e a privada (32 bytes) estão no formato certo? */
export function chavesVapidValidas(publica: string, privada: string) {
  try {
    const pub = deB64(publica);
    const priv = deB64(privada);
    return pub.length === 65 && pub[0] === 4 && priv.length === 32;
  } catch {
    return false;
  }
}

/** Criptografa a mensagem para a inscrição (um registro só, aes128gcm). */
export function criptografarPush(
  inscricao: Pick<InscricaoPush, "p256dh" | "auth">,
  mensagem: Buffer,
  teste?: { privadaServidor: Buffer; sal: Buffer },
) {
  const publicaNavegador = deB64(inscricao.p256dh);
  const segredo = deB64(inscricao.auth);
  if (publicaNavegador.length !== 65 || segredo.length < 16) throw new Error("Inscrição inválida.");

  const ecdh = createECDH("prime256v1");
  if (teste) ecdh.setPrivateKey(teste.privadaServidor);
  else ecdh.generateKeys();
  const publicaServidor = ecdh.getPublicKey();
  const compartilhado = ecdh.computeSecret(publicaNavegador);
  const sal = teste?.sal ?? randomBytes(16);

  // IKM = HKDF(auth, ecdh, "WebPush: info" || 0 || ua_public || as_public, 32)
  const prkChave = hmac(segredo, compartilhado);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), publicaNavegador, publicaServidor, Buffer.from([1])]);
  const ikm = hmac(prkChave, info);
  // CEK e NONCE, com o sal
  const prk = hmac(sal, ikm);
  const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(
    0,
    16,
  );
  const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);

  const cifra = createCipheriv("aes-128-gcm", cek, nonce);
  // o último registro termina com o delimitador 0x02 (sem enchimento)
  const corpo = Buffer.concat([
    cifra.update(Buffer.concat([mensagem, Buffer.from([2])])),
    cifra.final(),
    cifra.getAuthTag(),
  ]);

  const tamanhoRegistro = Buffer.alloc(4);
  tamanhoRegistro.writeUInt32BE(4096);
  const cabecalho = Buffer.concat([sal, tamanhoRegistro, Buffer.from([publicaServidor.length]), publicaServidor]);
  return Buffer.concat([cabecalho, corpo]);
}

/** O cabeçalho Authorization da VAPID para o serviço de entrega daquele endereço (vale 12 horas). */
export function autorizacaoVapid(endpoint: string, chaves: ChavesVapid, agora = Date.now()) {
  const publica = deB64(chaves.publica);
  const chavePrivada = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: chaves.privada,
      x: b64(publica.subarray(1, 33)),
      y: b64(publica.subarray(33, 65)),
    },
    format: "jwk",
  });
  const cabecalho = b64(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const dados = b64(
    Buffer.from(
      JSON.stringify({
        aud: new URL(endpoint).origin,
        exp: Math.floor(agora / 1000) + 12 * 60 * 60,
        sub: chaves.contato,
      }),
    ),
  );
  const assinatura = sign("sha256", Buffer.from(`${cabecalho}.${dados}`), {
    key: chavePrivada,
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${cabecalho}.${dados}.${b64(assinatura)}, k=${chaves.publica}`;
}

export type ResultadoPush = { ok: true } | { ok: false; expirada: boolean; erro: string };

/**
 * Manda uma notificação. `expirada`: o serviço disse que a inscrição não vale mais (404 ou 410):
 * apagar. Outros erros tentam de novo depois.
 */
export async function enviarPush(
  inscricao: InscricaoPush,
  dados: unknown,
  chaves: ChavesVapid,
  opcoes: { ttl?: number; urgencia?: "low" | "normal" | "high"; topico?: string } = {},
): Promise<ResultadoPush> {
  let url: URL;
  try {
    url = new URL(inscricao.endpoint);
    if (url.protocol !== "https:") throw new Error();
  } catch {
    return { ok: false, expirada: true, erro: "Endereço da inscrição inválido." };
  }
  const corpo = criptografarPush(inscricao, Buffer.from(JSON.stringify(dados)));
  const cabecalhos: Record<string, string> = {
    Authorization: autorizacaoVapid(inscricao.endpoint, chaves),
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    TTL: String(opcoes.ttl ?? 24 * 60 * 60),
    Urgency: opcoes.urgencia ?? "normal",
  };
  // o tópico troca a notificação que ainda não chegou pela nova (até 32 letras, base64url)
  if (opcoes.topico && /^[A-Za-z0-9_-]{1,32}$/.test(opcoes.topico)) cabecalhos.Topic = opcoes.topico;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: cabecalhos,
      body: new Uint8Array(corpo),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status >= 200 && r.status < 300) return { ok: true };
    const texto = (await r.text().catch(() => "")).slice(0, 200);
    return { ok: false, expirada: r.status === 404 || r.status === 410, erro: `${r.status} ${texto}`.trim() };
  } catch (e) {
    return { ok: false, expirada: false, erro: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) };
  }
}
