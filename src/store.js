// Persistencia simple en JSON. Un proceso, una instancia: suficiente para el chat.
const fs = require("fs");
const path = require("path");

// En local: <proyecto>/data. En Render con disco: /var/data (variable DATA_DIR).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const MAX_MENSAJES = 500;

const vacio = () => ({ conversaciones: {}, mensajes: {} });
let db = vacio();
let timer = null;

function cargar() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DB_FILE)) {
      const leido = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
      db = { ...vacio(), ...leido };
      db.conversaciones = db.conversaciones || {};
      db.mensajes = db.mensajes || {};
    }
  } catch (e) {
    console.error("[store] No se pudo leer la base:", e.message);
  }
}

function guardarYa() {
  try {
    fs.writeFileSync(DB_FILE + ".tmp", JSON.stringify(db, null, 2));
    fs.renameSync(DB_FILE + ".tmp", DB_FILE);
  } catch (e) {
    console.error("[store] No se pudo guardar:", e.message);
  }
}

function guardar() {
  clearTimeout(timer);
  timer = setTimeout(guardarYa, 250);
}

function crearConversacion(id, datos = {}) {
  if (!db.conversaciones[id]) {
    db.conversaciones[id] = {
      id,
      nombre: datos.nombre || null,
      creada: Date.now(),
      ultimoTs: 0,
      ultimoTexto: "",
      ultimoDe: null,
      sinLeerAdmin: 0,
      sinLeerVisitante: 0,
    };
    guardar();
  }
  const c = db.conversaciones[id];
  if (datos.nombre && datos.nombre !== c.nombre) {
    c.nombre = datos.nombre;
    guardar();
  }
  return c;
}

function agregarMensaje(convId, { texto, de }) {
  const c = crearConversacion(convId);
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    texto: String(texto).slice(0, 2000),
    de, // "visitante" | "admin"
    ts: Date.now(),
  };

  const lista = db.mensajes[convId] || (db.mensajes[convId] = []);
  lista.push(msg);
  if (lista.length > MAX_MENSAJES) lista.splice(0, lista.length - MAX_MENSAJES);

  c.ultimoTexto = msg.texto;
  c.ultimoTs = msg.ts;
  c.ultimoDe = de;
  if (de === "visitante") c.sinLeerAdmin += 1;
  else c.sinLeerVisitante += 1;

  guardar();
  return msg;
}

function marcarLeido(convId, lado) {
  const c = db.conversaciones[convId];
  if (!c) return;
  if (lado === "admin") c.sinLeerAdmin = 0;
  if (lado === "visitante") c.sinLeerVisitante = 0;
  guardar();
}

function listar() {
  return Object.values(db.conversaciones).sort((a, b) => b.ultimoTs - a.ultimoTs);
}

function mensajes(convId) {
  return db.mensajes[convId] || [];
}

function borrarTodo() {
  db = vacio();
  guardarYa();
}

process.on("exit", guardarYa);
process.on("SIGINT", () => {
  guardarYa();
  process.exit(0);
});

cargar();

module.exports = { crearConversacion, agregarMensaje, marcarLeido, listar, mensajes, borrarTodo, guardarYa };
