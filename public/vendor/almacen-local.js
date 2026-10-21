// Caché de los precios en el navegador (IndexedDB), con la misma interfaz que idb-keyval: idbKeyval.get / idbKeyval.set.
// Si IndexedDB no está disponible (modo privado de algunos navegadores), las promesas fallan y la web descarga los datos.
(function () {
    var promesaBD = null;
    function bd() {
        if (!promesaBD) {
            promesaBD = new Promise(function (ok, ko) {
                var pet = indexedDB.open('keyval-store', 1);
                pet.onupgradeneeded = function () { pet.result.createObjectStore('keyval'); };
                pet.onsuccess = function () { ok(pet.result); };
                pet.onerror = function () { promesaBD = null; ko(pet.error); };
            });
        }
        return promesaBD;
    }
    function operar(modo, fn) {
        return bd().then(function (db) {
            return new Promise(function (ok, ko) {
                var tx = db.transaction('keyval', modo);
                var pet = fn(tx.objectStore('keyval'));
                tx.oncomplete = function () { ok(pet.result); };
                tx.onerror = tx.onabort = function () { ko(tx.error); };
            });
        });
    }
    window.idbKeyval = {
        get: function (clave) { return operar('readonly', function (s) { return s.get(clave); }); },
        set: function (clave, valor) { return operar('readwrite', function (s) { return s.put(valor, clave); }).then(function () { }); }
    };
})();
