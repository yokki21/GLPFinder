// Genera páginas estáticas indexables a partir de public/data/precios.json:
//   public/glp/index.html                         -> precio del GLP hoy en España (todas las provincias)
//   public/glp/<provincia>/index.html             -> gasolineras de GLP de cada provincia
//   public/glp/<provincia>/<municipio>/index.html -> municipios con varias gasolineras
//   public/gasolinera/<rotulo>-<municipio>-<id>/  -> ficha de cada gasolinera (precio, evolución y cercanas)
//   public/sitemap.xml                            -> mapa del sitio con todas las páginas
// Se ejecuta en GitHub Actions después de scripts/actualizar_datos.mjs.

import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const SITE_URL = (process.env.SITE_URL || "https://glpfinder.es/").replace(/\/?$/, "/");
const PUBLIC = "public";
const MIN_MUNICIPIO = 3; // gasolineras mínimas para que un municipio tenga página propia

const CAMPO_GLP = "Precio Gases licuados del petróleo";

const CCAA = {
  "01": "Andalucía", "02": "Aragón", "03": "Asturias", "04": "Illes Balears", "05": "Canarias",
  "06": "Cantabria", "07": "Castilla-La Mancha", "08": "Castilla y León", "09": "Cataluña",
  "10": "Comunitat Valenciana", "11": "Extremadura", "12": "Galicia", "13": "Comunidad de Madrid",
  "14": "Región de Murcia", "15": "Navarra", "16": "País Vasco", "17": "La Rioja", "18": "Ceuta", "19": "Melilla",
};

// Código INE de provincia -> nombre habitual y comunidad
const PROVINCIAS = {
  "01": ["Álava", "16"], "02": ["Albacete", "07"], "03": ["Alicante", "10"], "04": ["Almería", "01"],
  "05": ["Ávila", "08"], "06": ["Badajoz", "11"], "07": ["Illes Balears", "04"], "08": ["Barcelona", "09"],
  "09": ["Burgos", "08"], "10": ["Cáceres", "11"], "11": ["Cádiz", "01"], "12": ["Castellón", "10"],
  "13": ["Ciudad Real", "07"], "14": ["Córdoba", "01"], "15": ["A Coruña", "12"], "16": ["Cuenca", "07"],
  "17": ["Girona", "09"], "18": ["Granada", "01"], "19": ["Guadalajara", "07"], "20": ["Gipuzkoa", "16"],
  "21": ["Huelva", "01"], "22": ["Huesca", "02"], "23": ["Jaén", "01"], "24": ["León", "08"],
  "25": ["Lleida", "09"], "26": ["La Rioja", "17"], "27": ["Lugo", "12"], "28": ["Madrid", "13"],
  "29": ["Málaga", "01"], "30": ["Murcia", "14"], "31": ["Navarra", "15"], "32": ["Ourense", "12"],
  "33": ["Asturias", "03"], "34": ["Palencia", "08"], "35": ["Las Palmas", "05"], "36": ["Pontevedra", "12"],
  "37": ["Salamanca", "08"], "38": ["Santa Cruz de Tenerife", "05"], "39": ["Cantabria", "06"], "40": ["Segovia", "08"],
  "41": ["Sevilla", "01"], "42": ["Soria", "08"], "43": ["Tarragona", "09"], "44": ["Teruel", "02"],
  "45": ["Toledo", "07"], "46": ["Valencia", "10"], "47": ["Valladolid", "08"], "48": ["Bizkaia", "16"],
  "49": ["Zamora", "08"], "50": ["Zaragoza", "02"], "51": ["Ceuta", "18"], "52": ["Melilla", "19"],
};

// "pertenece a ..." con el artículo correcto; vacío en comunidades uniprovinciales
const PERTENECE = { "04": "a las Illes Balears", "10": "a la Comunitat Valenciana", "16": "al País Vasco" };
const UNIPROVINCIALES = ["03", "06", "13", "14", "15", "17", "18", "19"];
const frasePertenece = (nombre, ccaa) => UNIPROVINCIALES.includes(ccaa) ? "" : ` ${nombre} pertenece ${PERTENECE[ccaa] || "a " + CCAA[ccaa]}.`;

const LOGOS = ["REPSOL", "CEPSA", "MOEVE", "GALP", "PLENOIL", "PETROPRIX", "BP", "SHELL", "BALLENOIL"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// ---------- utilidades ----------
const num = (t) => parseFloat(String(t ?? "").replace(",", "."));
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const euro = (v, dec = 3) => v.toFixed(dec).replace(".", ",") + " €";
const slug = (t) => String(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
// Misma regla que en index.html (fichaEstacion) para que los enlaces del mapa coincidan
const slugEstacion = (rotulo, municipio, id) => [slug(rotulo) || "gasolinera", slug(municipio), id].filter(Boolean).join("-");
const media = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const titulo = (t) => String(t).toLowerCase().replace(/(^|[\s(/-])([a-záéíóúñü])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(De|Del|La|Las|Los|El|Y|E)\b/g, (m) => m.toLowerCase()).replace(/^./, (c) => c.toUpperCase());

function logo(rotulo) {
  const r = String(rotulo || "").toUpperCase();
  const m = LOGOS.find((x) => r.includes(x));
  return (m === "CEPSA" ? "cepsa" : m ? m.toLowerCase() : "default") + ".webp";
}

function fechaLarga(f) {
  // "20/10/2026 23:32:05" -> "20 de octubre de 2026 a las 23:32"
  const [dia, hora] = String(f).split(" ");
  const [d, m, a] = dia.split("/").map(Number);
  const [hh, mm] = String(hora).split(":");
  return `${d} de ${MESES[m - 1]} de ${a} a las ${hh.padStart(2, "0")}:${mm}`;
}

// ---------- plantilla común ----------
function pagina({ prefijo, ruta, title, description, h1, lead, cuerpo, jsonld = [] }) {
  const url = SITE_URL + ruta;
  return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#0E1116">
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="${url}">
    <link rel="manifest" href="${prefijo}manifest.webmanifest">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="glpfinder">
    <meta property="og:locale" content="es_ES">
    <meta property="og:title" content="${esc(h1)}">
    <meta property="og:description" content="${esc(description)}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${SITE_URL}img/og.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" type="image/svg+xml" href="${prefijo}img/favicon.svg">
    <link rel="icon" type="image/png" sizes="32x32" href="${prefijo}img/favicon-32.png">
    <link rel="apple-touch-icon" href="${prefijo}img/apple-touch-icon.png">
    <link rel="stylesheet" href="${prefijo}styles.css?v=17">
    <script data-goatcounter="https://glpfinder.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
${jsonld.map((j) => `    <script type="application/ld+json">${JSON.stringify(j)}</script>`).join("\n")}
</head>
<body>
    <header>
        <a href="${prefijo}index.html" class="logo" aria-label="glpfinder, ir al mapa">
            <img src="${prefijo}img/logo-negativo.svg" width="105" height="26" alt="glpfinder">
        </a>
        <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="menu-principal" aria-label="Abrir menú">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
        </button>
        <nav class="nav-links" id="menu-principal" aria-label="Principal">
            <a href="${prefijo}index.html">Mapa</a>
            <a href="${prefijo}glp/" aria-current="page">Precios</a>
            <a href="${prefijo}favoritas.html">Mis favoritas</a>
            <a href="${prefijo}datos.html">Mi vehículo</a>
            <a href="${prefijo}contacto.html">Contacto</a>
            <a href="${prefijo}auth.html" id="nav-auth">Acceder</a>
        </nav>
    </header>

    <div class="page-band">
        <div class="page-band-inner">
${cuerpo.migas}
            <h1>${esc(h1)}</h1>
            <p>${lead}</p>
        </div>
    </div>

    <main class="seo-main">
${cuerpo.html}
    </main>

    <footer class="pie">
        <p>Precios oficiales del <a href="https://geoportalgasolineras.es/" rel="noopener">Ministerio para la Transición Ecológica y el Reto Demográfico</a>. glpfinder no está vinculado a ninguna marca de carburantes.</p>
        <p><a href="${prefijo}index.html">Mapa</a> · <a href="${prefijo}glp/">Precios por provincia</a> · <a href="${prefijo}contacto.html">Contacto</a></p>
        <p><a href="${prefijo}aviso-legal.html">Aviso legal</a> · <a href="${prefijo}privacidad.html">Privacidad</a> · <a href="${prefijo}cookies.html">Cookies</a></p>
    </footer>
    <script src="${prefijo}nav.js" defer></script>
</body>
</html>
`;
}

function migas(prefijo, items) {
  const html = items.map((it, i) => i === items.length - 1
    ? `<span aria-current="page">${esc(it.nombre)}</span>`
    : `<a href="${it.href}">${esc(it.nombre)}</a>`).join(' <span aria-hidden="true">/</span> ');
  return `            <nav class="migas" aria-label="Estás en">${html}</nav>`;
}

function jsonMigas(items) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.nombre, item: SITE_URL + it.ruta })),
  };
}

function jsonFAQ(pares) {
  return {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: pares.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

function tablaEstaciones(lista, prefijo, { conMunicipio = true, mediaRef }) {
  const filas = lista.map((e, i) => {
    const cls = e.precio <= mediaRef - 0.015 ? "barato" : e.precio >= mediaRef + 0.015 ? "caro" : "medio";
    const mapa = `${prefijo}index.html?id=${encodeURIComponent(e.id)}&lat=${e.lat}&lng=${e.lng}`;
    return `            <tr>
                <td class="t-pos">${i + 1}</td>
                <td class="t-est"><div class="t-est-in"><img src="${prefijo}img/marcas/${logo(e.rotulo)}" alt="" width="22" height="22" loading="lazy"><span><a class="t-ficha" href="${prefijo}gasolinera/${e.slug}/"><strong>${esc(e.rotulo)}</strong></a><small>${esc(e.direccion)}${conMunicipio ? ", " + esc(e.municipio) : ""}</small></span></div></td>
                <td class="t-precio"><span class="tag tag--${cls}">${euro(e.precio)}</span></td>
                <td class="t-mapa"><a href="${mapa}" aria-label="Ver ${esc(e.rotulo)} en el mapa">Ver en el mapa</a></td>
            </tr>`;
  }).join("\n");
  return `        <div class="tabla-envoltorio">
        <table class="tabla-precios">
            <thead><tr><th scope="col">#</th><th scope="col">Gasolinera</th><th scope="col">Precio GLP</th><th scope="col"><span class="sr-only">Mapa</span></th></tr></thead>
            <tbody>
${filas}
            </tbody>
        </table>
        </div>`;
}

function resumen(items) {
  return `        <div class="seo-resumen">
${items.map(([v, l]) => `            <div><strong>${v}</strong><span>${l}</span></div>`).join("\n")}
        </div>`;
}

function faqHTML(pares) {
  return `        <section class="seo-bloque">
            <h2>Preguntas frecuentes</h2>
${pares.map(([q, a]) => `            <details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("\n")}
        </section>`;
}

const comparar = (m, nac) => {
  const d = m - nac;
  if (Math.abs(d) < 0.005) return "en la media nacional";
  return `${euro(Math.abs(d))} ${d < 0 ? "por debajo" : "por encima"} de la media nacional`;
};

// ---------- ficha de una gasolinera ----------
const R_TIERRA = 6371;
function distanciaKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TIERRA * Math.asin(Math.sqrt(h));
}
const km = (d) => (d < 10 ? d.toFixed(1) : Math.round(d).toString()).replace(".", ",") + " km";
const cts = (d) => {
  const c = Math.round(Math.abs(d) * 1000) / 10;
  return (Number.isInteger(c) ? String(c) : c.toFixed(1).replace(".", ",")) + (c === 1 ? " céntimo" : " céntimos");
};
const fechaCorta = (iso) => { const [, m, d] = iso.split("-").map(Number); return `${d} ${MESES[m - 1].slice(0, 3)}`; };

async function leerHistorial(id) {
  const f = path.join(PUBLIC, "data", "historial", `${id}.json`);
  if (!existsSync(f)) return [];
  try { return JSON.parse(await readFile(f, "utf8")).filter((r) => r.precio > 0); } catch { return []; }
}

// Precio de hace n días (el último registro anterior o igual a esa fecha)
function precioHace(hist, hoyISO, dias) {
  const lim = new Date(Date.parse(hoyISO) - dias * 864e5).toISOString().slice(0, 10);
  const prev = hist.filter((r) => r.fecha <= lim);
  return prev.length ? prev[prev.length - 1].precio : null;
}

// Gráfica SVG estática (sin JavaScript): se ve al instante y la lee cualquier navegador
function graficaSVG(hist) {
  const W = 640, H = 220, L = 66, R = 14, T = 14, B = 30;
  const xs = hist.map((r) => Date.parse(r.fecha));
  const ys = hist.map((r) => r.precio);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 0.02) { const c = (y0 + y1) / 2; y0 = c - 0.01; y1 = c + 0.01; }
  const pad = (y1 - y0) * 0.12; y0 -= pad; y1 += pad;
  const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 864e5 : xs[xs.length - 1];
  const X = (t) => L + ((t - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const pts = hist.map((r, i) => `${X(xs[i]).toFixed(1)},${Y(r.precio).toFixed(1)}`);
  const linea = hist.length === 1 ? `M${L},${Y(ys[0]).toFixed(1)} H${W - R}` : `M${pts.join(" L")}`;
  const area = hist.length === 1 ? "" : `<path d="${linea} L${X(x1).toFixed(1)},${H - B} L${L},${H - B} Z" class="g-area"/>`;
  const marcas = [y0 + (y1 - y0) * 0.1, (y0 + y1) / 2, y1 - (y1 - y0) * 0.1]
    .map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="g-rejilla"/><text x="0" y="${(Y(v) + 4).toFixed(1)}">${v.toFixed(3).replace(".", ",")}</text>`).join("");
  const ult = hist[hist.length - 1];
  return `<svg class="grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del precio del GLP desde el ${fechaCorta(hist[0].fecha)} hasta el ${fechaCorta(ult.fecha)}">
                ${marcas}${area}<path d="${linea}" class="g-linea"/>
                <circle cx="${X(xs[xs.length - 1]).toFixed(1)}" cy="${Y(ult.precio).toFixed(1)}" r="4.5" class="g-punto"/>
                <text x="${L}" y="${H - 8}">${fechaCorta(hist[0].fecha)}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">${fechaCorta(ult.fecha)}</text>
            </svg>`;
}

async function fichaEstacion(e, { estaciones, infoProv, infoMun, mediaNac, fecha, hoyISO }) {
  const prov = infoProv[e.prov];
  const mun = infoMun[`${e.prov}|${e.municipio}`];
  const prefijo = "../../";
  const ruta = `gasolinera/${e.slug}/`;
  const pos = prov.lista.indexOf(e) + 1;
  const nProv = prov.lista.length;

  const hist = (await leerHistorial(e.id)).slice(-180);
  const hace7 = precioHace(hist, hoyISO, 7), hace30 = precioHace(hist, hoyISO, 30);
  const ult90 = hist.slice(-90).map((r) => r.precio);

  const cercanas = estaciones.filter((o) => o !== e).map((o) => ({ ...o, d: distanciaKm(e, o) }))
    .sort((a, b) => a.d - b.d).slice(0, 6);
  const masBarataCerca = cercanas.filter((o) => o.d <= 15 && o.precio < e.precio - 0.0005).sort((a, b) => a.precio - b.precio)[0];

  const refZona = mun && mun.n >= 2 ? { nombre: e.municipio, media: mun.media, tipo: "municipio" } : { nombre: prov.nombre, media: prov.media, tipo: "provincia" };
  const dif = e.precio - refZona.media;
  const cls = dif <= -0.015 ? "barato" : dif >= 0.015 ? "caro" : "medio";
  const fraseZona = Math.abs(dif) < 0.0005 ? `justo en la media ${refZona.tipo === "municipio" ? "del municipio" : "de la provincia"}`
    : `${cts(dif)} ${dif < 0 ? "más barata" : "más cara"} que la media ${refZona.tipo === "municipio" ? "de " + refZona.nombre : "de la provincia"} (${euro(refZona.media)})`;
  let fraseTendencia = "";
  if (hace7 != null && Math.abs(e.precio - hace7) >= 0.0005) fraseTendencia = `En la última semana ha ${e.precio < hace7 ? "bajado" : "subido"} ${cts(e.precio - hace7)}.`;
  else if (hace7 != null) fraseTendencia = "El precio no ha cambiado en la última semana.";

  const nombreCorto = `${e.rotulo} ${e.municipio}`;
  const lugar = `${e.direccion}, ${e.municipio} (${prov.nombre})`;
  const mapa = `${prefijo}index.html?id=${encodeURIComponent(e.id)}&lat=${e.lat}&lng=${e.lng}`;

  const items = [{ nombre: "Precios del GLP", href: "../../glp/", ruta: "glp/" }, { nombre: prov.nombre, href: `../../glp/${prov.sp}/`, ruta: `glp/${prov.sp}/` }];
  if (mun && mun.ruta) items.push({ nombre: e.municipio, href: `../../${mun.ruta}`, ruta: mun.ruta });
  items.push({ nombre: e.rotulo, href: "./", ruta });

  const faq = [
    [`¿Cuánto cuesta el GLP en ${nombreCorto}?`, `Según los precios oficiales del ${fecha}, el GLP (autogás) cuesta ${euro(e.precio)} el litro en ${e.rotulo}, ${lugar}.`],
    [`¿Es barata la gasolinera ${nombreCorto}?`, `Está ${fraseZona}. Es la ${pos}.ª más barata de las ${nProv} gasolineras con GLP de ${prov.nombre}.`],
    [`¿Hay GLP más barato cerca de ${e.rotulo} ${e.municipio}?`, masBarataCerca
      ? `Sí: ${masBarataCerca.rotulo} en ${masBarataCerca.municipio}, a ${km(masBarataCerca.d)}, lo vende a ${euro(masBarataCerca.precio)} el litro.`
      : "No hay ninguna gasolinera con el GLP más barato en 15 km a la redonda."],
  ];

  const grafica = hist.length >= 2 ? graficaSVG(hist)
    : `<p class="ficha-vacio">Guardamos el precio de esta gasolinera cada día desde el ${fechaCorta(hist[0]?.fecha || hoyISO)}. En unos días verás aquí cómo evoluciona.</p>`;
  const cifrasHist = hist.length >= 2 ? `
            <div class="ficha-cifras">
                <div><span>Hace 7 días</span><strong>${hace7 != null ? euro(hace7) : "—"}</strong></div>
                <div><span>Hace 30 días</span><strong>${hace30 != null ? euro(hace30) : "—"}</strong></div>
                <div><span>Mínimo ${ult90.length >= 90 ? "90 días" : "del periodo"}</span><strong>${euro(Math.min(...ult90))}</strong></div>
                <div><span>Máximo ${ult90.length >= 90 ? "90 días" : "del periodo"}</span><strong>${euro(Math.max(...ult90))}</strong></div>
            </div>` : "";

  const listaCercanas = cercanas.map((o) => {
    const c = o.precio <= e.precio - 0.0005 ? "barato" : o.precio >= e.precio + 0.0005 ? "caro" : "medio";
    return `                <li><img src="${prefijo}img/marcas/${logo(o.rotulo)}" alt="" width="22" height="22" loading="lazy"><span class="cerca-txt"><a href="../${o.slug}/">${esc(o.rotulo)}</a><small>${esc(o.municipio)} · a ${km(o.d)}</small></span><span class="tag tag--${c}">${euro(o.precio)}</span></li>`;
  }).join("\n");

  const jsonGas = {
    "@context": "https://schema.org", "@type": "GasStation", name: `${e.rotulo} ${e.municipio}`, url: SITE_URL + ruta,
    address: { "@type": "PostalAddress", streetAddress: e.direccion, postalCode: e.cp || undefined, addressLocality: e.municipio, addressRegion: prov.nombre, addressCountry: "ES" },
    geo: { "@type": "GeoCoordinates", latitude: +e.lat.toFixed(6), longitude: +e.lng.toFixed(6) },
    ...(e.rotulo !== "Sin rótulo" ? { brand: { "@type": "Brand", name: e.rotulo } } : {}),
  };

  const html = pagina({
    prefijo, ruta,
    title: `GLP en ${e.rotulo} ${e.municipio}: ${euro(e.precio)}/L hoy | glpfinder`,
    description: `Precio del GLP hoy en ${e.rotulo}, ${lugar}: ${euro(e.precio)} el litro. ${fraseZona.charAt(0).toUpperCase() + fraseZona.slice(1)}. Evolución del precio y gasolineras con autogás cercanas.`,
    h1: `GLP en ${e.rotulo} ${e.municipio}`,
    lead: `${esc(lugar)}. Precio oficial del ${esc(fecha)}.`,
    jsonld: [jsonMigas(items), jsonGas, jsonFAQ(faq)],
    cuerpo: {
      migas: migas(prefijo, items),
      html: `        <div class="seo-resumen">
            <div><strong class="precio-${cls}">${euro(e.precio)}</strong><span>Precio del GLP hoy</span></div>
            <div><strong>${euro(refZona.media)}</strong><span>Media ${refZona.tipo === "municipio" ? "en " + esc(e.municipio) : "en la provincia"}</span></div>
            <div><strong>${pos}.ª</strong><span>más barata de ${nProv} en ${esc(prov.nombre)}</span></div>
        </div>
        <div class="ficha-acciones">
            <a class="btn btn--primario" href="${mapa}">Ver en el mapa</a>
            <a class="btn btn--verde" href="https://www.google.com/maps/dir/?api=1&amp;destination=${e.lat},${e.lng}" rel="noopener" target="_blank">Cómo llegar con Google Maps</a>
            <a class="btn btn--azul" href="https://waze.com/ul?ll=${e.lat},${e.lng}&amp;navigate=yes" rel="noopener" target="_blank">Ir con Waze</a>
        </div>
        <p class="seo-texto">El GLP en <strong>${esc(e.rotulo)}</strong>, en ${esc(e.direccion)}, ${esc(e.municipio)}, cuesta hoy ${euro(e.precio)} el litro, ${esc(fraseZona)}. Es la ${pos}.ª gasolinera con autogás más barata de las ${nProv} de ${esc(prov.nombre)}${Math.abs(e.precio - mediaNac) >= 0.005 ? ` y está ${comparar(e.precio, mediaNac)} (${euro(mediaNac)})` : ""}. ${fraseTendencia} Llenar un depósito de 40 litros cuesta unos ${euro(e.precio * 40, 2)}.</p>
        <section class="seo-bloque">
            <h2>Evolución del precio</h2>
            ${grafica}${cifrasHist}
        </section>
        <section class="seo-bloque">
            <h2>Gasolineras con GLP cerca</h2>
            <ul class="lista-cercanas">
${listaCercanas}
            </ul>
            <p class="ficha-mas"><a href="../../${mun && mun.ruta ? mun.ruta : `glp/${prov.sp}/`}">Ver todas las gasolineras de GLP de ${esc(mun && mun.ruta ? e.municipio : prov.nombre)}</a></p>
        </section>
${faqHTML(faq)}`,
    },
  });
  await mkdir(path.join(PUBLIC, ruta), { recursive: true });
  await writeFile(path.join(PUBLIC, ruta, "index.html"), html);
}

// ---------- principal ----------
async function main() {
  const datos = JSON.parse(await readFile(path.join(PUBLIC, "data", "precios.json"), "utf8"));
  datos.ListaEESSPrecio = datos.filas.map((f) => Object.fromEntries(datos.campos.map((c, i) => [c, f[i]])));
  const fecha = fechaLarga(datos.Fecha);
  const hoyISO = new Date().toISOString().slice(0, 10);

  const estaciones = datos.ListaEESSPrecio.map((e) => ({
    id: e.IDEESS, rotulo: (e["Rótulo"] || "Sin rótulo").trim(), direccion: titulo(e["Dirección"] || ""),
    municipio: (e.Municipio || titulo(e.Localidad || "")).trim(), cp: e["C.P."],
    lat: num(e.Latitud), lng: num(e["Longitud (WGS84)"]), precio: num(e[CAMPO_GLP]),
    prov: String(e.IDProvincia || String(e["C.P."] || "").padStart(5, "0").slice(0, 2)).padStart(2, "0"),
  })).filter((e) => e.precio > 0 && PROVINCIAS[e.prov] && isFinite(e.lat) && isFinite(e.lng));
  for (const e of estaciones) e.slug = slugEstacion(e.rotulo, e.municipio, e.id);

  if (estaciones.length < 100) throw new Error(`Muy pocas estaciones (${estaciones.length}); no se regeneran las páginas`);

  const mediaNac = media(estaciones.map((e) => e.precio));
  const ordenadas = [...estaciones].sort((a, b) => a.precio - b.precio);

  // Agrupar por provincia
  const porProv = {};
  for (const e of estaciones) (porProv[e.prov] ||= []).push(e);

  await rm(path.join(PUBLIC, "glp"), { recursive: true, force: true });
  await rm(path.join(PUBLIC, "gasolinera"), { recursive: true, force: true });
  const infoProv = {};  // cod -> { nombre, sp, ccaa, media, lista ordenada }
  const infoMun = {};   // "cod|municipio" -> { media, n, ruta (si tiene página) }
  const urls = [{ loc: SITE_URL, freq: "hourly", pri: "1.0" }, { loc: SITE_URL + "glp/", freq: "hourly", pri: "0.9" }];
  const resumenProv = [];

  for (const [cod, lista] of Object.entries(porProv)) {
    const [nombre, ccaa] = PROVINCIAS[cod];
    const sp = slug(nombre);
    lista.sort((a, b) => a.precio - b.precio);
    const m = media(lista.map((e) => e.precio));
    const barata = lista[0];
    resumenProv.push({ cod, nombre, ccaa, sp, n: lista.length, media: m, min: barata.precio });
    infoProv[cod] = { nombre, sp, ccaa, media: m, lista };

    // Municipios con varias gasolineras
    const porMun = {};
    for (const e of lista) (porMun[e.municipio] ||= []).push(e);
    for (const [mun, l] of Object.entries(porMun)) {
      infoMun[`${cod}|${mun}`] = { media: media(l.map((e) => e.precio)), n: l.length, lista: l, ruta: l.length >= MIN_MUNICIPIO ? `glp/${sp}/${slug(mun)}/` : null };
    }
    const municipios = Object.entries(porMun).filter(([, l]) => l.length >= MIN_MUNICIPIO)
      .map(([mun, l]) => ({ mun, l, sm: slug(mun), media: media(l.map((e) => e.precio)) }))
      .sort((a, b) => a.mun.localeCompare(b.mun, "es"));

    const prefijo = "../../";
    const rutaProv = `glp/${sp}/`;
    const faq = [
      [`¿Cuál es la gasolinera de GLP más barata de ${nombre} hoy?`, `Según los precios oficiales del ${fecha}, es ${barata.rotulo} (${barata.direccion}, ${barata.municipio}), con el autogás a ${euro(barata.precio)} el litro.`],
      [`¿Cuál es el precio medio del GLP en ${nombre}?`, `El precio medio del GLP en ${nombre} es de ${euro(m)} el litro, ${comparar(m, mediaNac)} (${euro(mediaNac)}).`],
      [`¿Cuántas gasolineras venden GLP en ${nombre}?`, `Hay ${lista.length} ${lista.length === 1 ? "gasolinera" : "gasolineras"} con autogás (GLP) en la provincia de ${nombre}.`],
      ["¿Cada cuánto se actualizan los precios?", "glpfinder descarga los precios oficiales del Ministerio cada dos horas. Las gasolineras están obligadas a comunicar cualquier cambio de precio."],
    ];
    const items = [{ nombre: "Precios del GLP", href: "../", ruta: "glp/" }, { nombre, href: "./", ruta: rutaProv }];
    const htmlMun = municipios.length ? `        <section class="seo-bloque">
            <h2>GLP por municipio en ${esc(nombre)}</h2>
            <ul class="lista-enlaces">
${municipios.map((x) => `                <li><a href="${x.sm}/">${esc(x.mun)}</a><span>${x.l.length} gasolineras · media ${euro(x.media)}</span></li>`).join("\n")}
            </ul>
        </section>` : "";

    const htmlProv = pagina({
      prefijo, ruta: rutaProv,
      title: `Gasolineras de GLP en ${nombre}: precio del autogás hoy | glpfinder`,
      description: `Precio del GLP hoy en ${nombre}: ${lista.length} gasolineras con autogás ordenadas de más barata a más cara. La más barata, ${barata.rotulo} en ${barata.municipio}, a ${euro(barata.precio)}/L.`,
      h1: `Gasolineras de GLP en ${nombre}`,
      lead: `Precio del autogás hoy en las ${lista.length} gasolineras de la provincia, de la más barata a la más cara. Actualizado el ${esc(fecha)}.`,
      jsonld: [jsonMigas(items), jsonFAQ(faq)],
      cuerpo: {
        migas: migas(prefijo, items),
        html: `${resumen([[euro(barata.precio), "La más barata"], [euro(m), "Precio medio"], [String(lista.length), "Gasolineras con GLP"]])}
        <p class="seo-texto">La gasolinera de GLP más barata de ${esc(nombre)} es <strong>${esc(barata.rotulo)}</strong>, en ${esc(barata.direccion)} (${esc(barata.municipio)}), a ${euro(barata.precio)} el litro. El precio medio en la provincia es de ${euro(m)}, ${comparar(m, mediaNac)}.${esc(frasePertenece(nombre, ccaa))}</p>
        <section class="seo-bloque">
            <h2>Todas las gasolineras de GLP en ${esc(nombre)}</h2>
${tablaEstaciones(lista, prefijo, { mediaRef: m })}
        </section>
${htmlMun}
${faqHTML(faq)}
        <p class="seo-cta"><a class="btn btn--primario" href="${prefijo}index.html">Abrir el mapa de precios</a></p>`,
      },
    });
    await mkdir(path.join(PUBLIC, rutaProv), { recursive: true });
    await writeFile(path.join(PUBLIC, rutaProv, "index.html"), htmlProv);
    urls.push({ loc: SITE_URL + rutaProv, freq: "hourly", pri: "0.8" });

    // Páginas de municipio
    for (const x of municipios) {
      const pm = "../../../";
      const rutaMun = `${rutaProv}${x.sm}/`;
      const bm = x.l[0];
      const faqM = [
        [`¿Dónde está el GLP más barato en ${x.mun}?`, `Según los precios del ${fecha}, en ${bm.rotulo} (${bm.direccion}), a ${euro(bm.precio)} el litro.`],
        [`¿Cuánto cuesta el GLP en ${x.mun}?`, `El precio medio del autogás en ${x.mun} es de ${euro(x.media)} el litro, ${comparar(x.media, mediaNac)}.`],
      ];
      const itemsM = [...items.map((it, i) => ({ ...it, href: i === 0 ? "../../" : "../" })), { nombre: x.mun, href: "./", ruta: rutaMun }];
      const htmlMunP = pagina({
        prefijo: pm, ruta: rutaMun,
        title: `GLP en ${x.mun}: gasolineras con autogás y precio hoy | glpfinder`,
        description: `Precio del GLP hoy en ${x.mun} (${nombre}): ${x.l.length} gasolineras con autogás. La más barata, ${bm.rotulo}, a ${euro(bm.precio)}/L.`,
        h1: `GLP en ${x.mun}`,
        lead: `Las ${x.l.length} gasolineras con autogás de ${esc(x.mun)} (${esc(nombre)}), de la más barata a la más cara. Actualizado el ${esc(fecha)}.`,
        jsonld: [jsonMigas(itemsM), jsonFAQ(faqM)],
        cuerpo: {
          migas: migas(pm, itemsM),
          html: `${resumen([[euro(bm.precio), "La más barata"], [euro(x.media), "Precio medio"], [String(x.l.length), "Gasolineras con GLP"]])}
        <p class="seo-texto">En ${esc(x.mun)} el GLP más barato está en <strong>${esc(bm.rotulo)}</strong> (${esc(bm.direccion)}), a ${euro(bm.precio)} el litro. La media del municipio es de ${euro(x.media)}, ${comparar(x.media, mediaNac)}. <a href="../">Ver todas las gasolineras de ${esc(nombre)}</a>.</p>
        <section class="seo-bloque">
            <h2>Gasolineras de GLP en ${esc(x.mun)}</h2>
${tablaEstaciones(x.l, pm, { conMunicipio: false, mediaRef: x.media })}
        </section>
${faqHTML(faqM)}
        <p class="seo-cta"><a class="btn btn--primario" href="${pm}index.html">Abrir el mapa de precios</a></p>`,
        },
      });
      await mkdir(path.join(PUBLIC, rutaMun), { recursive: true });
      await writeFile(path.join(PUBLIC, rutaMun, "index.html"), htmlMunP);
      urls.push({ loc: SITE_URL + rutaMun, freq: "hourly", pri: "0.6" });
    }
  }

  // ---------- fichas de gasolinera ----------
  for (const e of estaciones) {
    await fichaEstacion(e, { estaciones, infoProv, infoMun, mediaNac, fecha, hoyISO });
    urls.push({ loc: `${SITE_URL}gasolinera/${e.slug}/`, freq: "daily", pri: "0.5" });
  }

  // ---------- página general ----------
  const porCCAA = {};
  for (const p of resumenProv) (porCCAA[p.ccaa] ||= []).push(p);
  const bloquesCCAA = Object.entries(porCCAA).sort((a, b) => CCAA[a[0]].localeCompare(CCAA[b[0]], "es")).map(([c, ps]) => `            <div class="ccaa-bloque">
                <h3>${esc(CCAA[c])}</h3>
                <ul class="lista-enlaces">
${ps.sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((p) => `                    <li><a href="${p.sp}/">${esc(p.nombre)}</a><span>${p.n} gasolineras · media ${euro(p.media)}</span></li>`).join("\n")}
                </ul>
            </div>`).join("\n");
  const provBarata = [...resumenProv].sort((a, b) => a.media - b.media)[0];
  const provCara = [...resumenProv].sort((a, b) => b.media - a.media)[0];
  const top = ordenadas.slice(0, 15).map((e) => ({ ...e, municipio: `${e.municipio} (${PROVINCIAS[e.prov][0]})` }));
  const faqG = [
    ["¿Cuál es el precio medio del GLP en España hoy?", `El precio medio del GLP (autogás) en España es de ${euro(mediaNac)} el litro según los datos oficiales del ${fecha}.`],
    ["¿Dónde está el GLP más barato de España?", `La gasolinera con el GLP más barato es ${ordenadas[0].rotulo} en ${ordenadas[0].municipio} (${PROVINCIAS[ordenadas[0].prov][0]}), a ${euro(ordenadas[0].precio)} el litro. Por provincias, la media más baja es la de ${provBarata.nombre} (${euro(provBarata.media)}).`],
    ["¿Cuántas gasolineras venden GLP en España?", `Hay ${estaciones.length} gasolineras con autogás en España según el registro del Ministerio.`],
    ["¿De dónde salen los precios?", "De la base de datos oficial del Ministerio para la Transición Ecológica, a la que las gasolineras están obligadas a comunicar sus precios. glpfinder la consulta cada dos horas."],
  ];
  const itemsG = [{ nombre: "Precios del GLP", href: "./", ruta: "glp/" }];
  const htmlG = pagina({
    prefijo: "../", ruta: "glp/",
    title: `Precio del GLP hoy en España por provincias | glpfinder`,
    description: `Precio medio del autogás hoy en España: ${euro(mediaNac)}/L. Consulta el GLP más barato de cada provincia y las ${estaciones.length} gasolineras con GLP, con precios oficiales actualizados.`,
    h1: "Precio del GLP hoy en España",
    lead: `Media nacional, las gasolineras más baratas y el precio del autogás en cada provincia. Actualizado el ${esc(fecha)}.`,
    jsonld: [jsonMigas(itemsG), jsonFAQ(faqG)],
    cuerpo: {
      migas: migas("../", itemsG),
      html: `${resumen([[euro(mediaNac), "Media nacional"], [euro(ordenadas[0].precio), "La más barata de España"], [String(estaciones.length), "Gasolineras con GLP"]])}
        <p class="seo-texto">Hoy el GLP cuesta de media ${euro(mediaNac)} el litro en España. La provincia con el autogás más barato es <strong>${esc(provBarata.nombre)}</strong> (${euro(provBarata.media)} de media) y la más cara, ${esc(provCara.nombre)} (${euro(provCara.media)}).</p>
        <section class="seo-bloque">
            <h2>Las 15 gasolineras de GLP más baratas de España</h2>
${tablaEstaciones(top, "../", { mediaRef: mediaNac })}
        </section>
        <section class="seo-bloque">
            <h2>Precio del GLP por provincia</h2>
            <div class="ccaa-rejilla">
${bloquesCCAA}
            </div>
        </section>
${faqHTML(faqG)}
        <p class="seo-cta"><a class="btn btn--primario" href="../index.html">Abrir el mapa de precios</a></p>`,
    },
  });
  await mkdir(path.join(PUBLIC, "glp"), { recursive: true });
  await writeFile(path.join(PUBLIC, "glp", "index.html"), htmlG);

  for (const pg of ["contacto.html", "aviso-legal.html", "privacidad.html", "cookies.html"]) urls.push({ loc: SITE_URL + pg, freq: "yearly", pri: "0.2" });
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${hoyISO}</lastmod><changefreq>${u.freq}</changefreq><priority>${u.pri}</priority></url>`).join("\n")}
</urlset>
`;
  await writeFile(path.join(PUBLIC, "sitemap.xml"), sitemap);
  await writeFile(path.join(PUBLIC, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}sitemap.xml\n`);
  console.log(`Páginas generadas: ${urls.length - 1} (provincias: ${resumenProv.length}, fichas: ${estaciones.length}).`);
}

main().catch((e) => { console.error("Error generando páginas:", e); process.exit(1); });
