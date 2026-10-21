// Contenido de las guías (/guias/...). Las cifras de precios se rellenan con los datos del día
// al generar la web, así que los ejemplos siempre usan precios reales.
// Fuentes consultadas en octubre de 2026: Repsol (consumo), Diariomotor y Carwow (transformación),
// RACE (ventajas de la etiqueta ECO en Madrid y Barcelona), Ley 7/2021 de cambio climático (ZBE).

const pc = (v, d = 0) => v.toFixed(d).replace(".", ",");
const eur = (v, d = 3) => v.toFixed(d).replace(".", ",") + " €";
const eurRed = (v) => Math.round(v).toLocaleString("es-ES") + " €";

export function construirGuias({ medias, nGLP, totalEstaciones, fecha, esc }) {
  const glp = medias.glp, g95 = medias.gasolina95, dsl = medias.gasoleoA;
  const difPct = (1 - glp / g95) * 100;
  // Ejemplo tipo: compacto que gasta 6,5 L/100 km de gasolina y un 15 % más de GLP
  const cG = 6.5, cL = 6.5 * 1.15;
  const e100G = cG * g95, e100L = cL * glp, ahorro100 = e100G - e100L;
  const ahorroAnual15 = ahorro100 * 150;
  const kmAmortizar = 1800 / (ahorro100 / 100);
  const sello = `Precios medios oficiales del ${esc(fecha)}`;
  const totalTxt = totalEstaciones ? ` de las ${totalEstaciones.toLocaleString("es-ES")} que hay en España` : "";

  const calculadora = `
        <section class="seo-bloque calc" id="calculadora" data-glp="${glp}" data-g95="${g95}" data-dsl="${dsl}">
            <h2>Calcula tu ahorro</h2>
            <p class="calc-nota">Con los precios medios de hoy: GLP ${eur(glp)}/L, gasolina 95 ${eur(g95)}/L y diésel ${eur(dsl)}/L.</p>
            <div class="calc-campos">
                <label>Kilómetros al año<input type="number" id="c-km" value="15000" min="0" step="1000" inputmode="numeric"></label>
                <label>Tu coche ahora es de<select id="c-comb"><option value="g95">Gasolina</option><option value="dsl">Diésel</option></select></label>
                <label>Consumo actual (L/100 km)<input type="number" id="c-cons" value="6.5" min="1" step="0.1" inputmode="decimal"></label>
                <label>Consumo extra con GLP (%)<input type="number" id="c-extra" value="15" min="0" max="40" step="1" inputmode="numeric"></label>
                <label>Coste de pasarlo a GLP (€)<input type="number" id="c-coste" value="1800" min="0" step="100" inputmode="numeric"></label>
            </div>
            <div class="seo-resumen calc-res">
                <div><strong id="r-ahorro">–</strong><span>Ahorro al año</span></div>
                <div><strong id="r-100">–</strong><span>Ahorro cada 100 km</span></div>
                <div><strong id="r-amort">–</strong><span>Para amortizar la transformación</span></div>
            </div>
            <p class="calc-nota">Si tu coche consume diésel, el consumo con GLP se calcula sobre el de un gasolina equivalente (un 20 % más que tu diésel), porque un diésel no se puede pasar a GLP de forma sencilla.</p>
        </section>
        <script>
        (function () {
            var c = document.getElementById('calculadora');
            var P = { glp: +c.dataset.glp, g95: +c.dataset.g95, dsl: +c.dataset.dsl };
            var f = function (v, d) { return v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }); };
            function calc() {
                var km = +document.getElementById('c-km').value || 0;
                var comb = document.getElementById('c-comb').value;
                var cons = +document.getElementById('c-cons').value || 0;
                var extra = (+document.getElementById('c-extra').value || 0) / 100;
                var coste = +document.getElementById('c-coste').value || 0;
                var consGasolina = comb === 'dsl' ? cons * 1.2 : cons;
                var ahorro100 = cons * P[comb] - consGasolina * (1 + extra) * P.glp;
                document.getElementById('r-100').textContent = f(ahorro100, 2) + ' €';
                document.getElementById('r-ahorro').textContent = f(ahorro100 * km / 100, 0) + ' €';
                var r = document.getElementById('r-amort');
                if (ahorro100 <= 0) r.textContent = 'No compensa';
                else {
                    var kmA = coste / (ahorro100 / 100);
                    r.textContent = f(Math.round(kmA / 1000) * 1000, 0) + ' km' + (km > 0 ? ' (' + f(kmA / km, 1) + ' años)' : '');
                }
            }
            c.addEventListener('input', calc); c.addEventListener('change', calc); calc();
        })();
        </script>`;

  const guias = [
    {
      slug: "merece-la-pena-el-glp",
      corto: "¿Merece la pena el GLP?",
      resumen: "Cuánto se ahorra de verdad con autogás, con los precios de hoy y una calculadora para tu caso.",
      title: "¿Merece la pena el GLP? Cuánto se ahorra con autogás (calculadora) | glpfinder",
      description: `El GLP cuesta hoy ${eur(glp)}/L frente a ${eur(g95)} de la gasolina 95. Calcula cuánto ahorras al año con autogás, cuándo compensa y sus inconvenientes reales.`,
      h1: "¿Merece la pena el GLP?",
      lead: `Cuánto se ahorra de verdad con autogás, con los precios oficiales de hoy y una calculadora para tu caso.`,
      faq: [
        ["¿Cuánto se ahorra con un coche de GLP?", `Con los precios de hoy, un coche que gasta 6,5 litros de gasolina cada 100 km ahorra unos ${eur(ahorro100, 2)} cada 100 km con GLP, unos ${eurRed(ahorroAnual15)} al año si hace 15.000 km.`],
        ["¿Un coche de GLP gasta más?", "Sí, entre un 10 % y un 20 % más litros que con gasolina, porque el GLP tiene menos energía por litro. Aun así sale más barato porque el litro cuesta mucho menos."],
        ["¿Cuándo no compensa el GLP?", "Si haces pocos kilómetros al año y tendrías que pagar la transformación, porque tardarías muchos años en amortizarla. Tampoco compensa si no tienes gasolineras con GLP cerca de tus rutas habituales."],
      ],
      html: `        <div class="seo-resumen">
            <div><strong>${eur(glp)}</strong><span>GLP, media de hoy</span></div>
            <div><strong>${eur(g95)}</strong><span>Gasolina 95, media de hoy</span></div>
            <div><strong>${pc(difPct)} %</strong><span>Más barato el litro de GLP</span></div>
        </div>
        <article class="seo-bloque guia">
            <p>El GLP (gas licuado del petróleo, también llamado autogás) es el combustible más barato de las gasolineras españolas. Hoy cuesta de media <strong>${eur(glp)} el litro</strong>, un ${pc(difPct)} % menos que la gasolina 95 (${eur(g95)}). Pero el precio del litro no lo es todo: un coche de GLP gasta más litros. Esta guía explica cuánto se ahorra de verdad y en qué casos compensa.</p>

            <h2>El GLP se gasta más, pero sale más barato</h2>
            <p>El GLP tiene menos energía por litro que la gasolina, así que un coche consume <strong>entre un 10 % y un 20 % más litros</strong> con GLP que con gasolina. Si tu coche gasta 6,5 litros de gasolina cada 100 km, con GLP gastará unos ${pc(cL, 1)} litros.</p>
            <p>Con los precios de hoy, esos 100 km cuestan ${eur(e100G, 2)} con gasolina y ${eur(e100L, 2)} con GLP: <strong>${eur(ahorro100, 2)} menos cada 100 km</strong>. Para alguien que hace 15.000 km al año son unos <strong>${eurRed(ahorroAnual15)} de ahorro</strong>.</p>
            <p class="guia-sello">${sello}. Las cifras de esta página se actualizan cada día.</p>
        </article>
${calculadora}
        <article class="seo-bloque guia">
            <h2>¿Cuándo compensa?</h2>
            <p><strong>Si compras un coche nuevo o de segunda mano que ya es de GLP</strong>, casi siempre compensa: las versiones de GLP de fábrica (por ejemplo, las de Dacia) cuestan lo mismo o poco más que las de gasolina y empiezas a ahorrar desde el primer depósito.</p>
            <p><strong>Si quieres transformar tu coche de gasolina</strong>, la instalación cuesta entre 1.500 y 2.500 euros. Con los precios de hoy y un consumo de 6,5 L/100 km, se amortiza en unos ${Math.round(kmAmortizar / 1000).toLocaleString("es-ES")}.000 km. Compensa si haces muchos kilómetros al año y piensas quedarte el coche varios años. Lo explicamos en la guía <a href="../pasar-coche-a-glp/">pasar el coche a GLP</a>.</p>
            <p><strong>Si haces pocos kilómetros</strong> (menos de 8.000 o 10.000 al año), el ahorro es pequeño y la transformación tarda mucho en pagarse. En ese caso la ventaja principal sería la etiqueta ECO.</p>

            <h2>Otras ventajas</h2>
            <ul>
                <li><strong>Etiqueta ECO</strong>: entra en las zonas de bajas emisiones y tiene descuentos en el aparcamiento regulado de muchas ciudades. Lo contamos en la guía de la <a href="../etiqueta-eco-glp/">etiqueta ECO</a>.</li>
                <li><strong>Más autonomía</strong>: los coches de GLP son bifuel, conservan el depósito de gasolina y pueden usar los dos. Con ambos llenos se superan con facilidad los 1.000 km.</li>
                <li><strong>Menos emisiones</strong> de partículas y óxidos de nitrógeno que un diésel.</li>
            </ul>

            <h2>Inconvenientes</h2>
            <ul>
                <li><strong>Menos gasolineras</strong>: hoy venden GLP ${nGLP.toLocaleString("es-ES")} gasolineras${totalTxt}. En ciudades y autovías hay de sobra, pero en zonas rurales conviene planificar. Para eso está el <a href="../../index.html">mapa de glpfinder</a>.</li>
                <li><strong>Espacio</strong>: en los coches transformados el depósito suele ir en el hueco de la rueda de repuesto o en el maletero.</li>
                <li><strong>Pequeño mantenimiento extra</strong>: el sistema de gas tiene filtros y una revisión periódica.</li>
                <li><strong>El depósito se llena al 80 %</strong> por seguridad, así que caben menos litros de los que indica su capacidad.</li>
            </ul>
        </article>`,
    },
    {
      slug: "etiqueta-eco-glp",
      corto: "Etiqueta ECO con GLP",
      resumen: "Qué coches de GLP la tienen, cómo conseguirla y qué ventajas da en las zonas de bajas emisiones.",
      title: "Etiqueta ECO con GLP: ventajas en las ZBE y cómo conseguirla | glpfinder",
      description: "Los coches de GLP tienen etiqueta ECO de la DGT. Qué requisitos hay si transformas tu coche, cómo pedirla y qué ventajas da en Madrid, Barcelona y otras zonas de bajas emisiones.",
      h1: "Etiqueta ECO con GLP",
      lead: "Qué coches de GLP la tienen, cómo conseguirla si transformas el tuyo y qué ventajas da en las zonas de bajas emisiones.",
      faq: [
        ["¿Los coches de GLP tienen etiqueta ECO?", "Sí. La DGT da la etiqueta ECO a los turismos de GLP. Si el coche se ha transformado, tiene que ser un gasolina Euro 4 o posterior, es decir, uno que antes tenía la etiqueta C."],
        ["¿Cuánto cuesta la pegatina ECO?", "La pegatina cuesta 5 euros y se pide en Correos, en la web de la DGT o en talleres autorizados, una vez que el coche figura como GLP en el registro de la DGT."],
        ["¿Un coche ECO puede entrar en las zonas de bajas emisiones?", "En la mayoría de ciudades sí, sin restricciones. Las normas las pone cada ayuntamiento, así que conviene consultar la ordenanza de la ciudad a la que vas, sobre todo en episodios de alta contaminación."],
      ],
      html: `        <article class="seo-bloque guia">
            <p>La DGT clasifica los vehículos con cuatro etiquetas ambientales: CERO, ECO, C y B. Los coches de GLP tienen la <strong>etiqueta ECO</strong>, la misma que los híbridos. Es una de las razones por las que el autogás ha crecido tanto en España: da acceso a las zonas de bajas emisiones sin pagar lo que cuesta un híbrido.</p>

            <h2>Qué coches de GLP tienen la etiqueta ECO</h2>
            <p><strong>Los coches de GLP de fábrica</strong> tienen la etiqueta ECO desde que se matriculan.</p>
            <p><strong>Los coches transformados</strong> pueden conseguirla si su motor de gasolina estaba homologado como <strong>Euro 4 o posterior</strong>, es decir, si antes tenían la etiqueta C (en general, los de gasolina matriculados desde 2006). Un gasolina más antiguo se puede transformar, pero no conseguirá la ECO.</p>

            <h2>Cómo conseguirla si transformas tu coche</h2>
            <ol>
                <li>Un taller instalador autorizado monta un kit de GLP homologado (Reglamento CEPE R115) y te da el certificado de instalación.</li>
                <li>Pasas una ITV de reforma para que conste el cambio en la ficha técnica, que pasa a indicar que el coche es bifuel gasolina y GLP.</li>
                <li>La DGT actualiza el registro del vehículo con el nuevo combustible.</li>
                <li>Pides la pegatina ECO (5 euros) en Correos, en la sede electrónica de la DGT o en un taller autorizado.</li>
            </ol>

            <h2>Ventajas de la etiqueta ECO</h2>
            <p>La <strong>Ley 7/2021 de cambio climático</strong> obliga a los municipios de más de 50.000 habitantes a tener zonas de bajas emisiones (ZBE). En casi todas, los coches ECO entran sin restricciones, mientras que los que no tienen etiqueta y, cada vez más, los de etiqueta B se quedan fuera. Además, muchas ciudades rebajan a los ECO el aparcamiento regulado y el impuesto de circulación.</p>
            <h3>Madrid</h3>
            <ul>
                <li>Acceso libre a todas las zonas de bajas emisiones, incluidas Distrito Centro y Plaza Elíptica.</li>
                <li>Hasta un 75 % de descuento en el aparcamiento regulado (SER) y en el impuesto de circulación.</li>
            </ul>
            <h3>Barcelona</h3>
            <ul>
                <li>Acceso a la zona de bajas emisiones de las Rondas.</li>
                <li>Tarifa reducida en zona azul y verde (por ejemplo, 2,50 €/h en lugar de 3,75 €/h en la tarifa A de zona azul).</li>
                <li>50 % de bonificación en el impuesto de circulación durante cinco años para los ECO de gasolina que emiten hasta 120 g/km de CO₂.</li>
                <li>30 % de descuento en el peaje de la C-32 Sur con VIA-T, de lunes a viernes laborables.</li>
            </ul>
            <p class="guia-sello">Datos de las ordenanzas de 2025 recogidos por el RACE. Las ordenanzas cambian con frecuencia: confirma las condiciones en la web de tu ayuntamiento.</p>

            <h2>¿Merece la pena solo por la etiqueta?</h2>
            <p>Si vives o trabajas dentro de una zona de bajas emisiones y tu coche de gasolina tiene etiqueta B, pasarlo a GLP es una de las formas más baratas de seguir entrando. Pero si vas a hacer la transformación, el ahorro en combustible también cuenta: calcúlalo en la guía <a href="../merece-la-pena-el-glp/">¿merece la pena el GLP?</a></p>
        </article>`,
    },
    {
      slug: "pasar-coche-a-glp",
      corto: "Pasar el coche a GLP",
      resumen: "Cuánto cuesta transformar un gasolina a autogás, qué coches se pueden, el proceso y cuándo se amortiza.",
      title: "Pasar el coche a GLP: precio, requisitos y amortización | glpfinder",
      description: "Transformar un coche de gasolina a GLP cuesta entre 1.500 y 2.500 €. Qué coches se pueden, cómo es el proceso (taller, ITV, DGT) y en cuántos kilómetros se amortiza con los precios de hoy.",
      h1: "Pasar el coche a GLP",
      lead: "Cuánto cuesta transformar un coche de gasolina a autogás, qué coches se pueden, cómo es el proceso y cuándo se amortiza.",
      faq: [
        ["¿Cuánto cuesta pasar un coche a GLP?", "Entre 1.500 y 2.500 euros, según el coche, el tipo de depósito y el taller. El precio suele incluir el kit, la instalación, la homologación y los trámites."],
        ["¿Se puede pasar un diésel a GLP?", "No de forma sencilla. Las transformaciones de diésel son más complejas y caras y no se recomiendan. Lo habitual es transformar coches de gasolina."],
        ["¿En cuánto tiempo se amortiza la transformación?", `Con los precios de hoy y un coche que gasta 6,5 L/100 km, unos ${Math.round(kmAmortizar / 1000).toLocaleString("es-ES")}.000 km. Si haces 15.000 km al año, unos ${pc(kmAmortizar / 15000, 1)} años.`],
      ],
      html: `        <div class="seo-resumen">
            <div><strong>1.500–2.500 €</strong><span>Precio habitual</span></div>
            <div><strong>${Math.round(kmAmortizar / 1000).toLocaleString("es-ES")}.000 km</strong><span>Para amortizarla con los precios de hoy*</span></div>
            <div><strong>Euro 4+</strong><span>Para conseguir la etiqueta ECO</span></div>
        </div>
        <article class="seo-bloque guia">
            <p>Transformar un coche de gasolina para que también funcione con GLP es una forma de pagar menos por cada kilómetro y, en muchos casos, de conseguir la etiqueta ECO. El coche queda <strong>bifuel</strong>: conserva el depósito de gasolina y añade uno de gas, y puedes cambiar de uno a otro con un botón.</p>

            <h2>Cuánto cuesta</h2>
            <p>La transformación cuesta <strong>entre 1.500 y 2.500 euros</strong>, con todo incluido: el kit, la instalación, la homologación y los trámites. El precio depende sobre todo del motor (los de inyección directa necesitan kits más caros) y del depósito: los toroidales, que van en el hueco de la rueda de repuesto, no quitan maletero; los cilíndricos van en el maletero pero admiten más litros.</p>

            <h2>Qué coches se pueden transformar</h2>
            <ul>
                <li><strong>Coches de gasolina</strong>. Los diésel no se transforman de forma sencilla y no se recomienda.</li>
                <li>Para que la transformación se pueda homologar, el coche suele tener que ser Euro 3 o posterior; para conseguir la <strong>etiqueta ECO</strong>, Euro 4 o posterior (lo que antes tenía etiqueta C).</li>
                <li>Algunos motores, sobre todo de inyección directa o con válvulas sensibles, necesitan componentes adicionales. Un taller especializado te dirá si el tuyo es apto antes de empezar.</li>
            </ul>

            <h2>Cómo es el proceso</h2>
            <ol>
                <li><strong>Revisión</strong> del coche en un taller instalador autorizado para confirmar que es compatible.</li>
                <li><strong>Instalación</strong> del kit homologado (depósito, inyectores, centralita, válvulas de seguridad y toma de llenado) y ajuste de la mezcla.</li>
                <li><strong>Certificado</strong> de la instalación conforme al Reglamento CEPE R115, que conviene llevar en el coche.</li>
                <li><strong>ITV de reforma</strong> y actualización de la ficha técnica.</li>
                <li><strong>Registro en la DGT</strong> del nuevo combustible y, si corresponde, petición de la pegatina ECO (5 euros). Lo explicamos en la guía de la <a href="../etiqueta-eco-glp/">etiqueta ECO</a>.</li>
            </ol>
            <p>Avisa también a tu aseguradora del cambio.</p>

            <h2>Cuándo se amortiza</h2>
            <p>Con los precios de hoy, un coche que gasta 6,5 L/100 km de gasolina ahorra unos ${eur(ahorro100, 2)} cada 100 km con GLP, contando que gastará un 15 % más de litros. Así, una transformación de 1.800 euros se paga en unos <strong>${Math.round(kmAmortizar / 1000).toLocaleString("es-ES")}.000 km</strong>. Calcula tu caso con la <a href="../merece-la-pena-el-glp/#calculadora">calculadora de ahorro</a>.</p>
            <p class="guia-sello">* ${sello}, para un coche de 6,5 L/100 km y una transformación de 1.800 €.</p>

            <h2>Consejos antes de transformar</h2>
            <ul>
                <li>Pide presupuesto a varios talleres y pregunta qué incluye: homologación, ITV, garantía y primera revisión.</li>
                <li>Comprueba que hay gasolineras de GLP en tus trayectos habituales con el <a href="../../index.html">mapa de glpfinder</a>.</li>
                <li>Si vas a cambiar de coche pronto, quizá compense más comprar uno que ya sea de GLP de fábrica.</li>
            </ul>
        </article>`,
    },
    {
      slug: "como-usar-glpfinder",
      corto: "Cómo usar glpfinder",
      resumen: "Todo lo que puedes hacer con la web: buscar la más barata, planificar rutas, guardar favoritas y más.",
      title: "Cómo usar glpfinder: guía del mapa de precios del GLP | glpfinder",
      description: "Guía de glpfinder: encuentra el GLP más barato cerca de ti, filtra por marca y precio, planifica rutas con paradas, guarda favoritas, consulta la evolución de precios e instálala en el móvil.",
      h1: "Cómo usar glpfinder",
      lead: "Todo lo que puedes hacer con la web para pagar menos por el GLP, en el móvil y en el ordenador.",
      faq: [
        ["¿Es gratis glpfinder?", "Sí. Puedes usar el mapa, las rutas y las páginas de precios sin registrarte. La cuenta, también gratuita, solo sirve para tener tus favoritas en todos tus dispositivos."],
        ["¿De dónde salen los precios?", "Del Ministerio para la Transición Ecológica, al que las gasolineras están obligadas a comunicar sus precios. glpfinder los descarga cada dos horas."],
        ["¿Se puede instalar como una app?", "Sí. En el móvil, abre glpfinder.es y elige «Añadir a pantalla de inicio» (o «Instalar aplicación») en el menú del navegador."],
      ],
      html: `        <article class="seo-bloque guia">
            <p>glpfinder es un mapa gratuito con el precio del GLP en las ${nGLP.toLocaleString("es-ES")} gasolineras que lo venden en España. Los precios son los oficiales del Ministerio para la Transición Ecológica y se actualizan cada dos horas. Esto es todo lo que puedes hacer.</p>

            <h2>1. Encontrar la más barata cerca de ti</h2>
            <p>Al entrar, la web te pide la ubicación (solo la primera vez) y te muestra la lista de <strong>las más baratas cerca de ti</strong>: a la derecha en el ordenador y en la barra inferior en el móvil, que se despliega al tocarla. Puedes elegir el radio (5, 10, 25 o 50 km) y ordenarlas por precio o por distancia. Al tocar una, el mapa te lleva hasta ella.</p>
            <p>Si no quieres compartir tu ubicación, escribe una ciudad, una calle o un código postal en el buscador y la lista se calculará desde ese lugar.</p>

            <h2>2. Leer el mapa</h2>
            <p>Cada gasolinera aparece con su marca y su precio. El borde indica cómo está respecto a las que ves en pantalla: <strong>verde</strong> si es barata, <strong>gris</strong> si está en la media y <strong>rojo</strong> si es cara. Al alejarte verás la media de cada provincia y, más lejos, la de cada comunidad autónoma.</p>
            <p>Con el botón de capas puedes cambiar entre la vista de satélite y el callejero, y mostrar u ocultar los nombres de lugares y carreteras.</p>

            <h2>3. Filtrar por precio, distancia o marca</h2>
            <p>El botón de filtros, junto al buscador, permite fijar un precio máximo, una distancia máxima o quedarte solo con las marcas que te interesan (Repsol, Moeve, Galp, Plenoil, Ballenoil y otras).</p>

            <h2>4. Ver la ficha de cada gasolinera</h2>
            <p>Al tocar una gasolinera se abre su resumen, con botones para ir con <strong>Waze</strong> o <strong>Google Maps</strong>. Desde ahí, «Ficha y evolución del precio» abre su página, con la gráfica de cómo ha cambiado su precio, la comparación con la media de la zona y las gasolineras con GLP más cercanas.</p>

            <h2>5. Planificar una ruta con paradas</h2>
            <p>Busca tu destino y pulsa <strong>«Cómo llegar»</strong>. Elige desde dónde sales y cuánto estás dispuesto a desviarte (de 2 a 50 km), y glpfinder te mostrará solo las gasolineras con GLP de tu camino, con la lista de las más baratas del trayecto. Toca las que quieras y pulsa «Añadir a la ruta». Puedes ordenar las paradas y abrir la ruta completa en Google Maps.</p>

            <h2>6. Calcular lo que cuesta llenar el depósito</h2>
            <p>En <a href="../../datos.html">Mi vehículo</a> guarda los litros de tu depósito de GLP y tu consumo. A partir de ahí, cada gasolinera del mapa te dirá cuánto cuesta llenarlo, y verás tu autonomía y cuánto ahorras al mes frente a la gasolina o el diésel.</p>

            <h2>7. Guardar tus gasolineras favoritas</h2>
            <p>Pulsa la estrella de cualquier gasolinera para guardarla. En <a href="../../favoritas.html">Mis favoritas</a> verás el precio de hoy de todas ellas y cómo ha cambiado. Si <a href="../../auth.html">creas una cuenta</a> (con tu correo o con Google), tus favoritas y tu vehículo se guardan en ella y los tienes en el móvil y en el ordenador.</p>

            <h2>8. Consultar precios por provincia y municipio</h2>
            <p>En <a href="../../glp/">Precios</a> tienes la media nacional, las gasolineras más baratas de España y una página para cada provincia y para los municipios con varias gasolineras, ordenadas de la más barata a la más cara.</p>

            <h2>9. Recibir el resumen cada mañana</h2>
            <p>Únete al <a href="https://t.me/glpfinder" rel="noopener">canal de Telegram @glpfinder</a> y recibirás cada mañana la media del día y la gasolinera más barata de cada comunidad.</p>

            <h2>10. Instalarla en el móvil</h2>
            <p>glpfinder funciona como una app. En Android, abre la web en Chrome y elige «Instalar aplicación» o «Añadir a pantalla de inicio» en el menú. En iPhone, ábrela en Safari, pulsa el botón de compartir y elige «Añadir a pantalla de inicio».</p>
        </article>`,
    },
  ];
  return guias;
}
