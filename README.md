# GLPFinder 

GLPFinder es una aplicación web geoespacial avanzada diseñada para localizar, analizar y optimizar rutas hacia estaciones de servicio que suministran Gas Licuado del Petróleo (GLP) en España.

Este proyecto ha sido desarrollado como trabajo final para la asignatura de **Proyectos de aplicaciones de las tecnologías geoespaciales**.

## 🌟 Funcionalidades Principales
* **Mapa Interactivo:** Visualización de estaciones de GLP en España mediante Leaflet, con agrupación por clústeres a nivel provincial y personalización de marcadores según el precio en tiempo real.
* **Cálculo de Rutas Inteligente:** Planificación de trayectos con OSRM y filtrado espacial paramétrico mediante Turf.js para localizar gasolineras que se encuentren a una distancia máxima de desvío de la ruta.
* **Panel de Eficiencia:** Cálculo automático del ahorro mensual estimado y la autonomía teórica comparando precios oficiales.
* **Historial de Precios:** Gráficas interactivas con la evolución temporal del precio del autogás utilizando Chart.js.
* **Back-End Serverless:** Extracción, limpieza y transformación de datos (ETL) automatizada desde las fuentes oficiales del Ministerio mediante Firebase Cloud Functions y almacenamiento en Cloud Firestore.

## 🛠️ Tecnologías Utilizadas
* **Front-End:** HTML5, CSS3, JavaScript (ES6 Modules).
* **Librerías Geoespaciales y Analíticas:** Leaflet.js, Turf.js, Chart.js.
* **Servicios Externos:** Nominatim (Geocodificación), OSRM (Rutas), WMS IGN.
* **Back-End y Base de Datos:** Node.js, Firebase (Cloud Firestore, Cloud Functions, Authentication, Hosting).

---

## ⚙️ Instrucciones de Instalación y Despliegue

El proyecto cuenta con una arquitectura híbrida dividida en el cliente web estático y las funciones de servidor (Cloud Functions). A continuación se detallan los pasos para ejecutar el proyecto en un entorno local.

### Prerrequisitos
* Un editor de código (recomendado: Visual Studio Code).
* Una extensión de servidor local web (ej. *Live Server* para VS Code) o un entorno local como XAMPP / `http-server` de Python/Node.
* Node.js instalado en el sistema (únicamente necesario si se desea interactuar con las Cloud Functions de Firebase).

### 1. Clonar el repositorio
Abre tu terminal y ejecuta:
```bash
git clone [https://github.com/glpfinder/GLPFinder.git](https://github.com/glpfinder/GLPFinder.git)
cd GLPFinder
