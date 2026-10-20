// Datos del usuario: favoritas y vehículo.
// - Con sesión iniciada se guardan en su cuenta (Firestore) y se sincronizan entre dispositivos.
// - Sin sesión se guardan en el navegador (localStorage).
// - Al iniciar sesión, lo guardado en el navegador se pasa a la cuenta.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyB_2thDoQUjLM34QYO8nmaDAB8HqQIxtIY",
    authDomain: "glpfinder.firebaseapp.com",
    projectId: "glpfinder",
    storageBucket: "glpfinder.firebasestorage.app",
    messagingSenderId: "173596798895",
    appId: "1:173596798895:web:d883035f89fa2c139fc95a"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Firestore (unos 430 KB) solo se descarga cuando hace falta: con sesión iniciada o al ver el historial antiguo
let fsPromesa = null;
function firestore() {
    return fsPromesa ??= import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js")
        .then(m => ({ ...m, db: m.getFirestore(app) }));
}

const CLAVE_FAVORITAS = 'glp_favoritas';
const CLAVE_VEHICULO = 'glp_vehiculo_datos';

// ---------- Navegador ----------
function leerLocal(clave, porDefecto) {
    try {
        const v = localStorage.getItem(clave);
        return v ? JSON.parse(v) : porDefecto;
    } catch (e) {
        return porDefecto;
    }
}
function escribirLocal(clave, valor) {
    try {
        if (valor === null) localStorage.removeItem(clave);
        else localStorage.setItem(clave, JSON.stringify(valor));
    } catch (e) { console.warn('No se pudo guardar en el navegador:', e); }
}

// ---------- Sesión ----------
let usuario = null;
let resolverListo;
const listo = new Promise(r => { resolverListo = r; });
// Si Firebase no responde, se sigue sin sesión
setTimeout(() => resolverListo(), 4000);

onAuthStateChanged(auth, async (u) => {
    usuario = u;
    if (u) {
        try { await migrarDatosLocales(u.uid); } catch (e) { console.warn('No se pudieron pasar los datos a la cuenta:', e); }
    }
    actualizarNavegacion();
    resolverListo();
}, (e) => { console.warn('Firebase Auth no disponible:', e); resolverListo(); });

/** Espera a saber si hay sesión y devuelve el usuario (o null). */
export async function usuarioActual() {
    await listo;
    return usuario;
}

export async function cerrarSesion() {
    await signOut(auth);
    location.reload();
}

// Muestra "Acceder" o "Cerrar sesión" en la cabecera de cualquier página
function actualizarNavegacion() {
    const acceder = document.getElementById('nav-auth');
    const salir = document.getElementById('nav-logout');
    if (acceder) acceder.hidden = !!usuario;
    if (salir) {
        salir.hidden = !usuario;
        salir.title = usuario ? `Sesión iniciada como ${usuario.email || usuario.displayName || ''}` : '';
        salir.onclick = (e) => { e.preventDefault(); cerrarSesion(); };
    }
}
document.addEventListener('DOMContentLoaded', actualizarNavegacion);

async function migrarDatosLocales(uid) {
    const { db, doc, getDoc, writeBatch } = await firestore();
    const favs = leerLocal(CLAVE_FAVORITAS, {});
    const vehiculo = leerLocal(CLAVE_VEHICULO, null);
    const ids = Object.keys(favs);
    if (ids.length === 0 && !vehiculo) return;

    const batch = writeBatch(db);
    ids.forEach(id => batch.set(doc(db, "users", uid, "favoritos", id), favs[id], { merge: true }));
    if (vehiculo) {
        const ref = doc(db, "users", uid, "configuracion", "vehiculo");
        const actual = await getDoc(ref);
        if (!actual.exists()) batch.set(ref, vehiculo);
    }
    await batch.commit();
    escribirLocal(CLAVE_FAVORITAS, null);
    escribirLocal(CLAVE_VEHICULO, null);
}

// ---------- Favoritas: { [IDEESS]: { nombre, lat, lng, direccion, localidad, precio } } ----------
export async function leerFavoritas() {
    const u = await usuarioActual();
    if (!u) return leerLocal(CLAVE_FAVORITAS, {});
    const { db, collection, getDocs } = await firestore();
    const snap = await getDocs(collection(db, "users", u.uid, "favoritos"));
    return Object.fromEntries(snap.docs.map(d => [d.id, d.data()]));
}

export async function guardarFavorita(id, datos) {
    const u = await usuarioActual();
    if (!u) {
        const favs = leerLocal(CLAVE_FAVORITAS, {});
        favs[id] = datos;
        return escribirLocal(CLAVE_FAVORITAS, favs);
    }
    const { db, doc, setDoc } = await firestore();
    await setDoc(doc(db, "users", u.uid, "favoritos", id), datos);
}

export async function quitarFavorita(id) {
    const u = await usuarioActual();
    if (!u) {
        const favs = leerLocal(CLAVE_FAVORITAS, {});
        delete favs[id];
        return escribirLocal(CLAVE_FAVORITAS, favs);
    }
    const { db, doc, deleteDoc } = await firestore();
    await deleteDoc(doc(db, "users", u.uid, "favoritos", id));
}

// ---------- Vehículo ----------
export async function leerVehiculo() {
    const u = await usuarioActual();
    if (!u) return leerLocal(CLAVE_VEHICULO, null);
    const { db, doc, getDoc } = await firestore();
    const snap = await getDoc(doc(db, "users", u.uid, "configuracion", "vehiculo"));
    return snap.exists() ? snap.data() : null;
}

export async function guardarVehiculo(datos) {
    const u = await usuarioActual();
    if (!u) return escribirLocal(CLAVE_VEHICULO, datos);
    const { db, doc, setDoc } = await firestore();
    await setDoc(doc(db, "users", u.uid, "configuracion", "vehiculo"), datos);
}

// ---------- Historial antiguo guardado en Firestore (antes de la GitHub Action) ----------
export async function leerHistorialAntiguo(id, n) {
    try {
        const { db, collection, query, orderBy, limit, getDocs } = await firestore();
        const q = query(collection(db, "historial_precios", id, "registros"), orderBy("fecha", "desc"), limit(n));
        const tiempoAgotado = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000));
        return (await Promise.race([getDocs(q), tiempoAgotado])).docs.map(d => d.data());
    } catch (e) {
        return [];
    }
}
