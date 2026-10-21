// Publica cada mañana en el canal de Telegram el resumen del precio del GLP.
// Lo ejecuta .github/workflows/telegram.yml. Necesita dos secretos del repositorio:
//   TELEGRAM_TOKEN  -> token del bot (de @BotFather)
//   TELEGRAM_CANAL  -> @nombre_del_canal (el bot tiene que ser administrador)
// Uso local sin enviar nada: node scripts/publicar_telegram.mjs --prueba [precios.json]

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SITE = "https://glpfinder.es/";
const CAMPO_GLP = "Precio Gases licuados del petróleo";
const DIR_HIST = path.join("public", "data", "historial");

const CCAA = {
  "01": "Andalucía", "02": "Aragón", "03": "Asturias", "04": "Illes Balears", "05": "Canarias",
  "06": "Cantabria", "07": "Castilla-La Mancha", "08": "Castilla y León", "09": "Cataluña",
  "10": "C. Valenciana", "11": "Extremadura", "12": "Galicia", "13": "Madrid",
  "14": "Murcia", "15": "Navarra", "16": "País Vasco", "17": "La Rioja", "18": "Ceuta", "19": "Melilla",
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

const num = (t) => parseFloat(String(t ?? "").replace(",", "."));
const esc = (v) => String(v ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const euro = (v) => v.toFixed(3).replace(".", ",") + " €";
const slug = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const titulo = (t) => String(t).toLowerCase().replace(/(^|[\s(/-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Del|La|Las|Los|El|Y|E)\b/g, (m) => m.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
const ficha = (e) => `${SITE}gasolinera/${[slug(e.rotulo) || "gasolinera", slug(e.municipio), e.id].filter(Boolean).join("-")}/`;
const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;

async function leerDatos(fichero) {
  if (fichero) return JSON.parse(await readFile(fichero, "utf8"));
  const res = await fetch(`${SITE}data/precios.json`, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`No se pudieron descargar los precios: HTTP ${res.status}`);
  return res.json();
}

// Media nacional de un día a partir del historial guardado en el repositorio
async function mediaDia(fecha) {
  let nombres = [];
  try { nombres = await readdir(DIR_HIST); } catch { return null; }
  const precios = [];
  for (const n of nombres) {
    try {
      const r = JSON.parse(await readFile(path.join(DIR_HIST, n), "utf8")).find((x) => x.fecha === fecha);
      if (r && r.precio > 0) precios.push(r.precio);
    } catch { /* fichero dañado: se ignora */ }
  }
  return precios.length > 100 ? media(precios) : null;
}

function variacion(hoy, antes) {
  if (antes == null) return "";
  const c = Math.round((hoy - antes) * 1000) / 10;
  if (Math.abs(c) < 0.1) return " (igual que ayer)";
  return ` (${c < 0 ? "▼" : "▲"} ${String(Math.abs(c)).replace(".", ",")} cts respecto a ayer)`;
}

async function main() {
  const args = process.argv.slice(2);
  const prueba = args.includes("--prueba");
  const fichero = args.find((a) => !a.startsWith("--"));

  const d = await leerDatos(fichero);
  const est = d.filas.map((f) => Object.fromEntries(d.campos.map((c, i) => [c, f[i]]))).map((e) => ({
    id: e.IDEESS, rotulo: (e["Rótulo"] || "").trim() || "Sin rótulo",
    municipio: (e.Municipio || titulo(e.Localidad || "")).trim(), precio: num(e[CAMPO_GLP]), ccaa: e.IDCCAA,
  })).filter((e) => e.precio > 0);
  if (est.length < 100) throw new Error(`Muy pocas gasolineras (${est.length}); no se publica`);

  const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const ayerISO = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(Date.now() - 864e5));
  const mNac = media(est.map((e) => e.precio));
  const mAyer = await mediaDia(ayerISO);

  const top = [...est].sort((a, b) => a.precio - b.precio).slice(0, 5);
  const porCCAA = {};
  for (const e of est) if (CCAA[e.ccaa]) (porCCAA[e.ccaa] ||= []).push(e);
  const lineasCCAA = Object.entries(porCCAA)
    .sort((a, b) => CCAA[a[0]].localeCompare(CCAA[b[0]], "es"))
    .map(([c, l]) => {
      const b = l.reduce((x, y) => (y.precio < x.precio ? y : x));
      return `• <b>${esc(CCAA[c])}</b>: ${euro(b.precio)}, <a href="${ficha(b)}">${esc(b.rotulo)} ${esc(b.municipio)}</a>`;
    });

  const texto = [
    `⛽ <b>Precio del GLP hoy, ${DIAS[hoy.getDay()]} ${hoy.getDate()} de ${MESES[hoy.getMonth()]}</b>`,
    "",
    `Media en España: <b>${euro(mNac)}/L</b>${variacion(mNac, mAyer)}`,
    "",
    "🏆 <b>Las 5 más baratas de España</b>",
    ...top.map((e, i) => `${i + 1}. ${euro(e.precio)} · <a href="${ficha(e)}">${esc(e.rotulo)} ${esc(e.municipio)}</a>`),
    "",
    "📍 <b>La más barata de cada comunidad</b>",
    ...lineasCCAA,
    "",
    `🗺 Busca la más barata cerca de ti: <a href="${SITE}">glpfinder.es</a>`,
    "<i>Precios oficiales del Ministerio para la Transición Ecológica.</i>",
  ].join("\n");

  if (prueba) { console.log(texto); return; }

  const token = process.env.TELEGRAM_TOKEN, canal = process.env.TELEGRAM_CANAL;
  if (!token || !canal) { console.log("Faltan los secretos TELEGRAM_TOKEN o TELEGRAM_CANAL: no se publica nada."); return; }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: canal, text: texto, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
  });
  const r = await res.json();
  if (!r.ok) throw new Error(`Telegram respondió: ${r.description}`);
  console.log("Publicado en", canal);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
