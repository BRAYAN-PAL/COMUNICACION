const path = require("path");
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const store = require("./store");

const PUERTO = Number(process.env.PORT || 3000);
const CLAVE_ADMIN = process.env.ADMIN_CODE || "barberetos";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 20000, pingTimeout: 25000 });

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/chat", (_req, res) => res.sendFile(path.join(__dirname, "..", "public", "chat.html")));
app.get("/api/salud", (_req, res) => res.json({ ok: true, conversaciones: store.listar().length }));

/* --------------------------- presencia en memoria -------------------------- */

const enLinea = new Map(); // convId -> Set(socketId)

function sumarPresencia(convId, socketId) {
  if (!enLinea.has(convId)) enLinea.set(convId, new Set());
  enLinea.get(convId).add(socketId);
}

function quitarPresencia(convId, socketId) {
  const set = enLinea.get(convId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    enLinea.delete(convId);
    return true; // quedó offline
  }
  return false;
}

const estaEnLinea = (convId) => (enLinea.get(convId)?.size || 0) > 0;

function conversacionesConPresencia() {
  return store.listar().map((c) => ({ ...c, enLinea: estaEnLinea(c.id) }));
}

/* ---------------------------- freno anti-spam ----------------------------- */
// Un mensaje cada 500 ms y máximo 30 por minuto, por conexión.
// Evita que el link público se use para inundar el panel.
const ESPERA_MS = 500;
const MAX_POR_MINUTO = 30;

function dejarPasar(socket) {
  const ahora = Date.now();
  const ritmo = socket.data.ritmo || (socket.data.ritmo = { ultimo: 0, cuenta: 0, desde: ahora });
  if (ahora - ritmo.desde > 60_000) {
    ritmo.desde = ahora;
    ritmo.cuenta = 0;
  }
  if (ahora - ritmo.ultimo < ESPERA_MS) return false;
  if (ritmo.cuenta >= MAX_POR_MINUTO) return false;
  ritmo.ultimo = ahora;
  ritmo.cuenta += 1;
  return true;
}

/* -------------------------------- sockets -------------------------------- */

io.on("connection", (socket) => {
  socket.data.rol = null;
  socket.data.convId = null;

  /* ------------------------------ visitantes ----------------------------- */

  socket.on("visitante:entrar", ({ visitanteId, nombre } = {}, responder = () => {}) => {
    if (!visitanteId || typeof visitanteId !== "string" || visitanteId.length < 6) {
      return responder({ ok: false, error: "Identificador inválido" });
    }
    const id = visitanteId.slice(0, 64);

    if (socket.data.rol === "visitante" && socket.data.convId && socket.data.convId !== id) {
      quitarPresencia(socket.data.convId, socket.id);
      socket.leave("conv:" + socket.data.convId);
    }

    const conv = store.crearConversacion(id, { nombre });
    socket.data.rol = "visitante";
    socket.data.convId = id;
    socket.join("conv:" + id);
    sumarPresencia(id, socket.id);

    responder({
      ok: true,
      conversacion: { ...conv, enLinea: true },
      mensajes: store.mensajes(id),
    });

    io.to("admins").emit("conversaciones", conversacionesConPresencia());
    io.to("admins").emit("presencia", { convId: id, enLinea: true });
  });

  socket.on("visitante:mensaje", ({ texto } = {}) => {
    const convId = socket.data.convId;
    if (socket.data.rol !== "visitante" || !convId) return;
    const limpio = String(texto || "").trim();
    if (!limpio) return;
    if (!dejarPasar(socket)) return;

    const mensaje = store.agregarMensaje(convId, { texto: limpio, de: "visitante" });
    io.to("conv:" + convId).emit("mensaje:nuevo", { convId, mensaje });
    io.to("admins").emit("mensaje:nuevo", { convId, mensaje });
    io.to("admins").emit("conversaciones", conversacionesConPresencia());
  });

  socket.on("visitante:escribiendo", ({ escribiendo } = {}) => {
    const convId = socket.data.convId;
    if (socket.data.rol !== "visitante" || !convId) return;
    socket.to("admins").emit("visitante:escribiendo", { convId, escribiendo: !!escribiendo });
  });

  socket.on("visitante:leido", () => {
    const convId = socket.data.convId;
    if (socket.data.rol !== "visitante" || !convId) return;
    store.marcarLeido(convId, "visitante");
    io.to("admins").emit("conversaciones", conversacionesConPresencia());
  });

  /* ------------------------------- admins -------------------------------- */

  socket.on("admin:entrar", ({ codigo } = {}, responder = () => {}) => {
    if (String(codigo || "") !== CLAVE_ADMIN) {
      return responder({ ok: false, error: "Código incorrecto" });
    }
    socket.data.rol = "admin";
    socket.join("admins");
    responder({ ok: true, conversaciones: conversacionesConPresencia() });
    console.log("[chat] admin conectado:", socket.id.slice(0, 6));
  });

  socket.on("admin:abrir", ({ convId } = {}) => {
    if (socket.data.rol !== "admin" || !convId) return;
    store.marcarLeido(convId, "admin");
    socket.emit("conversacion:abierta", { convId, mensajes: store.mensajes(convId) });
    io.to("conv:" + convId).emit("leido", { por: "admin" });
    io.to("admins").emit("conversaciones", conversacionesConPresencia());
  });

  socket.on("admin:mensaje", ({ convId, texto } = {}) => {
    if (socket.data.rol !== "admin" || !convId) return;
    const limpio = String(texto || "").trim();
    if (!limpio) return;
    const mensaje = store.agregarMensaje(convId, { texto: limpio, de: "admin" });
    io.to("conv:" + convId).emit("mensaje:nuevo", { convId, mensaje });
    io.to("admins").emit("mensaje:nuevo", { convId, mensaje });
    io.to("admins").emit("conversaciones", conversacionesConPresencia());
  });

  socket.on("admin:escribiendo", ({ convId, escribiendo } = {}) => {
    if (socket.data.rol !== "admin" || !convId) return;
    socket.to("conv:" + convId).emit("admin:escribiendo", { convId, escribiendo: !!escribiendo });
  });

  socket.on("admin:leido", ({ convId } = {}) => {
    if (socket.data.rol !== "admin" || !convId) return;
    store.marcarLeido(convId, "admin");
    io.to("admins").emit("conversaciones", conversacionesConPresencia());
  });

  /* ------------------------------ desconexión ----------------------------- */

  socket.on("disconnect", () => {
    const convId = socket.data.convId;
    if (socket.data.rol === "visitante" && convId) {
      const quedoOffline = quitarPresencia(convId, socket.id);
      if (quedoOffline) {
        io.to("admins").emit("presencia", { convId, enLinea: false });
        io.to("admins").emit("conversaciones", conversacionesConPresencia());
      }
    }
  });
});

server.listen(PUERTO, () => {
  console.log(`\n  Barberetos · chat en vivo`);
  console.log(`  Panel:   http://localhost:${PUERTO}`);
  console.log(`  Cliente: http://localhost:${PUERTO}/chat`);
  console.log(`  Clave admin: ${CLAVE_ADMIN}\n`);
});
