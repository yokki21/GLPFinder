// Datos del usuario guardados en su propio navegador (sin cuentas ni servidor)
const CLAVE_FAVORITAS = 'glp_favoritas';
const CLAVE_VEHICULO = 'glp_vehiculo_datos';

function leer(clave, porDefecto) {
    try {
        const v = localStorage.getItem(clave);
        return v ? JSON.parse(v) : porDefecto;
    } catch (e) {
        return porDefecto;
    }
}

function escribir(clave, valor) {
    try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) { console.warn('No se pudo guardar en el navegador:', e); }
}

// Favoritas: { [IDEESS]: { nombre, lat, lng, direccion, localidad, precio } }
export const leerFavoritas = () => leer(CLAVE_FAVORITAS, {});
export const idsFavoritas = () => Object.keys(leerFavoritas());
export function guardarFavorita(id, datos) {
    const favs = leerFavoritas();
    favs[id] = datos;
    escribir(CLAVE_FAVORITAS, favs);
}
export function quitarFavorita(id) {
    const favs = leerFavoritas();
    delete favs[id];
    escribir(CLAVE_FAVORITAS, favs);
}

export const leerVehiculo = () => leer(CLAVE_VEHICULO, null);
