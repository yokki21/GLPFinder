// Navegación común: marca la página actual y abre/cierra el menú en móvil
(function () {
    const header = document.querySelector('header');
    const boton = document.querySelector('.nav-toggle');
    const actual = location.pathname.split('/').pop() || 'index.html';

    document.querySelectorAll('.nav-links > a').forEach(a => {
        if (a.getAttribute('href') === actual) a.setAttribute('aria-current', 'page');
    });

    if (!header || !boton) return;
    const cerrar = () => {
        header.classList.remove('menu-abierto');
        boton.setAttribute('aria-expanded', 'false');
        boton.setAttribute('aria-label', 'Abrir menú');
    };
    boton.addEventListener('click', () => {
        const abierto = header.classList.toggle('menu-abierto');
        boton.setAttribute('aria-expanded', String(abierto));
        boton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
    });
    document.addEventListener('click', e => { if (!header.contains(e.target)) cerrar(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrar(); });
})();
