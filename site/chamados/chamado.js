// Envio do formulário de chamado. Contrato com ./enviar.php (que fica no servidor e NÃO mudou
// no redesenho de 09/10/2026):
//   POST multipart (FormData) com nome, email, telefone, municipio, orgao, setor, solicitacao
//   e a armadilha "empresa";
//   200 {ok:true, ticket_id}         → chamado criado no GLPI
//   422 {ok:false, error, campos[]}  → campos faltando, inválidos ou longos demais
//   429 / 500 / 502 {ok:false, error} → mensagem do próprio servidor
// Sem JavaScript o <form> ainda posta para o mesmo endereço (action), e o servidor responde
// o JSON cru — feio, mas o chamado é criado.
(function () {
  'use strict';

  var form = document.getElementById('form-chamado');
  if (!form || !window.fetch || !window.FormData) return;

  var botao = document.getElementById('botao-enviar');
  var mensagem = document.getElementById('mensagem');
  var descricao = document.getElementById('solicitacao');
  var contador = document.getElementById('solicitacao-contador');
  var ENDPOINT = './enviar.php';
  var ROTULO_BOTAO = botao.textContent;

  // Sai nas mensagens de falha: é a saída de quem não conseguiu enviar pela página.
  var CONTATO = 'Ligue para (27) 99693-8793 ou escreva para crosssolucoes@outlook.com.';

  // Monta a mensagem com nós de texto, nunca innerHTML: o texto de erro vem do servidor.
  function mostrar(tipo, linhas) {
    mensagem.className = 'aviso aviso--' + tipo;
    mensagem.textContent = '';
    for (var i = 0; i < linhas.length; i++) {
      var p = document.createElement('p');
      if (linhas[i].classe) p.className = linhas[i].classe;
      p.textContent = linhas[i].texto;
      mensagem.appendChild(p);
    }
    mensagem.hidden = false;
  }

  function esconder() {
    mensagem.hidden = true;
    mensagem.textContent = '';
  }

  // Marca os campos que o servidor recusou e leva o foco para o primeiro. Sem lista, só limpa
  // as marcas da tentativa anterior.
  function marcarCampos(campos) {
    var marcados = form.querySelectorAll('[aria-invalid="true"]');
    for (var i = 0; i < marcados.length; i++) marcados[i].removeAttribute('aria-invalid');
    if (!campos || !campos.length) return;

    var primeiro = null;
    for (var j = 0; j < campos.length; j++) {
      var campo = form.elements[campos[j]];
      if (campo && campo.setAttribute) {
        campo.setAttribute('aria-invalid', 'true');
        if (!primeiro) primeiro = campo;
      }
    }
    if (primeiro) primeiro.focus();
  }

  // A marca de erro sai quando a pessoa começa a corrigir aquele campo.
  form.addEventListener('input', function (ev) {
    if (ev.target.getAttribute && ev.target.getAttribute('aria-invalid') === 'true') {
      ev.target.removeAttribute('aria-invalid');
    }
  });

  function atualizarContador() {
    var usados = descricao.value.length;
    var limite = Number(descricao.getAttribute('maxlength')) || 5000;
    contador.textContent = usados === 0
      ? 'Até ' + limite.toLocaleString('pt-BR') + ' caracteres.'
      : usados.toLocaleString('pt-BR') + ' de ' + limite.toLocaleString('pt-BR') + ' caracteres.';
  }
  descricao.addEventListener('input', atualizarContador);

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (botao.disabled) return;

    botao.disabled = true;
    botao.textContent = 'Enviando...';
    esconder();

    fetch(ENDPOINT, { method: 'POST', body: new FormData(form) })
      // Corpo lido como texto e convertido depois: se o PHP falhar antes do json_encode e
      // responder HTML, resposta.json() viraria um erro de sintaxe que esconde o problema real.
      .then(function (resposta) {
        return resposta.text().then(function (corpo) {
          var dados = null;
          try { dados = JSON.parse(corpo); } catch { /* resposta não era JSON */ }
          return { resposta: resposta, dados: (dados && typeof dados === 'object') ? dados : {} };
        });
      })
      .then(function (r) {
        if (r.resposta.ok && r.dados.ok) {
          marcarCampos(null);
          form.reset();
          atualizarContador();
          var linhas = [{ classe: 'aviso-titulo', texto: 'Chamado registrado.' }];
          // O número vem do GLPI e é o mesmo do e-mail de confirmação. Na tela também, para o
          // caso de o e-mail demorar ou cair no spam: a pessoa sai daqui com a referência.
          if (r.dados.ticket_id) {
            linhas.push({ classe: 'aviso-numero', texto: 'Nº ' + r.dados.ticket_id });
          }
          linhas.push({ texto: 'Enviamos uma confirmação para o seu e-mail. A equipe técnica vai entrar em contato em breve.' });
          mostrar('sucesso', linhas);
          mensagem.setAttribute('tabindex', '-1');
          mensagem.focus();
          return;
        }

        // Houve resposta e o servidor tem mensagem própria (no 422, o que faltou): é ela que
        // aparece. E-mail digitado errado não é motivo para mandar a pessoa ligar.
        marcarCampos(r.dados.campos);
        mostrar('erro', [{
          texto: r.dados.error ||
            ('Não foi possível enviar o chamado (resposta ' + r.resposta.status + '). ' + CONTATO)
        }]);
      })
      // Só chega aqui sem resposta nenhuma: sem rede, servidor fora do ar, DNS.
      .catch(function (erro) {
        console.error('Falha ao enviar chamado:', erro);
        mostrar('erro', [{ texto: 'Não foi possível falar com o servidor. ' + CONTATO }]);
      })
      .then(function () {
        botao.disabled = false;
        botao.textContent = ROTULO_BOTAO;
      });
  });
})();
