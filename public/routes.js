// Cálculo y dibujo de rutas.
// Servidor principal: openrouteservice (gratuito hasta 2.000 rutas al día, 40 por minuto).
// Si falla o se agota el cupo, se usa el servidor público de OSRM como respaldo.
let mapInstance = null;
let rutaLayer = null;
let markerOrigen = null;

// La clave de openrouteservice va en la web porque es un sitio estático: está limitada por cupo,
// así que en el peor caso alguien la gastaría y entraría el respaldo de OSRM.
const ORS_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImExZDUzN2ZiZDFjYzQwMTViZjQ5ZWU5ODhiMDc4NzVkIiwiaCI6Im11cm11cjY0In0=';
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

export function initRouteModule(map) {
  mapInstance = map;
}

export function limpiarRuta() {
  if (!mapInstance) return;
  if (rutaLayer) { mapInstance.removeLayer(rutaLayer); rutaLayer = null; }
  if (markerOrigen) { mapInstance.removeLayer(markerOrigen); markerOrigen = null; }
}

async function pedir(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function rutaORS(origen, destino) {
  const url = `${ORS_URL}?api_key=${encodeURIComponent(ORS_KEY)}&start=${origen.lng},${origen.lat}&end=${destino.lng},${destino.lat}`;
  const data = await pedir(url, 15000);
  const f = data.features && data.features[0];
  if (!f || !f.geometry || !f.geometry.coordinates || f.geometry.coordinates.length < 2) throw new Error('ORS sin ruta');
  const s = f.properties && f.properties.summary || {};
  return { distance: s.distance || 0, duration: s.duration || 0, geometry: f.geometry, fuente: 'openrouteservice' };
}

async function rutaOSRM(origen, destino) {
  const url = `${OSRM_URL}/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const data = await pedir(url, 20000);
  if (!data.routes || !data.routes.length) throw new Error('OSRM sin ruta');
  const r = data.routes[0];
  return { distance: r.distance, duration: r.duration, geometry: r.geometry, fuente: 'osrm' };
}

export async function calcularRuta(origen, destino) {
  if (!mapInstance) throw new Error('El módulo de rutas no está inicializado');
  if (!origen || !destino) throw new Error('Origen o destino no válidos');

  limpiarRuta();

  let ruta;
  try {
    ruta = await rutaORS(origen, destino);
  } catch (e) {
    console.warn('openrouteservice no disponible, se usa OSRM:', e.message);
    ruta = await rutaOSRM(origen, destino);
  }

  const atribucion = ruta.fuente === 'openrouteservice'
    ? 'Rutas: <a href="https://openrouteservice.org/" target="_blank" rel="noopener">openrouteservice.org</a> by HeiGIT · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
    : 'Rutas: <a href="https://project-osrm.org/" target="_blank" rel="noopener">OSRM</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
  rutaLayer = L.geoJSON(ruta.geometry, { style: { color: '#0B5FFF', weight: 6, opacity: 0.85 }, attribution: atribucion }).addTo(mapInstance);

  markerOrigen = L.marker([origen.lat, origen.lng], {
    icon: L.divIcon({ className: 'marca-origen', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] }),
    keyboard: false
  }).addTo(mapInstance).bindPopup('<strong>Salida</strong>');

  // Deja libres el panel de la izquierda y la lista de la derecha (escritorio) o la hoja de abajo (móvil)
  const escritorio = window.innerWidth > 768;
  mapInstance.fitBounds(rutaLayer.getBounds(), {
    paddingTopLeft: escritorio ? [420, 40] : [20, 260],
    paddingBottomRight: escritorio ? [400, 40] : [20, 90]
  });

  return ruta;
}
