const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// Este robot se ejecuta todos los días a las 23:00 hora de Madrid
exports.guardarHistorialDiario = onSchedule({
    schedule: "0 23 * * *",
    timeZone: "Europe/Madrid"
}, async (event) => {
    try {
        // 1. Descargamos los datos frescos del Ministerio
        const response = await fetch('https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/');
        const data = await response.json();
        const estaciones = data.ListaEESSPrecio;

        // 2. Buscamos qué gasolineras tiene la gente guardadas como favoritas
        // Usamos collectionGroup para buscar en todos los usuarios a la vez
        const favoritasSnapshot = await db.collectionGroup('favoritos').get();
        
        // Extraemos los IDs únicos para no repetir si dos usuarios tienen la misma
        const idsUnicos = new Set();
        favoritasSnapshot.forEach(doc => {
            idsUnicos.add(doc.id); // El ID del documento es el IDEESS de la gasolinera
        });

        // La fecha de hoy en formato YYYY-MM-DD
        const hoy = new Date().toISOString().split('T')[0];
        let procesadas = 0;

        // 3. Cruzamos los datos y guardamos
        for (const ideess of idsUnicos) {
            const estacion = estaciones.find(e => e['IDEESS'] === ideess);
            
            if (estacion && estacion['Precio Gases licuados del petróleo']) {
                const precioLimpio = parseFloat(estacion['Precio Gases licuados del petróleo'].replace(',', '.'));
                
                // Escribimos en la colección global del historial
                await db.collection("historial_precios")
                    .doc(ideess)
                    .collection("registros")
                    .doc(hoy)
                    .set({
                        precio: precioLimpio,
                        fecha: hoy
                    }, { merge: true });
                
                procesadas++;
            }
        }

        console.log(`Historial actualizado correctamente. Se guardaron ${procesadas} gasolineras.`);

    } catch (error) {
        console.error("Error al actualizar el historial:", error);
    }
});