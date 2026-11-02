// La página es estática y no guarda nada en el navegador.
const year = document.querySelector('#year');

if (year !== null) {
    year.textContent = String(new Date().getFullYear());
}
