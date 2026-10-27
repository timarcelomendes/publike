// O aparelho de um acesso, pelo navegador (user agent): "Celular Android (SM-A145M) · Chrome",
// "iPhone · Safari", "Computador Windows · Edge" ou "App Android". Para o admin ver de onde a conta entra.

function sistema(ua: string) {
  if (/iPad/.test(ua)) return "iPad";
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  const android = /Android(?: [\d.]+)?(?:; ([^;)]+))?/.exec(ua);
  if (android) {
    // o Chrome novo esconde o modelo ("K"); os outros ainda mandam (SM-A145M, moto g54...)
    const modelo = android[1]?.replace(/ Build\/.*$/, "").trim();
    const comModelo =
      modelo && modelo !== "K" && !/^(Linux|U|wv|[a-z]{2}-[a-z]{2})$/i.test(modelo) ? ` (${modelo})` : "";
    return `${/Mobile/.test(ua) ? "Celular" : "Tablet"} Android${comModelo}`;
  }
  if (/Windows/.test(ua)) return "Computador Windows";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Macintosh|Mac OS X/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Computador Linux";
  return null;
}

function navegador(ua: string) {
  if (/Instagram/.test(ua)) return "dentro do Instagram";
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return "dentro do Facebook";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/EdgA?\/|EdgiOS/.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/FxiOS|Firefox\//.test(ua)) return "Firefox";
  if (/; wv\)/.test(ua)) return "dentro de outro app";
  if (/CriOS|Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return null;
}

export function descreverAparelho(ua: string, app = false) {
  if (app) return "App Android (Google Play)";
  const s = sistema(ua);
  const n = navegador(ua);
  if (!s && !n) return "Aparelho não identificado";
  return [s, n].filter(Boolean).join(" · ");
}
