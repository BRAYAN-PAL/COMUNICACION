const $ = (s) => document.querySelector(s);

const ui = {
  lista: $("#lista"),
  buscar: $("#buscar"),
  mensajes: $("#mensajes"),
  chatNombre: $("#chatNombre"),
  chatEstado: $("#chatEstado"),
  chatAvatar: $("#chatAvatar"),
  chatDot: $("#chatDot"),
  texto: $("#texto"),
  enviar: $("#btnEnviar"),
  composer: $("#composer"),
  escribiendo: $("#escribiendo"),
  login: $("#login"),
  formLogin: $("#formLogin"),
  codigo: $("#codigo"),
  loginError: $("#loginError"),
  toast: $("#toast"),
  miNombre: $("#miNombre"),
  miEstado: $("#miEstado"),
  miDot: $("#miDot"),
  datoNombre: $("#datoNombre"),
  datoInfo: $("#datoInfo"),
};

const socket = io();
let conversaciones = [];
let actual = null;
let filtro = "todas";
let idsVistos = new Set();
let escribiendoTimer = null;
let codeGuardado = sessionStorage.getItem("barberetos-code") || "";

/* ------------------------------- utilidades ------------------------------ */

function toast(texto) {
  ui.toast.textContent = texto;
  ui.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => ui.toast.classList.remove("show"), 3400);
}

const hora = (ts) =>
  new Date(ts).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false });

function etiquetaDia(ts) {
  const d = new Date(ts);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return "Hoy";
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function horaCorta(ts) {
  const d = new Date(ts);
  const hoy = new Date();
  const ayer = new Date();
  ayer.setDate(hoy.getDate() - 1);
  if (d.toDateString() === hoy.toDateString()) return hora(ts);
  if (d.toDateString() === ayer.toDateString()) return "Ayer";
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit" });
}

const iniciales = (nombre) => {
  const partes = String(nombre || "?").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/);
  if (!partes[0]) return "?";
  return (partes[0][0] + (partes[1]?.[0] || "")).toUpperCase();
};

const nombreDe = (c) => c.nombre || "Visitante " + String(c.id).slice(0, 4);

/* --------------------------------- sonido -------------------------------- */

let audioCtx = null;
function pitido() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audioCtx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.22);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.24);
  } catch {}
}

function notificarEscritorio(titulo, cuerpo, convId) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !document.hidden) return;
  const n = new Notification(titulo, { body: cuerpo, tag: convId, icon: undefined });
  n.onclick = () => {
    window.focus();
    abrir(convId);
    n.close();
  };
}

/* --------------------------------- login --------------------------------- */

function entrar(codigo, alEntrar) {
  socket.emit("admin:entrar", { codigo }, (r) => {
    if (!r?.ok) {
      ui.loginError.textContent = r?.error || "No se pudo entrar";
      return;
    }
    sessionStorage.setItem("barberetos-code", codigo);
    codeGuardado = codigo;
    ui.login.hidden = true;
    conversaciones = r.conversaciones || [];
    pintarLista();
    if (alEntrar) alEntrar();
  });
}

ui.formLogin.addEventListener("submit", (e) => {
  e.preventDefault();
  ui.loginError.textContent = "";
  entrar(ui.codigo.value.trim());
});

$("#btnSalir").addEventListener("click", () => {
  sessionStorage.removeItem("barberetos-code");
  location.reload();
});

/* -------------------------------- conexión ------------------------------- */

socket.on("connect", () => {
  ui.miDot.className = "dot warn";
  ui.miEstado.textContent = "conectando…";
  if (codeGuardado) {
    entrar(codeGuardado, () => {
      ui.miDot.className = "dot ok";
      ui.miEstado.textContent = "en línea";
    });
  } else {
    ui.login.hidden = false;
    ui.codigo.focus();
  }
});

socket.on("disconnect", () => {
  ui.miDot.className = "dot bad";
  ui.miEstado.textContent = "desconectado";
  ui.login.hidden = true;
});

socket.on("conversaciones", (lista) => {
  conversaciones = lista;
  pintarLista();
});

/* ------------------------------ lista de chats --------------------------- */

function filtradas() {
  const q = ui.buscar.value.toLowerCase().trim();
  return conversaciones.filter((c) => {
    if (filtro === "sin-leer" && !c.sinLeerAdmin) return false;
    if (filtro === "en-linea" && !c.enLinea) return false;
    if (!q) return true;
    return `${nombreDe(c)} ${c.ultimoTexto}`.toLowerCase().includes(q);
  });
}

function pintarLista() {
  const lista = filtradas();
  ui.lista.innerHTML = "";

  if (!lista.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.innerHTML = "<div><strong>Sin conversaciones</strong><p>Cuando alguien escriba desde la página de chat, aparecerá aquí.</p></div>";
    ui.lista.appendChild(div);
  }

  for (const c of lista) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "conv";
    b.dataset.id = c.id;
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", c.id === actual ? "true" : "false");

    const av = document.createElement("span");
    av.className = "avatar";
    av.style.position = "relative";
    av.textContent = iniciales(nombreDe(c));
    if (c.enLinea) {
      const punto = document.createElement("span");
      punto.className = "dot ok";
      punto.style.cssText = "position:absolute;bottom:-1px;right:-1px;box-shadow:0 0 0 2px var(--panel)";
      av.appendChild(punto);
    }

    const info = document.createElement("span");
    info.className = "info";
    const nombre = document.createElement("b");
    nombre.textContent = nombreDe(c);
    const prev = document.createElement("p");
    prev.textContent = (c.ultimoDe === "admin" ? "Tú: " : "") + (c.ultimoTexto || "Nueva conversación");
    info.append(nombre, prev);

    const meta = document.createElement("span");
    meta.className = "meta";
    const t = document.createElement("span");
    t.textContent = c.ultimoTs ? horaCorta(c.ultimoTs) : "";
    meta.appendChild(t);
    if (c.sinLeerAdmin) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = c.sinLeerAdmin > 99 ? "99+" : String(c.sinLeerAdmin);
      meta.appendChild(badge);
    }

    b.append(av, info, meta);
    ui.lista.appendChild(b);
  }

  const sinLeer = conversaciones.reduce((n, c) => n + (c.sinLeerAdmin || 0), 0);
  const enLinea = conversaciones.filter((c) => c.enLinea).length;
  $("#statConversaciones").textContent = conversaciones.length;
  $("#statEnLinea").textContent = enLinea;
  $("#statSinLeer").textContent = sinLeer;
  document.title = (sinLeer ? `(${sinLeer}) ` : "") + "Chat en vivo · Barberetos";
}

/* --------------------------------- mensajes ------------------------------ */

function burbuja(m) {
  const div = document.createElement("div");
  div.className = "msg " + (m.de === "admin" ? "out" : "in");
  const p = document.createElement("span");
  p.textContent = m.texto;
  const t = document.createElement("time");
  t.textContent = hora(m.ts) + (m.de === "admin" ? " ✓" : "");
  div.append(p, t);
  return div;
}

function pintarMensajes(lista) {
  ui.mensajes.innerHTML = "";
  idsVistos = new Set();
  if (!lista.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.innerHTML = "<div><strong>Sin mensajes todavía</strong><p>Escribe el primero para saludar.</p></div>";
    ui.mensajes.appendChild(div);
    return;
  }
  let dia = "";
  for (const m of lista) {
    const d = etiquetaDia(m.ts);
    if (d !== dia) {
      dia = d;
      const sep = document.createElement("span");
      sep.className = "day";
      sep.textContent = d;
      ui.mensajes.appendChild(sep);
    }
    idsVistos.add(m.id);
    ui.mensajes.appendChild(burbuja(m));
  }
  ui.mensajes.scrollTop = ui.mensajes.scrollHeight;
}

function agregar(m) {
  if (!m || idsVistos.has(m.id)) return;
  ui.mensajes.querySelector(".empty")?.remove();
  const seps = [...ui.mensajes.querySelectorAll(".day")];
  const ultimo = seps[seps.length - 1];
  if (!ultimo || ultimo.textContent !== etiquetaDia(m.ts)) {
    const sep = document.createElement("span");
    sep.className = "day";
    sep.textContent = etiquetaDia(m.ts);
    ui.mensajes.appendChild(sep);
  }
  idsVistos.add(m.id);
  ui.mensajes.appendChild(burbuja(m));
  ui.mensajes.scrollTop = ui.mensajes.scrollHeight;
}

/* --------------------------------- abrir --------------------------------- */

function abrir(id) {
  actual = id;
  const c = conversaciones.find((x) => x.id === id);
  ui.chatNombre.textContent = c ? nombreDe(c) : "Conversación";
  ui.chatAvatar.textContent = c ? iniciales(nombreDe(c)) : "?";
  ui.chatDot.className = "dot " + (c?.enLinea ? "ok" : "");
  ui.chatEstado.textContent = c?.enLinea ? "En línea ahora" : "Desconectado";
  ui.datoNombre.textContent = c ? nombreDe(c) : "—";
  ui.datoInfo.textContent = c
    ? `Desde ${new Date(c.creada).toLocaleDateString("es-PE")} · ${c.id.slice(0, 8)}…`
    : "—";
  ui.texto.disabled = false;
  ui.enviar.disabled = false;
  ui.escribiendo.textContent = "";
  pintarLista();
  socket.emit("admin:abrir", { convId: id });
  ui.texto.focus();
}

$("#btnProbar").addEventListener("click", () => window.open("/chat", "_blank"));

$("#btnNotificar").addEventListener("click", async () => {
  if (!("Notification" in window)) return toast("Este navegador no soporta notificaciones");
  const permiso = await Notification.requestPermission();
  toast(permiso === "granted" ? "Notificaciones activadas" : "No se activaron las notificaciones");
  if (permiso === "granted") $("#btnNotificar").textContent = "Notificaciones activas";
});

/* --------------------------------- eventos ------------------------------- */

socket.on("conversacion:abierta", ({ convId, mensajes }) => {
  if (convId !== actual) return;
  pintarMensajes(mensajes);
});

socket.on("mensaje:nuevo", ({ convId, mensaje }) => {
  const deVisitante = mensaje.de === "visitante";

  if (convId === actual) {
    agregar(mensaje);
    if (deVisitante && !document.hidden) socket.emit("admin:leido", { convId });
  }

  if (deVisitante && (document.hidden || convId !== actual)) {
    pitido();
    const c = conversaciones.find((x) => x.id === convId);
    notificarEscritorio(c ? nombreDe(c) : "Nuevo mensaje", mensaje.texto, convId);
  }
});

socket.on("presencia", ({ convId, enLinea }) => {
  const c = conversaciones.find((x) => x.id === convId);
  if (!c) return;
  c.enLinea = enLinea;
  if (convId === actual) {
    ui.chatDot.className = "dot " + (enLinea ? "ok" : "");
    ui.chatEstado.textContent = enLinea ? "En línea ahora" : "Desconectado";
  }
  pintarLista();
});

socket.on("visitante:escribiendo", ({ convId, escribiendo }) => {
  if (convId !== actual) return;
  ui.escribiendo.textContent = escribiendo ? "El visitante está escribiendo…" : "";
});

/* --------------------------------- envío --------------------------------- */

ui.composer.addEventListener("submit", (e) => {
  e.preventDefault();
  const texto = ui.texto.value.trim();
  if (!texto || !actual) return;
  socket.emit("admin:mensaje", { convId: actual, texto });
  ui.texto.value = "";
  socket.emit("admin:escribiendo", { convId: actual, escribiendo: false });
});

ui.texto.addEventListener("input", () => {
  if (!actual) return;
  socket.emit("admin:escribiendo", { convId: actual, escribiendo: true });
  clearTimeout(escribiendoTimer);
  escribiendoTimer = setTimeout(() => {
    socket.emit("admin:escribiendo", { convId: actual, escribiendo: false });
  }, 1400);
});

/* -------------------------------- interfaz ------------------------------- */

ui.lista.addEventListener("click", (e) => {
  const b = e.target.closest(".conv");
  if (b) abrir(b.dataset.id);
});

ui.buscar.addEventListener("input", pintarLista);

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x === chip));
    filtro = chip.dataset.filtro;
    pintarLista();
  });
});

$("#tpl").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !actual) return;
  ui.texto.value = b.textContent;
  ui.texto.focus();
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && actual) socket.emit("admin:leido", { convId: actual });
});

if ("Notification" in window && Notification.permission === "granted") {
  $("#btnNotificar").textContent = "Notificaciones activas";
}
