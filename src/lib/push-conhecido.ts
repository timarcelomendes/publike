// Os serviços de notificação dos navegadores (claude/plano-seguranca.md, item 12). O endereço da inscrição vem do
// navegador da pessoa; sem esta lista, o servidor do Publike mandaria um POST para qualquer site que alguém
// cadastrasse no lugar da inscrição.

const SERVICOS_DE_PUSH = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge no Android, Samsung Internet, Opera
  /^android\.googleapis\.com$/, // inscrições antigas do Chrome
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari (Mac e iPhone)
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge no Windows
];

/** O endereço é https e de um dos serviços de notificação dos navegadores. */
export function servicoDePushConhecido(endereco: string) {
  let url: URL;
  try {
    url = new URL(endereco);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.port && SERVICOS_DE_PUSH.some((r) => r.test(url.hostname));
}
