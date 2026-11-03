// Service worker de glpfinder: permite abrir la web sin conexión con los últimos precios guardados
// y la hace instalable como app (también la versión de Android de Google Play).
// - Páginas y precios: primero la red; sin conexión, la última copia guardada.
// - Ficheros estáticos (estilos, código, imágenes, tipografías): de la caché, y se actualizan en segundo plano.
// Al cambiar VERSION se borran las cachés antiguas.
const VERSION = 'v1';
const CACHE = `glpfinder-${VERSION}`;
const ESENCIALES = [
    '/', '/index.html', '/offline.html', '/manifest.webmanifest', '/nav.js', '/styles.css',
    '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css', '/vendor/almacen-local.js',
    '/img/logo-negativo.svg', '/img/favicon.svg', '/img/icono-192.png',
];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESENCIALES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys()
        .then((claves) => Promise.all(claves.filter((k) => k.startsWith('glpfinder-') && k !== CACHE).map((k) => caches.delete(k))))
        .then(() => self.clients.claim()));
});

async function primeroRed(peticion, alternativa) {
    const cache = await caches.open(CACHE);
    try {
        const resp = await fetch(peticion);
        if (resp.ok) cache.put(peticion, resp.clone());
        return resp;
    } catch (err) {
        return (await cache.match(peticion, { ignoreSearch: peticion.mode === 'navigate' && new URL(peticion.url).pathname === '/' }))
            || (alternativa && await cache.match(alternativa))
            || Response.error();
    }
}

async function cacheYActualiza(peticion, e) {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(peticion);
    const red = fetch(peticion).then((resp) => {
        if (resp.ok) cache.put(peticion, resp.clone());
        return resp;
    }).catch(() => null);
    if (guardada) { e.waitUntil(red); return guardada; }
    // Sin conexión y sin esta versión exacta (p. ej. styles.css?v=21): sirve la última que haya
    return (await red) || (await cache.match(peticion, { ignoreSearch: true })) || Response.error();
}

self.addEventListener('fetch', (e) => {
    const peticion = e.request;
    if (peticion.method !== 'GET') return;
    const url = new URL(peticion.url);
    if (url.origin !== self.location.origin) return; // mapas, Firebase, rutas, analítica: siempre por la red

    if (peticion.mode === 'navigate') {
        e.respondWith(primeroRed(peticion, '/offline.html'));
    } else if (url.pathname.startsWith('/data/')) {
        e.respondWith(primeroRed(peticion));
    } else if (/\.(css|js|mjs|svg|png|webp|jpg|woff2|webmanifest)$/.test(url.pathname)) {
        e.respondWith(cacheYActualiza(peticion, e));
    }
});
