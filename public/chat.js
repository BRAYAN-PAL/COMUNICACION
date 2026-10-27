const $ = (s) => document.querySelector(s);

const ui = {
  hilo: $("#hilo"),
  texto: $("#texto"),
  enviar: $("#btnEnviar"),
  form: $("#form"),
  escribiendo: $("#escribiendo"),
  pedirNombre: $("#pedirNombre"),
  formNombre: $("#formNombre"),
  nombreInput: $("#nombreInput"),
  estadoTxt: $("#estadoTxt"),
  estadoDot: $("#estadoDot"),
  rapidas: $("#rapidas"),
  toast: $("#toast"),
  instalar: $("#btnInstalar"),
  aviso: $("#aviso"),
};

const socket = io();

let nombre = localStorage.getItem("barberetos-nombre") || "";
let visitanteId = localStorage.getItem("barberetos-id");
if (!visitanteId) {
  visitanteId = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
  localStorage.setItem("barberetos-id", visitanteId);
}

let idsVistos = new Set();
let listo = false;
let escribiendoTimer = null;

/* ------------------------------- utilidades ------------------------------ */

function toast(texto) {
  ui.toast.textContent = texto;
  ui.toast.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => ui.toast.classList.remove("show"), 3200);
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

function estado(texto, tipo) {
  ui.estadoTxt.textContent = texto;
  ui.estadoDot.className = "dot " + (tipo || "");
}

function burbuja(m) {
  const div = document.createElement("div");
  div.className = "msg " + (m.de === "visitante" ? "out" : "in");
  const p = document.createElement("span");
  p.textContent = m.texto;
  const t = document.createElement("time");
  t.textContent = hora(m.ts) + (m.de === "visitante" ? " ✓" : "");
  div.append(p, t);
  return div;
}

function pintarMensajes(lista) {
  ui.hilo.innerHTML = "";
  idsVistos = new Set();
  if (!lista.length) {
    const div = document.createElement("div");
    div.className = "empty";
    div.innerHTML = '<div><strong>Todo listo</strong><p>Escribe tu primer mensaje y te atendemos.</p></div>';
    ui.hilo.appendChild(div);
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
      ui.hilo.appendChild(sep);
    }
    idsVistos.add(m.id);
    ui.hilo.appendChild(burbuja(m));
  }
  ui.hilo.scrollTop = ui.hilo.scrollHeight;
}

function agregar(m) {
  if (!m || idsVistos.has(m.id)) return;
  ui.hilo.querySelector(".empty")?.remove();
  const seps = [...ui.hilo.querySelectorAll(".day")];
  const ultimo = seps[seps.length - 1];
  if (!ultimo || ultimo.textContent !== etiquetaDia(m.ts)) {
    const sep = document.createElement("span");
    sep.className = "day";
    sep.textContent = etiquetaDia(m.ts);
    ui.hilo.appendChild(sep);
  }
  idsVistos.add(m.id);
  ui.hilo.appendChild(burbuja(m));
  ui.hilo.scrollTop = ui.hilo.scrollHeight;
  if (m.de === "admin") {
    if (!document.hidden) socket.emit("visitante:leido");
    else document.title = "Nuevo mensaje · Barberetos";
  }
}

/* --------------------------------- entrada ------------------------------- */

function conectar() {
  estado("conectando…", "warn");
  socket.emit("visitante:entrar", { visitanteId, nombre }, (r) => {
    if (!r?.ok) {
      estado("error", "bad");
      return toast(r?.error || "No se pudo conectar");
    }
    listo = true;
    ui.texto.disabled = false;
    ui.enviar.disabled = false;
    estado("en línea", "ok");
    pintarMensajes(r.mensajes);
    ui.texto.focus();
  });
}

ui.formNombre.addEventListener("submit", (e) => {
  e.preventDefault();
  const valor = ui.nombreInput.value.trim();
  if (!valor) return;
  nombre = valor.slice(0, 40);
  localStorage.setItem("barberetos-nombre", nombre);
  ui.pedirNombre.hidden = true;
  if (socket.connected) conectar();
});

/* --------------------------------- envío --------------------------------- */

ui.form.addEventListener("submit", (e) => {
  e.preventDefault();
  const texto = ui.texto.value.trim();
  if (!texto || !listo) return;
  socket.emit("visitante:mensaje", { texto });
  ui.texto.value = "";
  socket.emit("visitante:escribiendo", { escribiendo: false });
  clearTimeout(escribiendoTimer);
});

ui.texto.addEventListener("input", () => {
  if (!listo) return;
  socket.emit("visitante:escribiendo", { escribiendo: true });
  clearTimeout(escribiendoTimer);
  escribiendoTimer = setTimeout(() => {
    socket.emit("visitante:escribiendo", { escribiendo: false });
  }, 1400);
});

ui.rapidas.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !listo) return;
  socket.emit("visitante:mensaje", { texto: b.textContent });
});

/* -------------------------------- eventos -------------------------------- */

socket.on("mensaje:nuevo", ({ mensaje }) => agregar(mensaje));

socket.on("admin:escribiendo", ({ escribiendo }) => {
  ui.escribiendo.textContent = escribiendo ? "Barberetos está escribiendo…" : "";
});

socket.on("leido", () => {
  ui.hilo.querySelectorAll(".msg.out time").forEach((t) => {
    if (!t.textContent.includes("✓✓")) t.textContent = t.textContent.replace("✓", "✓✓");
  });
});

socket.on("connect", () => {
  ui.aviso.hidden = true;
  if (nombre) {
    ui.pedirNombre.hidden = true;
    conectar();
  } else {
    ui.pedirNombre.hidden = false;
    ui.nombreInput.focus();
  }
});

socket.on("disconnect", () => {
  listo = false;
  estado("sin conexión", "bad");
  ui.aviso.hidden = false;
  ui.texto.disabled = true;
  ui.enviar.disabled = true;
});

socket.on("connect_error", () => {
  estado("error de conexión", "bad");
  ui.aviso.hidden = false;
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    document.title = "Chatea con Barberetos";
    if (listo) socket.emit("visitante:leido");
  }
});

/* --------------------------------- PWA ----------------------------------- */

let promptInstalar = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  promptInstalar = e;
  ui.instalar.hidden = false;
});

ui.instalar.addEventListener("click", async () => {
  if (promptInstalar) {
    promptInstalar.prompt();
    const { outcome } = await promptInstalar.userChoice;
    if (outcome === "accepted") ui.instalar.hidden = true;
    promptInstalar = null;
    return;
  }
  // iPhone/iPad: Safari no tiene el diálogo automático.
  toast("Toca Compartir (□↑) y luego «Añadir a inicio»");
});

window.addEventListener("appinstalled", () => {
  ui.instalar.hidden = true;
  toast("App instalada en tu teléfono");
});

const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const yaInstalada =
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
if (esIOS && !yaInstalada) ui.instalar.hidden = false;

window.addEventListener("online", () => {
  ui.aviso.hidden = true;
});

window.addEventListener("offline", () => {
  ui.aviso.hidden = false;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("[pwa] sw:", e.message));
  });
}
