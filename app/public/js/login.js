// ================= OVERLAY =================
const signUpButton = document.getElementById('signUp');
const signInButton = document.getElementById('signIn');
const container = document.getElementById('container');

signUpButton.addEventListener('click', () => {
  container.classList.add("right-panel-active");
});

signInButton.addEventListener('click', () => {
  container.classList.remove("right-panel-active");
});

const mobileSignUp = document.getElementById('mobileSignUp');
const mobileSignIn = document.getElementById('mobileSignIn');

mobileSignUp.addEventListener('click', () => {
  container.classList.add("right-panel-active");
});

mobileSignIn.addEventListener('click', () => {
  container.classList.remove("right-panel-active");
});

// ================= FEEDBACK =================
function mostrarFeedback(form, tipo) {
  form.classList.remove('error', 'success');
  form.classList.add(tipo);

  setTimeout(() => {
    form.classList.remove(tipo);
  }, 1500);
}

// ================= ERRO / SUCESSO =================
function mostrarErro(input, mensagem) {
  let p = input.parentNode.querySelector('.msgErro');

  if (!p) {
    p = document.createElement('p');
    p.className = 'msgErro';
    input.insertAdjacentElement('afterend', p);
  }

  p.textContent = mensagem;

  input.classList.add('input-error');
  input.classList.remove('input-success');

  // animação
  input.classList.add('shake');
  setTimeout(() => input.classList.remove('shake'), 400);
}

function limparErro(input) {
  const p = input.parentNode.querySelector('.msgErro');
  if (p) p.remove();

  input.classList.remove('input-error');
}

function marcarSucesso(input) {
  input.classList.remove('input-error');
  input.classList.add('input-success');
}

// ================= LOGIN =================
const loginForm = document.querySelector('.sign-in-container form');

const usuarioLogin = loginForm.querySelector('input[name="usuarioDigitado"]');
const senhaLogin = loginForm.querySelector('input[name="senhaDigitada"]');

// validação em tempo real
usuarioLogin.addEventListener('input', () => {
  if (usuarioLogin.value.trim() !== "") {
    limparErro(usuarioLogin);
    marcarSucesso(usuarioLogin);
  }
});

senhaLogin.addEventListener('input', () => {
  if (senhaLogin.value.trim() !== "") {
    limparErro(senhaLogin);
    marcarSucesso(senhaLogin);
  }
});

loginForm.addEventListener('submit', (e) => {
  let valido = true;

  limparErro(usuarioLogin);
  limparErro(senhaLogin);

  const usuarioVazio = usuarioLogin.value.trim() === "";
  const senhaVazia = senhaLogin.value.trim() === "";

  if (usuarioVazio && senhaVazia) {
    // Mostrar erro visual nos dois campos
    usuarioLogin.classList.add('input-error');
    // Mostrar mensagem em baixo do campo senha
    mostrarErro(senhaLogin, "É obrigatório o preenchimento de todos os campos.");
    valido = false;
  } else {
    if (usuarioVazio) {
      mostrarErro(usuarioLogin, "Preencha o seu usuario.");
      valido = false;
    }

    if (senhaVazia) {
      mostrarErro(senhaLogin, "Digita sua senha.");
      valido = false;
    }
  }

  if (!valido) {
    e.preventDefault();
    mostrarFeedback(loginForm, 'error');
  } else {
    mostrarFeedback(loginForm, 'success');
  }
});

// ================= CADASTRO =================
const cadastroForm = document.querySelector('.sign-up-container form');

const usuarioCad = cadastroForm.querySelector('input[name="nome"]');
const emailCad = cadastroForm.querySelector('input[name="email"]');
const senhaCad = cadastroForm.querySelector('input[name="senha"]');
const confirmarCad = cadastroForm.querySelector('input[name="confirmarSenha"]');
const forcaSenha = document.querySelector('#forca-senha');
const barrasSenha = [...forcaSenha.querySelectorAll('.password-strength__bar')];
const rotuloForcaSenha = forcaSenha.querySelector('.password-strength__label');

function avaliarForcaSenha(senha) {
  if (!senha) return { classe: '', texto: 'Digite uma senha', preenchidos: 0 };

  let pontos = 0;
  if (senha.length >= 6) pontos += 1;
  if (senha.length >= 10) pontos += 1;
  if (/[a-z]/.test(senha) && /[A-Z]/.test(senha)) pontos += 1;
  if (/\d/.test(senha)) pontos += 1;
  if (/[^A-Za-z0-9]/.test(senha)) pontos += 1;

  if (pontos <= 2) return { classe: 'weak', texto: 'Senha fraca', preenchidos: 1 };
  if (pontos <= 4) return { classe: 'medium', texto: 'Senha razoável', preenchidos: 2 };
  return { classe: 'strong', texto: 'Senha forte', preenchidos: 3 };
}

function atualizarForcaSenha() {
  const avaliacao = avaliarForcaSenha(senhaCad.value);
  forcaSenha.className = `password-strength ${avaliacao.classe}`;
  barrasSenha.forEach((barra, indice) => {
    barra.classList.toggle('is-active', indice < avaliacao.preenchidos);
  });
  rotuloForcaSenha.textContent = avaliacao.texto;
}

// Mesma regra do servidor (router.js): nome e sobrenome, só letras.
const NOME_COMPLETO = /^[A-Za-zÀ-ÖØ-öø-ÿ'`´.-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ'`´.-]+)+$/;
function erroNome(valor) {
  const nome = valor.trim();
  if (nome.split(/\s+/).filter(Boolean).length < 2) return "Informe seu nome e sobrenome.";
  if (!NOME_COMPLETO.test(nome)) return "Use seu nome real, só com letras (sem números ou apelidos).";
  return null;
}

// validação em tempo real
usuarioCad.addEventListener('input', () => {
  if (!erroNome(usuarioCad.value)) {
    limparErro(usuarioCad);
    marcarSucesso(usuarioCad);
  }
});

emailCad.addEventListener('input', () => {
  if (emailCad.value.includes("@") && emailCad.value.includes(".")) {
    limparErro(emailCad);
    marcarSucesso(emailCad);
  }
});

senhaCad.addEventListener('input', () => {
  atualizarForcaSenha();
  if (senhaCad.value.length >= 6) {
    limparErro(senhaCad);
    marcarSucesso(senhaCad);
  } else {
    senhaCad.classList.remove('input-success');
  }
});

confirmarCad.addEventListener('input', () => {
  if (confirmarCad.value === senhaCad.value && confirmarCad.value !== "") {
    limparErro(confirmarCad);
    marcarSucesso(confirmarCad);
  }
});

cadastroForm.addEventListener('submit', (e) => {
  let valido = true;

  [usuarioCad, emailCad, senhaCad, confirmarCad].forEach(limparErro);

  const usuarioCadVazia = usuarioCad.value.trim() === "";
  const emailCadVazia = emailCad.value.trim() === "";
  const senhaCadVazia = senhaCad.value.trim() === "";
  const confirmarCadVazia = confirmarCad.value.trim() === "";

  // CAMPOS VAZIOS → TODOS FICAM VERMELHOS
  if (usuarioCadVazia || emailCadVazia || senhaCadVazia || confirmarCadVazia) {
    [usuarioCad, emailCad, senhaCad, confirmarCad].forEach(input => {
      input.classList.add('input-error');
    });

    mostrarErro(confirmarCad, "É obrigatório o preenchimento de todos os campos.");
    valido = false;
  }

  // validações normais (somente se não estiver vazio)
  if (!usuarioCadVazia && erroNome(usuarioCad.value)) {
    mostrarErro(usuarioCad, erroNome(usuarioCad.value));
    valido = false;
  } else if (!usuarioCadVazia) {
    marcarSucesso(usuarioCad);
  }

  if (!emailCadVazia && (!emailCad.value.includes("@") || !emailCad.value.includes("."))) {
    mostrarErro(emailCad, "Digite um email válido!");
    valido = false;
  } else if (!emailCadVazia) {
    marcarSucesso(emailCad);
  }

  if (!senhaCadVazia && senhaCad.value.length < 6) {
    mostrarErro(senhaCad, "Senha deve ter no mínimo 6 caracteres!");
    valido = false;
  } else if (!senhaCadVazia) {
    marcarSucesso(senhaCad);
  }

  if (!confirmarCadVazia && senhaCad.value !== confirmarCad.value) {
    mostrarErro(confirmarCad, "As senhas não coincidem!");
    valido = false;
  } else if (!confirmarCadVazia) {
    marcarSucesso(confirmarCad);
  }

  if (!valido) {
    e.preventDefault();
    mostrarFeedback(cadastroForm, 'error');
  } else {
    mostrarFeedback(cadastroForm, 'success');
  }
});