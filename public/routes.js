let mapInstance = null;
let rutaLayer = null;
let markerOrigen = null;
let routeInfoControl = null;
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

export function initRouteModule(map) {
  mapInstance = map;
}

export function limpiarRuta() {
  if (!mapInstance) return;
  if (rutaLayer) {
    mapInstance.removeLayer(rutaLayer);
    rutaLayer = null;
  }
  if (markerOrigen) {
    mapInstance.removeLayer(markerOrigen);
    markerOrigen = null;
  }
  if (routeInfoControl) {
    mapInstance.removeControl(routeInfoControl);
    routeInfoControl = null;
  }
}

function formatDuration(seconds) {
  const minutos = Math.round(seconds / 60);
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return `${horas} h${resto > 0 ? ` ${resto} min` : ''}`;
}

function formatDistance(meters) {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

function mostrarInfoRuta(distance, duration) {
  if (!mapInstance) return;
  if (routeInfoControl) {
    mapInstance.removeControl(routeInfoControl);
    routeInfoControl = null;
  }

  routeInfoControl = L.control({ position: 'topright' });
  routeInfoControl.onAdd = function () {
    const div = L.DomUtil.create('div', 'route-info-control');
    div.style.background = 'rgba(255,255,255,0.95)';
    div.style.padding = '10px 12px';
    div.style.borderRadius = '8px';
    div.style.boxShadow = '0 1px 6px rgba(0,0,0,0.15)';
    div.style.fontSize = '14px';
    div.style.lineHeight = '1.4';
    div.innerHTML = `<strong>Ruta</strong><br>${formatDistance(distance)} · ${formatDuration(duration)}`;
    return div;
  };
  routeInfoControl.addTo(mapInstance);
}

export async function calcularRuta(origen, destino) {
  if (!mapInstance) {
    throw new Error('El módulo de rutas no está inicializado');
  }
  if (!origen || !destino) {
    throw new Error('Origen o destino no válidos');
  }

  limpiarRuta();

  const coords = `${origen.lng},${origen.lat};${destino.lng},${destino.lat}`;
  const url = `${OSRM_BASE}/${coords}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OSRM HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error('No se encontró ninguna ruta');
  }

  const route = data.routes[0];
  rutaLayer = L.geoJSON(route.geometry, {
    style: {
      color: '#2563eb',
      weight: 6,
      opacity: 0.85
    }
  }).addTo(mapInstance);

  markerOrigen = L.circleMarker([origen.lat, origen.lng], {
    radius: 7,
    color: '#1d4ed8',
    fillColor: '#60a5fa',
    weight: 2,
    fillOpacity: 0.95
  }).addTo(mapInstance).bindPopup('<strong>Origen</strong>');

  mapInstance.fitBounds(rutaLayer.getBounds(), { padding: [40, 40] });
  mostrarInfoRuta(route.distance, route.duration);

  return {
    distance: route.distance,
    duration: route.duration
  };
}
