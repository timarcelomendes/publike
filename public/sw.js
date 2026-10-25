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

// Notificação no celular (Web Push): o servidor manda { titulo, corpo, url, tag }, criptografado.
self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : "" };
  }
  const titulo = dados.titulo || "Publike";
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || "Você tem um aviso novo no Publike.",
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
      data: { url: typeof dados.url === "string" && dados.url.startsWith("/") ? dados.url : "/painel" },
    }),
  );
});

// Tocou na notificação: abre a página do aviso (numa aba do Publike que já esteja aberta, se tiver).
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || "/painel", self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abertas) => {
      const aba = abertas.find((c) => new URL(c.url).origin === self.location.origin);
      if (aba)
        return aba
          .navigate(destino)
          .then((c) => (c || aba).focus())
          .catch(() => self.clients.openWindow(destino));
      return self.clients.openWindow(destino);
    }),
  );
});
