const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Solo inicializar admin si no se ha hecho antes (buena práctica)
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();

// --------------------------------------------------------------------------
// 1. TAREA PROGRAMADA: Historial Diario (El código que ya tenías)
// --------------------------------------------------------------------------
exports.guardarHistorialDiario = onSchedule({
    schedule: "0 16 * * *",
    timeZone: "Europe/Madrid"
}, async (event) => {
    try {
        const response = await fetch('https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/');
        const data = await response.json();
        const estaciones = data.ListaEESSPrecio;

        const favoritasSnapshot = await db.collectionGroup('favoritos').get();
        const idsUnicos = new Set();
        favoritasSnapshot.forEach(doc => {
            idsUnicos.add(doc.id);
        });

        const hoy = new Date().toISOString().split('T')[0];
        let procesadas = 0;

        for (const ideess of idsUnicos) {
            const estacion = estaciones.find(e => e['IDEESS'] === ideess);
            if (estacion && estacion['Precio Gases licuados del petróleo']) {
                const precioLimpio = parseFloat(estacion['Precio Gases licuados del petróleo'].replace(',', '.'));
                await db.collection("historial_precios")
                    .doc(ideess)
                    .collection("registros")
                    .doc(hoy)
                    .set({ precio: precioLimpio, fecha: hoy }, { merge: true });
                procesadas++;
            }
        }
        console.log(`Historial actualizado correctamente. Se guardaron ${procesadas} gasolineras.`);
    } catch (error) {
        console.error("Error al actualizar el historial:", error);
    }
});

// --------------------------------------------------------------------------
// 2. NUEVO ENDPOINT HTTP: Proxy para descargar gasolineras
// --------------------------------------------------------------------------
exports.obtenerGasolineras = onRequest({ cors: true, region: "europe-west1" }, async (req, res) => {
    try {
        const url = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';
        const response = await fetch(url);
        
        if (!response.ok) {
            return res.status(502).json({ error: "El servidor del Ministerio no responde" });
        }

        const data = await response.json();
        
        // Filtramos en el backend: solo enviamos al usuario las que tienen GLP
        const glpStations = data.ListaEESSPrecio.filter(e => e['Precio Gases licuados del petróleo']);
        
        res.status(200).json({ ListaEESSPrecio: glpStations });

    } catch (error) {
        console.error("Error en el proxy:", error);
        res.status(500).json({ error: "Error interno procesando los datos" });
    }
});