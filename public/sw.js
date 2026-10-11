// Service worker do Publike: deixa o site ser instalado como app (PWA) e mostra
// uma página amigável quando a internet cai. Não guarda páginas nem dados: tudo
// continua vindo do servidor, para ninguém ver vaga velha.
const CACHE = "publike-offline-v2";
const OFFLINE = "/offline.html";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([OFFLINE, "/icons/icon-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  // só a abertura de páginas (e o ícone da página sem internet); o resto segue direto para a rede
  if (evento.request.mode === "navigate") {
    evento.respondWith(fetch(evento.request).catch(() => caches.match(OFFLINE)));
  } else if (new URL(evento.request.url).pathname === "/icons/icon-192.png") {
    evento.respondWith(fetch(evento.request).catch(() => caches.match("/icons/icon-192.png")));
  }
});
