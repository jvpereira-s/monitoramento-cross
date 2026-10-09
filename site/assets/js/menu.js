// Gaveta de navegação no celular. O <html> já recebeu a classe "js" por um script de uma linha
// no <head> (antes do corpo pintar, para a lista não aparecer aberta e sumir em seguida); este
// arquivo só liga o botão. Sem JavaScript a navegação fica sempre visível — ver site.css.
(function () {
  'use strict';

  var botao = document.querySelector('.menu-botao');
  var menu = document.getElementById(botao ? botao.getAttribute('aria-controls') : '');
  if (!botao || !menu) return;

  function definir(aberto) {
    botao.setAttribute('aria-expanded', aberto ? 'true' : 'false');
    menu.classList.toggle('aberta', aberto);
  }

  botao.addEventListener('click', function () {
    definir(botao.getAttribute('aria-expanded') !== 'true');
  });

  // Escolher um link fecha a gaveta: os links da home são âncoras na mesma página, e sem isto a
  // gaveta aberta cobriria a seção para onde a pessoa acabou de ir.
  menu.addEventListener('click', function (ev) {
    if (ev.target.closest('a')) definir(false);
  });

  // Esc fecha e devolve o foco ao botão, para quem navega por teclado não se perder.
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && botao.getAttribute('aria-expanded') === 'true') {
      definir(false);
      botao.focus();
    }
  });

  // Voltou para a largura de computador com a gaveta aberta: fecha, senão ela reaparece aberta
  // na próxima vez que a janela estreitar.
  var largo = window.matchMedia('(min-width: 961px)');
  var aoMudar = function (e) { if (e.matches) definir(false); };
  if (largo.addEventListener) largo.addEventListener('change', aoMudar);
  else if (largo.addListener) largo.addListener(aoMudar);
})();
