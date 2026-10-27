// Service worker compartido: shell offline del chat y del panel + notificaciones.
const CACHE = "barberetos-chat-v7";

const SHELL = [
  "/chat",
  "/chat.html",
  "/panel",
  "/tema.css",
  "/chat.css",
  "/admin.css",
  "/chat.js",
  "/admin.js",
  "/manifest.webmanifest",
  "/manifest-panel.webmanifest",
  "/iconos/icono-192.png",
  "/iconos/icono-512.png",
  "/iconos/icono-180.png",
  "/iconos/panel-192.png",
  "/iconos/panel-512.png",
  "/iconos/panel-180.png",
  "/socket.io/socket.io.js",
];

/* ------------------------------- ciclo de vida ----------------------------- */

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch((e) => console.warn("[sw] precache parcial:", e))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* --------------------------------- fetch ---------------------------------- */

// Devuelve el shell guardado de la app que corresponde (chat o panel).
function shell(ruta) {
  const esPanel = String(ruta).startsWith("/panel");
  const primero = esPanel ? "/panel" : "/chat.html";
  const segundo = esPanel ? null : "/chat";

  return caches
    .match(primero)
    .then((hit) => hit || (segundo ? caches.match(segundo) : null))
    .then(
      (hit) =>
        hit ||
        new Response("Sin conexión", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        })
    );
}

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // El transporte de Socket.IO (polling/websocket) va siempre a la red.
  if (url.pathname.startsWith("/socket.io/") && url.pathname !== "/socket.io/socket.io.js") return;

  // Navegación: red primero; si falla o el servidor está caído (5xx), shell guardado.
  if (req.mode === "navigate") {
    const esPanel = url.pathname.startsWith("/panel");

    evento.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => {
              if (esPanel) {
                c.put("/panel", copia.clone());
              } else {
                c.put("/chat.html", copia.clone());
                c.put("/chat", copia.clone());
              }
            });
            return res;
          }
          return res.status >= 500 ? shell(url.pathname) : res;
        })
        .catch(() => shell(url.pathname))
    );
    return;
  }

  // Recursos: caché primero y actualización en segundo plano.
  evento.respondWith(
    caches.match(req).then((hit) => {
      const red = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
            return res;
          }
          return hit || res;
        })
        .catch(() => hit || new Response("", { status: 504 }));
      return hit || red;
    })
  );
});

/* ------------------------------ notificaciones ----------------------------- */

self.addEventListener("push", (evento) => {
  let datos = { title: "Barberetos", body: "Tienes un mensaje nuevo" };
  try {
    if (evento.data) datos = { ...datos, ...evento.data.json() };
  } catch {}
  evento.waitUntil(
    self.registration.showNotification(datos.title, {
      body: datos.body,
      icon: "/iconos/icono-192.png",
      badge: "/iconos/icono-192.png",
      data: { url: datos.url || "/chat" },
      tag: "barberetos-chat",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = evento.notification.data?.url || "/chat";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if (cliente.url.includes("/chat") || cliente.url.includes("/panel")) return cliente.focus();
      }
      return self.clients.openWindow(destino);
    })
  );
});
