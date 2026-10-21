// Bot de Telegram de glpfinder (Cloudflare Worker).
// Contesta a una dirección, un pueblo, un código postal o una ubicación compartida con las
// gasolineras de GLP que más compensan cerca de ese punto.
//
// Secretos del Worker (Settings → Variables and Secrets):
//   TELEGRAM_TOKEN  -> token del bot de @BotFather
//   WEBHOOK_SECRET  -> una contraseña inventada (letras y números) que protege el bot
// Para conectarlo con Telegram, una vez desplegado, abre en el navegador:
//   https://<tu-worker>.workers.dev/configurar?clave=<WEBHOOK_SECRET>

const SITE = "https://glpfinder.es/";
const CARTOCIUDAD = "https://www.cartociudad.es/geocoder/api/geocoder";
const CAMPO_GLP = "Precio Gases licuados del petróleo";
const RADIOS = [5, 10, 25, 50];
const RADIO_INICIAL = 10;
// Para decidir cuál "compensa más": llenar 40 L y el gasto de ir y volver (7,5 L/100 km)
const LITROS_LLENADO = 40, CONSUMO_100KM = 7.5;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/configurar") return configurar(url, env);
      if (url.pathname === "/webhook" && request.method === "POST") {
        if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) return new Response("No autorizado", { status: 401 });
        const update = await request.json();
        ctx.waitUntil(atender(update, env).catch((e) => console.error("Error atendiendo", e)));
        return new Response("ok");
      }
      return new Response("Bot de glpfinder. Escríbele en Telegram.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    } catch (e) {
      console.error(e);
      return new Response("Error", { status: 500 });
    }
  },
};

// ---------- Telegram ----------
async function tg(env, metodo, datos) {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_TOKEN}/${metodo}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos),
  });
  return res.json();
}

async function configurar(url, env) {
  if (!env.TELEGRAM_TOKEN || !env.WEBHOOK_SECRET) return texto("Faltan los secretos TELEGRAM_TOKEN o WEBHOOK_SECRET en el Worker.", 500);
  if (url.searchParams.get("clave") !== env.WEBHOOK_SECRET) return texto("Clave incorrecta.", 401);
  const hook = await tg(env, "setWebhook", {
    url: `${url.origin}/webhook`, secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"], drop_pending_updates: true,
  });
  await tg(env, "setMyCommands", { commands: [
    { command: "start", description: "Cómo funciona el bot" },
    { command: "ubicacion", description: "Enviar mi ubicación" },
  ] });
  await tg(env, "setMyShortDescription", { short_description: "Te digo la gasolinera de GLP que más te compensa cerca de cualquier dirección. Precios oficiales · glpfinder.es" });
  await tg(env, "setMyDescription", { description: "Escríbeme una dirección, un pueblo o un código postal, o mándame tu ubicación, y te digo las gasolineras de GLP (autogás) que más compensan cerca, con los precios oficiales del Ministerio actualizados cada 2 horas." });
  return texto(hook.ok ? "✅ Bot conectado. Ya puedes escribirle en Telegram." : `❌ Telegram ha respondido: ${hook.description}`, hook.ok ? 200 : 500);
}

const texto = (t, status = 200) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

const BIENVENIDA = `⛽ <b>Hola, soy el bot de glpfinder</b>

Te digo dónde repostar GLP (autogás) cerca de cualquier sitio, con los precios oficiales del Ministerio actualizados cada 2 horas.

Escríbeme:
• una dirección: <i>Calle Mayor 5, Getafe</i>
• un pueblo o ciudad: <i>Tarancón</i>
• un código postal: <i>28901</i>

O mándame tu ubicación con el 📎 clip → <b>Ubicación</b>.

El mapa completo está en <a href="${SITE}">glpfinder.es</a> y el resumen diario en @glpfinder.`;

const TECLADO_UBICACION = { keyboard: [[{ text: "📍 Enviar mi ubicación", request_location: true }]], resize_keyboard: true, one_time_keyboard: true };

async function atender(update, env) {
  if (update.callback_query) return atenderBoton(update.callback_query, env);
  const m = update.message;
  if (!m || m.chat.type !== "private") return;
  const chat = m.chat.id;

  if (m.location) {
    const { latitude: lat, longitude: lng } = m.location;
    return responder(env, chat, { lat, lng, nombre: "tu ubicación" }, RADIO_INICIAL);
  }
  const t = (m.text || "").trim();
  if (!t) return tg(env, "sendMessage", { chat_id: chat, text: "Mándame una dirección, un pueblo, un código postal o tu ubicación." });
  if (t.startsWith("/start") || t.startsWith("/ayuda") || t.startsWith("/help")) {
    return tg(env, "sendMessage", { chat_id: chat, text: BIENVENIDA, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup: TECLADO_UBICACION });
  }
  if (t.startsWith("/ubicacion")) {
    return tg(env, "sendMessage", { chat_id: chat, text: "Pulsa el botón de abajo para mandarme tu ubicación.", reply_markup: TECLADO_UBICACION });
  }
  if (t.length < 3) return tg(env, "sendMessage", { chat_id: chat, text: "Escribe al menos 3 letras o un código postal." });

  await tg(env, "sendChatAction", { chat_id: chat, action: "find_location" });
  const lugar = await geocodificar(t);
  if (!lugar) {
    return tg(env, "sendMessage", { chat_id: chat, text: `No he encontrado «${t.slice(0, 80)}». Prueba con el nombre del pueblo, una calle con su localidad o un código postal, o mándame tu ubicación.`, reply_markup: TECLADO_UBICACION });
  }
  return responder(env, chat, lugar, RADIO_INICIAL);
}

async function atenderBoton(cq, env) {
  // data: "r|lat|lng|radio"
  const [tipo, la, ln, r] = String(cq.data || "").split("|");
  if (tipo !== "r") return tg(env, "answerCallbackQuery", { callback_query_id: cq.id });
  const lugar = { lat: +la, lng: +ln, nombre: nombreDesdeMensaje(cq.message) };
  const { text, reply_markup } = await componer(lugar, +r);
  await tg(env, "answerCallbackQuery", { callback_query_id: cq.id, text: `Radio de ${r} km` });
  return tg(env, "editMessageText", {
    chat_id: cq.message.chat.id, message_id: cq.message.message_id, text, parse_mode: "HTML",
    link_preview_options: { is_disabled: true }, reply_markup,
  });
}

// El nombre del lugar se recupera de la primera línea del mensaje original ("Cerca de …")
function nombreDesdeMensaje(msg) {
  const linea = String(msg && msg.text || "").split("\n")[0];
  const m = linea.match(/Cerca de (.+?) ·/);
  return m ? m[1] : "ese punto";
}

async function responder(env, chat, lugar, radio) {
  const { text, reply_markup } = await componer(lugar, radio);
  return tg(env, "sendMessage", { chat_id: chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true }, reply_markup });
}

// ---------- Geocodificación (CartoCiudad, IGN) ----------
async function geocodificar(q) {
  const res = await fetch(`${CARTOCIUDAD}/candidates?q=${encodeURIComponent(q)}&limit=5`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const lista = await res.json();
  if (!Array.isArray(lista) || !lista.length) return null;
  // Preferencia: código postal, municipio o población, calle/portal; el primero suele ser el mejor
  const c = lista[0];
  const nombre = [c.address ? capital(c.address) : null, c.type === "Codpost" ? null : c.muni !== c.address ? c.muni : null, c.province].filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i).join(", ");
  if (c.lat && c.lng) return { lat: +c.lat, lng: +c.lng, nombre };
  const p = new URLSearchParams({ id: c.id, type: c.type });
  if (c.portalNumber != null) p.set("portal", c.portalNumber);
  const r2 = await fetch(`${CARTOCIUDAD}/find?${p}`, { signal: AbortSignal.timeout(8000) });
  if (!r2.ok) return null;
  const d = await r2.json();
  if (!d || !d.lat || !d.lng) return null;
  return { lat: +d.lat, lng: +d.lng, nombre };
}

// ---------- Datos de precios (se reutilizan mientras el Worker siga vivo) ----------
let cache = { t: 0, est: null, fecha: "" };
async function estaciones() {
  if (cache.est && Date.now() - cache.t < 20 * 60 * 1000) return cache;
  const res = await fetch(`${SITE}data/precios.json`, { cf: { cacheTtl: 900, cacheEverything: true } });
  if (!res.ok) { if (cache.est) return cache; throw new Error(`precios HTTP ${res.status}`); }
  const d = await res.json();
  const i = Object.fromEntries(d.campos.map((c, k) => [c, k]));
  const num = (v) => parseFloat(String(v || "").replace(",", "."));
  const est = [];
  for (const f of d.filas) {
    const precio = num(f[i[CAMPO_GLP]]), lat = num(f[i["Latitud"]]), lng = num(f[i["Longitud (WGS84)"]]);
    if (!(precio > 0) || !isFinite(lat) || !isFinite(lng)) continue;
    est.push({
      id: f[i.IDEESS], rotulo: (f[i["Rótulo"]] || "").trim() || "Sin rótulo", dir: f[i["Dirección"]] || "",
      municipio: (f[i.Municipio] || f[i.Localidad] || "").trim(), precio, lat, lng,
    });
  }
  cache = { t: Date.now(), est, fecha: d.Fecha || "" };
  return cache;
}

// ---------- Respuesta ----------
const rad = Math.PI / 180;
function distKm(a, b) {
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const eur = (v) => v.toFixed(3).replace(".", ",") + " €";
const km = (d) => (d < 10 ? d.toFixed(1) : Math.round(d).toString()).replace(".", ",") + " km";
const slug = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const ficha = (e) => `${SITE}gasolinera/${[slug(e.rotulo) || "gasolinera", slug(e.municipio), e.id].filter(Boolean).join("-")}/`;
const capital = (t) => String(t).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
const gmaps = (e) => `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}`;
const waze = (e) => `https://waze.com/ul?ll=${e.lat},${e.lng}&navigate=yes`;

function linea(e) {
  return `<b>${esc(e.rotulo)}</b> · <b>${eur(e.precio)}</b>/L · a ${km(e.d)}\n${esc(capital(e.dir))}, ${esc(e.municipio)} · <a href="${ficha(e)}">ficha</a>`;
}

async function componer(lugar, radio) {
  const { est } = await estaciones();
  const p = { lat: lugar.lat, lng: lugar.lng };
  const cerca = est.map((e) => ({ ...e, d: distKm(p, e) })).filter((e) => e.d <= radio);
  const cab = `📍 <b>Cerca de ${esc(lugar.nombre)}</b> · ${radio} km`;
  const botonesRadio = [RADIOS.map((r) => ({ text: r === radio ? `• ${r} km •` : `${r} km`, callback_data: `r|${p.lat.toFixed(4)}|${p.lng.toFixed(4)}|${r}` }))];

  if (!cerca.length) {
    const masCercana = est.map((e) => ({ ...e, d: distKm(p, e) })).sort((a, b) => a.d - b.d)[0];
    return {
      text: `${cab}\n\nNo hay gasolineras con GLP a menos de ${radio} km.${masCercana ? `\n\nLa más cercana está a ${km(masCercana.d)}:\n${linea(masCercana)}` : ""}`,
      reply_markup: { inline_keyboard: [
        ...(masCercana ? [[{ text: "🗺 Google Maps", url: gmaps(masCercana) }, { text: "🚗 Waze", url: waze(masCercana) }]] : []),
        ...botonesRadio,
      ] },
    };
  }

  const media = cerca.reduce((a, e) => a + e.precio, 0) / cerca.length;
  // Coste de llenar 40 L contando el combustible de ir y volver
  const coste = (e) => e.precio * (LITROS_LLENADO + (2 * e.d / 100) * CONSUMO_100KM);
  const compensa = [...cerca].sort((a, b) => coste(a) - coste(b))[0];
  const barata = [...cerca].sort((a, b) => a.precio - b.precio || a.d - b.d)[0];
  const cercana = [...cerca].sort((a, b) => a.d - b.d)[0];

  const bloques = [`⭐ <b>La que más te compensa</b>\n${linea(compensa)}`];
  if (barata !== compensa) bloques.push(`🏆 <b>La más barata</b>\n${linea(barata)}`);
  if (cercana !== compensa && cercana !== barata) bloques.push(`📍 <b>La más cercana</b>\n${linea(cercana)}`);

  const elegidas = new Set([compensa, barata, cercana]);
  const otras = [...cerca].filter((e) => !elegidas.has(e)).sort((a, b) => a.precio - b.precio).slice(0, 3);
  const txtOtras = otras.length ? `\n\n<b>Otras baratas</b>\n${otras.map((e) => `• ${eur(e.precio)} · ${esc(e.rotulo)}, ${esc(e.municipio)} · ${km(e.d)}`).join("\n")}` : "";

  const ahorro = (media - compensa.precio) * LITROS_LLENADO;
  const txtAhorro = ahorro >= 0.5 ? `\n\n💶 Llenando 40 L en la primera ahorras unos ${ahorro.toFixed(2).replace(".", ",")} € frente a la media de la zona (${eur(media)}).` : "";

  const text = `${cab}\n${cerca.length} ${cerca.length === 1 ? "gasolinera" : "gasolineras"} con GLP\n\n${bloques.join("\n\n")}${txtOtras}${txtAhorro}\n\n<i>Precios oficiales del Ministerio.</i> <a href="${SITE}index.html?lat=${p.lat.toFixed(5)}&lng=${p.lng.toFixed(5)}">Ver en el mapa</a>`;

  const filas = [[{ text: "🗺 Google Maps", url: gmaps(compensa) }, { text: "🚗 Waze", url: waze(compensa) }]];
  if (barata !== compensa) filas.push([{ text: `🏆 Ir a la más barata (${barata.rotulo.slice(0, 18)})`, url: gmaps(barata) }]);
  filas.push(...botonesRadio);
  return { text, reply_markup: { inline_keyboard: filas } };
}
