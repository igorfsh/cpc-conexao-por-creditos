(async () => {
  const converterBase64Url = (valor) => {
    const base64 = valor.replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "=")), (caractere) => caractere.charCodeAt(0));
    return bytes.buffer;
  };

  const prepararOpcoes = (opcoes) => {
    opcoes.challenge = converterBase64Url(opcoes.challenge);
    if (opcoes.user?.id) opcoes.user.id = converterBase64Url(opcoes.user.id);
    if (opcoes.allowCredentials) {
      opcoes.allowCredentials = opcoes.allowCredentials.map((credencial) => ({
        ...credencial,
        id: converterBase64Url(credencial.id),
      }));
    }
    if (opcoes.excludeCredentials) {
      opcoes.excludeCredentials = opcoes.excludeCredentials.map((credencial) => ({
        ...credencial,
        id: converterBase64Url(credencial.id),
      }));
    }
    return opcoes;
  };

  const converterArrayBuffer = (valor) => {
    const bytes = new Uint8Array(valor);
    let binario = "";
    for (let inicio = 0; inicio < bytes.length; inicio += 0x8000) {
      binario += String.fromCharCode(...bytes.subarray(inicio, inicio + 0x8000));
    }
    return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const serializarCredencial = (credencial) => ({
    id: credencial.id,
    rawId: converterArrayBuffer(credencial.rawId),
    type: credencial.type,
    response: {
      clientDataJSON: converterArrayBuffer(credencial.response.clientDataJSON),
      ...(credencial.response.attestationObject && {
        attestationObject: converterArrayBuffer(credencial.response.attestationObject),
      }),
      ...(credencial.response.authenticatorData && {
        authenticatorData: converterArrayBuffer(credencial.response.authenticatorData),
      }),
      ...(credencial.response.signature && {
        signature: converterArrayBuffer(credencial.response.signature),
      }),
      ...(credencial.response.userHandle && {
        userHandle: converterArrayBuffer(credencial.response.userHandle),
      }),
    },
  });

  const requisicao = async (url, body) => {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const tipoConteudo = resposta.headers.get("content-type") || "";
    if (!tipoConteudo.includes("application/json")) {
      throw new Error("O servidor não respondeu corretamente. Reinicie a aplicação e tente novamente.");
    }
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível concluir a operação.");
    return dados;
  };

  const mostrarMensagem = (elemento, mensagem, erro = false) => {
    if (!elemento) return;
    elemento.textContent = mensagem;
    elemento.classList.toggle("error", erro);
  };

  const concluirCadastro = () => {
    const eraAlteracao = botaoCadastro.dataset.passkeyExistente === "true";
    botaoCadastro.dataset.passkeyExistente = "true";
    botaoCadastro.hidden = false;
    const texto = document.querySelector("#textoCadastroBiometria");
    if (texto) texto.textContent = "Alterar chave de acesso";
    const status = document.querySelector(".passkey-status");
    if (status) {
      status.textContent = "Ativo neste dispositivo";
      status.classList.add("is-active");
    }
    if (!eraAlteracao) mostrarMensagem(mensagem, "Chave de acesso ativada neste dispositivo.");
  };

  const botaoCadastro = document.querySelector("#cadastrarBiometria");
  const botaoLogin = document.querySelector("#entrarBiometria");
  const mensagem = document.querySelector("#mensagemBiometria");
  const ehMobile = window.matchMedia("(max-width: 768px)").matches;

  if (!ehMobile) {
    [botaoCadastro, botaoLogin].forEach((botao) => { if (botao) botao.hidden = true; });
    return;
  }

  if (!window.PublicKeyCredential) {
    [botaoCadastro, botaoLogin].forEach((botao) => { if (botao) botao.hidden = true; });
    return;
  }

  if (!window.isSecureContext) {
    mostrarMensagem(mensagem, "O Face ID precisa de uma conexão HTTPS para funcionar.", true);
    [botaoCadastro, botaoLogin].forEach((botao) => { if (botao) botao.disabled = true; });
    return;
  }

  const verificarAutenticadorNativo = window.PublicKeyCredential
    .isUserVerifyingPlatformAuthenticatorAvailable;
  const autenticadorNativoDisponivel = typeof verificarAutenticadorNativo === "function"
    && await verificarAutenticadorNativo.call(window.PublicKeyCredential);
  const textoCadastro = document.querySelector("#textoCadastroBiometria");
  const textoLogin = document.querySelector("#textoLoginBiometria");

  if (autenticadorNativoDisponivel) {
    if (textoCadastro) textoCadastro.textContent = "Ativar Face ID ou biometria digital";
    if (textoLogin) textoLogin.textContent = "Entrar com Face ID ou biometria digital";
  } else {
    if (textoCadastro) textoCadastro.textContent = "Configurar biometria digital";
    if (textoLogin) textoLogin.textContent = "Usar biometria digital";
    mostrarMensagem(mensagem, "Ative a biometria digital nas configurações do dispositivo para continuar.", true);
    [botaoCadastro, botaoLogin].forEach((botao) => { if (botao) botao.disabled = true; });
  }

  botaoCadastro?.addEventListener("click", async () => {
    botaoCadastro.disabled = true;
    mostrarMensagem(mensagem, "Siga as instruções do dispositivo...");
    try {
      const substituir = botaoCadastro.dataset.passkeyExistente === "true";
      const opcoes = prepararOpcoes(await requisicao("/api/passkeys/registro/opcoes", { substituir }));
      const credencial = await navigator.credentials.create({ publicKey: opcoes });
      if (!credencial) throw new Error("O dispositivo não retornou uma credencial.");
      await requisicao("/api/passkeys/registro/verificar", serializarCredencial(credencial));
      mostrarMensagem(mensagem, "Biometria ativada com sucesso neste dispositivo.");
      concluirCadastro();
    } catch (erro) {
      console.error("Erro no cadastro da passkey:", erro);
      mostrarMensagem(mensagem, erro.name === "NotAllowedError" ? "Operação cancelada ou expirada." : (erro.message || "Não foi possível concluir o cadastro."), true);
    } finally {
      botaoCadastro.disabled = false;
    }
  });

  botaoLogin?.addEventListener("click", async () => {
    const identificador = document.querySelector('input[name="usuarioDigitado"]')?.value.trim();
    botaoLogin.disabled = true;
    mostrarMensagem(mensagem, "Confirme sua identidade no dispositivo...");
    try {
      const opcoes = prepararOpcoes(await requisicao("/api/passkeys/login/opcoes", { identificador }));
      const credencial = await navigator.credentials.get({ publicKey: opcoes });
      if (!credencial) throw new Error("O dispositivo não retornou uma credencial.");
      const resultado = await requisicao("/api/passkeys/login/verificar", serializarCredencial(credencial));
      window.location.href = resultado.redirect || "/";
    } catch (erro) {
      console.error("Erro no login da passkey:", erro);
      mostrarMensagem(mensagem, erro.name === "NotAllowedError" ? "Operação cancelada ou expirada." : (erro.message || "Não foi possível concluir o login."), true);
      botaoLogin.disabled = false;
    }
  });
})();
