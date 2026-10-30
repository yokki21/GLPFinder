// Descarga los precios del Ministerio y genera los datos estáticos de la web:
//   public/data/precios.json          -> estaciones con GLP (formato compacto: campos + filas) y medias nacionales
//   public/data/historial/<IDEESS>.json -> histórico diario del precio del GLP
// Se ejecuta desde GitHub Actions (ver .github/workflows/actualizar-datos.yml).
// Uso local: node scripts/actualizar_datos.mjs [fichero_json_del_ministerio]

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const URL_MINISTERIO =
  "https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/";
const DIR_DATOS = path.join("public", "data");
const DIR_HISTORIAL = path.join(DIR_DATOS, "historial");
const DIAS_HISTORIAL = 400;

const CAMPO_GLP = "Precio Gases licuados del petróleo";
// Solo los campos que usa la web. Se guardan como filas (sin repetir nombres) para que el archivo pese menos
const CAMPOS = [
  "IDEESS", "Rótulo", "Dirección", "Localidad", "Municipio", "Provincia", "C.P.",
  "Latitud", "Longitud (WGS84)", "IDProvincia", "IDCCAA", CAMPO_GLP,
];

const aNumero = (txt) => (txt ? parseFloat(String(txt).replace(",", ".")) : NaN);

async function descargar() {
  for (let intento = 1; intento <= 4; intento++) {
    try {
      const res = await fetch(URL_MINISTERIO, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const datos = await res.json();
      if (!Array.isArray(datos.ListaEESSPrecio) || datos.ListaEESSPrecio.length < 1000) {
        throw new Error("Respuesta incompleta del Ministerio");
      }
      return datos;
    } catch (e) {
      console.warn(`Intento ${intento} fallido: ${e.message}`);
      if (intento === 4) throw e;
      await new Promise((r) => setTimeout(r, intento * 15_000));
    }
  }
}

function media(lista, campo) {
  const valores = lista.map((e) => aNumero(e[campo])).filter((v) => v > 0);
  return valores.length ? +(valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(3) : null;
}

// Fecha de hoy en hora peninsular (AAAA-MM-DD)
function hoyMadrid() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

// Media nacional del GLP de un día, a partir del historial guardado (para comparar con ayer)
async function mediaHistorial(fecha) {
  let nombres = [];
  try { nombres = await readdir(DIR_HISTORIAL); } catch { return null; }
  const precios = [];
  for (const n of nombres) {
    try {
      const r = JSON.parse(await readFile(path.join(DIR_HISTORIAL, n), "utf8")).find((x) => x.fecha === fecha);
      if (r && r.precio > 0) precios.push(r.precio);
    } catch { /* fichero dañado */ }
  }
  return precios.length > 100 ? +(precios.reduce((a, b) => a + b, 0) / precios.length).toFixed(4) : null;
}

// Guarda el precio de una fecha en el historial de cada gasolinera.
// soloSiFalta: no sobrescribe un registro existente (para rellenar días pasados).
async function guardarEnHistorial(estaciones, fecha, soloSiFalta = false) {
  await mkdir(DIR_HISTORIAL, { recursive: true });
  let n = 0;
  for (const e of estaciones) {
    const precio = aNumero(e[CAMPO_GLP]);
    if (!(precio > 0) || !/^\d+$/.test(e.IDEESS)) continue;
    const fichero = path.join(DIR_HISTORIAL, `${e.IDEESS}.json`);
    let registros = [];
    try { registros = JSON.parse(await readFile(fichero, "utf8")); } catch { /* nuevo */ }
    if (soloSiFalta && registros.some((r) => r.fecha === fecha)) continue;
    registros = registros.filter((r) => r.fecha !== fecha);
    registros.push({ fecha, precio });
    registros.sort((a, b) => a.fecha.localeCompare(b.fecha));
    registros = registros.slice(-DIAS_HISTORIAL);
    await writeFile(fichero, JSON.stringify(registros));
    n++;
  }
  return n;
}

// Gasolineras cuyo precio de hoy es distinto del último registrado antes de hoy (como mucho hace 3 días).
// Devuelve [IDEESS, precio anterior, fecha anterior] para el mensaje de cambios del canal de Telegram.
async function cambiosDesdeAyer(estaciones, hoy) {
  const limite = new Date(Date.parse(hoy + "T12:00:00Z") - 3 * 864e5).toISOString().slice(0, 10);
  const cambios = [];
  for (const e of estaciones) {
    const precio = aNumero(e[CAMPO_GLP]);
    if (!(precio > 0) || !/^\d+$/.test(e.IDEESS)) continue;
    let registros = [];
    try { registros = JSON.parse(await readFile(path.join(DIR_HISTORIAL, `${e.IDEESS}.json`), "utf8")); } catch { continue; }
    const previo = registros.filter((r) => r.fecha < hoy && r.fecha >= limite).pop();
    if (previo && Math.abs(previo.precio - precio) >= 0.0005) cambios.push([e.IDEESS, previo.precio, previo.fecha]);
  }
  return cambios;
}

// Cuántas gasolineras tienen registro en cada fecha
async function fechasEnHistorial() {
  const cuenta = {};
  let nombres = [];
  try { nombres = await readdir(DIR_HISTORIAL); } catch { return cuenta; }
  for (const n of nombres) {
    try { for (const r of JSON.parse(await readFile(path.join(DIR_HISTORIAL, n), "utf8"))) cuenta[r.fecha] = (cuenta[r.fecha] || 0) + 1; } catch { /* dañado */ }
  }
  return cuenta;
}

// Si falta algún día de la última semana (por ejemplo, porque falló una ejecución), se rellena con el
// histórico oficial del Ministerio: EstacionesTerrestresHist/{dd-mm-aaaa}
async function rellenarHuecos(hoy) {
  const cuenta = await fechasEnHistorial();
  const conDatos = Object.keys(cuenta).filter((f) => cuenta[f] >= 100).sort();
  if (!conDatos.length) return;
  const primera = conDatos[0];
  for (let k = 7; k >= 1; k--) {
    const f = new Date(Date.parse(hoy + "T12:00:00Z") - k * 864e5).toISOString().slice(0, 10);
    if (f < primera || (cuenta[f] || 0) >= 100) continue;
    const [a, m, d] = f.split("-");
    try {
      const res = await fetch(`${URL_MINISTERIO.replace("EstacionesTerrestres/", "EstacionesTerrestresHist/")}${d}-${m}-${a}`, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const lista = (await res.json()).ListaEESSPrecio || [];
      const conGLP = lista.filter((e) => aNumero(e[CAMPO_GLP]) > 0);
      if (conGLP.length < 100) throw new Error(`solo ${conGLP.length} con GLP`);
      const n = await guardarEnHistorial(conGLP, f, true);
      console.log(`Historial: rellenado el ${f} con el histórico del Ministerio (${n} gasolineras).`);
    } catch (e) {
      console.warn(`Historial: no se pudo rellenar el ${f}: ${e.message}`);
    }
  }
}

async function main() {
  const datos = process.argv[2]
    ? JSON.parse(await readFile(process.argv[2], "utf8"))
    : await descargar();
  const todas = datos.ListaEESSPrecio;

  const conGLP = todas
    .filter((e) => aNumero(e[CAMPO_GLP]) > 0)
    .map((e) => Object.fromEntries(CAMPOS.map((c) => [c, (e[c] ?? "").toString().trim()])));

  const hoy = hoyMadrid();
  if (!process.argv[2]) await rellenarHuecos(hoy);
  const n = await guardarEnHistorial(conGLP, hoy);

  const ayer = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date(Date.now() - 864e5));
  const salida = {
    Fecha: datos.Fecha,
    generado: new Date().toISOString(),
    medias: {
      glp: media(todas, CAMPO_GLP),
      gasoleoA: media(todas, "Precio Gasoleo A"),
      gasolina95: media(todas, "Precio Gasolina 95 E5"),
    },
    mediaGlpAyer: await mediaHistorial(ayer),
    totalEstaciones: todas.length,
    cambios: await cambiosDesdeAyer(conGLP, hoy),
    campos: CAMPOS,
    filas: conGLP.map((e) => CAMPOS.map((c) => e[c])),
  };

  await mkdir(DIR_DATOS, { recursive: true });
  await writeFile(path.join(DIR_DATOS, "precios.json"), JSON.stringify(salida));
  console.log(`OK: ${conGLP.length} gasolineras con GLP (de ${todas.length}); historial de ${n}. Medias:`, salida.medias);
}

main().catch((e) => {
  console.error("Error actualizando datos:", e);
  process.exit(1);
});
