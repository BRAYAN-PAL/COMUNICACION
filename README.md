# Barberetos · Chat en vivo (multi-socket)

Chat web en tiempo real con **Socket.IO**: tus clientes escriben desde una página
(`/chat`) y tú respondes desde el panel. Varias pestañas, celulares o computadoras
pueden estar conectados a la vez y todos ven la conversación al instante.

```
Cliente (/chat)  ─┐
Cliente (/chat)  ─┼── WebSocket ──▶  Servidor (Express + Socket.IO)  ◀── Panel (/)
Panel (pestaña)  ─┘                       │
                                     data/db.json
```

## Arrancar

```bash
npm install     # solo la primera vez
npm start
```

| Página | URL |
|---|---|
| Panel (tú) | <http://localhost:3000/panel> |
| Chat (cliente) | <http://localhost:3000/chat> |

El panel pide un **código de administrador**. Por defecto es `barberetos`
(cámbialo con la variable `ADMIN_CODE`). El código se guarda en la pestaña, así
que no lo pide cada vez.

En Windows también hay `iniciar.bat`.

## Dos web apps instalables (PWA)

Las dos páginas son **web apps independientes**: cada una se instala con su icono,
abre a pantalla completa y tiene su propio shell sin conexión.

| App | URL | Manifest | Icono |
|---|---|---|---|
| Chat (cliente) | `/chat` | `manifest.webmanifest` (scope `/chat`) | B dorada sobre negro |
| Panel (barbero) | `/panel` | `manifest-panel.webmanifest` (scope `/panel`) | B negra sobre ámbar |

| Dónde | Cómo instalarla |
|---|---|
| Android (Chrome) | Botón **“Instalar app”** / **“Instalar”**, o menú ⋮ → *Instalar aplicación* |
| iPhone/iPad (Safari) | Compartir **□↑** → *Añadir a la pantalla de inicio* |
| Escritorio (Chrome/Edge) | Icono de instalar en la barra de direcciones |

- **Sin conexión:** el service worker guarda las dos apps (chat y panel), así que
  abren aunque el servidor esté caído. Los mensajes sí necesitan internet.
- **Pantalla fija en celular:** no hay scroll de página; solo se desplaza el hilo de
  mensajes. La cabecera y el campo de escribir quedan siempre visibles y, al abrir el
  teclado, la altura se recalcula con `visualViewport` para no dejar hueco negro.
- **Panel en celular:** pasa a dos pantallas (lista de conversaciones ↔ chat) con
  botón de volver; la lista, el hilo y el campo de escribir se adaptan al teclado.
- **Notificaciones:** se activan desde el panel (lado barbero).
- **Archivos:** `public/manifest*.webmanifest`, `public/sw.js` e `public/iconos/`.

> ⚠️ Si cambias `chat.html`, `chat.css`, `chat.js`, `index.html`, `admin.css` o
> `admin.js`, **sube la versión** en `sw.js` (`barberetos-chat-v7` → `v8`). Si no, el
> celular sigue mostrando la copia guardada.

## Qué hace

- **Mensajes en vivo** en las dos direcciones, sin recargar.
- **Varias conexiones**: si abres el panel en dos pestañas, ambas se actualizan;
  si un cliente abre el chat en dos pestañas, ambas comparten la conversación.
- **Presencia**: punto verde cuando el visitante está conectado (y se apaga al cerrar).
- **Escribiendo…** en ambos lados.
- **No leídos** por conversación, contador en el título y filtros (sin leer / en línea).
- **Notificaciones del navegador** + sonido cuando llega un mensaje y no estás mirando ese chat.
- **Doble check** cuando el visitante lee tu respuesta.
- **Mensajes rápidos** y buscador.
- Los chats se guardan en `data/db.json`: si reinicias, no se pierden.

## Cómo funciona el multi-socket

El servidor usa **rooms** de Socket.IO:

| Room | Quién entra | Para qué |
|---|---|---|
| `conv:<id>` | los sockets de ese visitante | recibir respuestas y avisos de "leído" |
| `admins` | todos los paneles abiertos | recibir todo y mantenerse sincronizados |

Cuando un visitante escribe, el servidor guarda el mensaje y lo emite a `admins`
(y a su `conv:`). Cada panel decide si lo muestra o solo lo marca como no leído.
La presencia se cuenta con un `Set` de sockets por conversación: dos pestañas del
mismo visitante no lo marcan "desconectado" hasta que se cierran las dos.

## Eventos (para ampliar)

| Dirección | Evento | Datos |
|---|---|---|
| cliente → servidor | `visitante:entrar` | `{ visitanteId, nombre }` |
| cliente → servidor | `visitante:mensaje` | `{ texto }` |
| cliente → servidor | `visitante:escribiendo` | `{ escribiendo }` |
| servidor → cliente | `mensaje:nuevo` | `{ convId, mensaje }` |
| servidor → cliente | `admin:escribiendo` | `{ convId, escribiendo }` |
| servidor → cliente | `leido` | `{ por }` |
| panel → servidor | `admin:entrar` | `{ codigo }` |
| panel → servidor | `admin:abrir` | `{ convId }` |
| panel → servidor | `admin:mensaje` | `{ convId, texto }` |
| servidor → panel | `conversaciones` | lista completa con presencia |
| servidor → panel | `mensaje:nuevo` | `{ convId, mensaje }` |

## Estructura

```
barberetos-chat/
├─ src/
│  ├─ server.js     Express + Socket.IO + rooms + presencia
│  └─ store.js      conversaciones y mensajes en JSON
├─ public/
│  ├─ index.html    panel del barbero
│  ├─ admin.js
│  ├─ chat.html     página del cliente (web app)
│  ├─ chat.js
│  ├─ sw.js         service worker (offline + notificaciones)
│  ├─ manifest.webmanifest
│  ├─ iconos/       iconos 192/512/maskable/iPhone
│  ├─ tema.css      estilos compartidos (tu diseño)
│  ├─ admin.css
│  └─ chat.css
└─ data/db.json     historial (se crea solo)
```

## Ponerlo en tu web

- **Enlace directo:** un botón "Chatea con nosotros" que abra `/chat` en otra pestaña.
- **Iframe:** `<iframe src="https://tu-servidor/chat" style="width:380px;height:600px;border:0;border-radius:16px"></iframe>`
- **Burbuja flotante:** el mismo iframe escondido en una esquina, que se abre al hacer clic.

## Si lo despliegas (Render, VPS…)

- Socket.IO necesita **una sola instancia** (o *sticky sessions*). Si el hosting
  escala a 2 réplicas sin afinidad, las conexiones se reparten y se rompe.
- El plan free de Render **duerme** el servicio: los sockets se caen. Para un chat
  real usa un plan siempre encendido o un ping externo.
- Usa **HTTPS/WSS** y cambia `ADMIN_CODE`. El código viaja en el handshake del socket.
- El disco de Render es efímero: si quieres conservar `data/db.json`, monta un disco
  persistente o pasa la persistencia a Postgres.

## Límites conocidos

- Persistencia en JSON y un solo proceso: sirve para una barbería, no para miles de chats.
- Solo texto (sin archivos, fotos ni audio).
- No hay adjuntos ni historial de notificaciones si el navegador está cerrado
  (para eso haría falta push del sistema con service worker o app nativa).
- No hay rate limit: si lo expones a internet, añádelo.
