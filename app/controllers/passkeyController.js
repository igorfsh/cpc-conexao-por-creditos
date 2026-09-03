const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const usuariosModel = require("../models/models");
const passkeysModel = require("../models/passkeysModel");

const rpName = "Conexão por Créditos";
const obterConfiguracaoWebAuthn = (req) => {
  const hostEncaminhado = req.headers["x-forwarded-host"]?.split(",")[0].trim();
  const host = hostEncaminhado || req.get("host") || "localhost";
  const hostname = host.replace(/:\d+$/, "");
  const protocolo = req.headers["x-forwarded-proto"]?.split(",")[0] || req.protocol;
  const origemDaRequisicao = `${protocolo}://${host}`;
  const origemBase = process.env.APP_BASE_URL?.replace(/\/$/, "");
  const rpConfigurado = process.env.WEBAUTHN_RP_ID;
  const origemConfigurada = process.env.WEBAUTHN_ORIGIN || origemBase;
  const rpID = rpConfigurado || hostname;
  const origin = origemConfigurada || origemDaRequisicao;
  return { rpID, origin };
};

const usuarioDaSessao = (req) => req.session?.usuario;
const definirSessao = (req, usuario) => {
  req.session.usuarioId = usuario.id;
  req.session.usuario = {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    foto: usuario.foto || null,
    perfil: usuario.perfil || "user",
  };
};

const obterOpcoesRegistro = async (req, res) => {
  try {
    const { rpID } = obterConfiguracaoWebAuthn(req);
    const usuario = usuarioDaSessao(req);
    const credenciais = await passkeysModel.findByUserId(usuario.id);
    const substituir = req.session.passkeyRegistrationReplace === true
      || req.body?.substituir === true
      || req.body?.substituir === "true"
      || req.body?.substituir === 1;
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: usuario.email,
      userDisplayName: usuario.nome,
      userID: Buffer.from(String(usuario.id), "utf8"),
      attestationType: "none",
      excludeCredentials: substituir ? [] : credenciais.map((credencial) => ({ id: credencial.credentialId, transports: credencial.transports })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
    });
    req.session.passkeyRegistrationChallenge = options.challenge;
    res.json(options);
  } catch (err) {
    console.error("Erro ao gerar opções de registro:", err);
    res.status(500).json({ erro: "Não foi possível iniciar o cadastro biométrico." });
  }
};

const verificarRegistro = async (req, res) => {
  const usuario = usuarioDaSessao(req);
  const challenge = req.session.passkeyRegistrationChallenge;
  const { rpID, origin } = obterConfiguracaoWebAuthn(req);
  if (!challenge) return res.status(400).json({ erro: "Registro expirado. Tente novamente." });
  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
    delete req.session.passkeyRegistrationChallenge;
    if (!verification.verified || !verification.registrationInfo) return res.status(400).json({ erro: "A biometria não foi confirmada." });
    const { credential } = verification.registrationInfo;
    const dadosPasskey = {
      userId: usuario.id,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports || [],
    };
    if (req.session.passkeyRegistrationReplace) await passkeysModel.replaceForUser(dadosPasskey);
    else await passkeysModel.create(dadosPasskey);
    delete req.session.passkeyRegistrationReplace;
    res.json({ ok: true });
  } catch (err) {
    delete req.session.passkeyRegistrationChallenge;
    delete req.session.passkeyRegistrationReplace;
    console.error("Erro ao registrar passkey:", err);
    res.status(400).json({ erro: `Não foi possível ativar a biometria: ${err.message}` });
  }
};

const obterOpcoesLogin = async (req, res) => {
  const { rpID } = obterConfiguracaoWebAuthn(req);
  const identificador = String(req.body.identificador || "").trim().toLowerCase();
  if (!identificador) return res.status(400).json({ erro: "Informe seu email ou usuário." });
  const usuario = await usuariosModel.findByUsuarioOuEmail(identificador);
  if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });
  const credenciais = await passkeysModel.findByUserId(usuario.id);
  if (!credenciais.length) return res.status(400).json({ erro: "Cadastre sua biometria primeiro em Minha conta, após entrar com sua senha." });
  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials: credenciais.map((credencial) => ({ id: credencial.credentialId, transports: credencial.transports })),
    userVerification: "required",
  });
  req.session.passkeyAuthenticationChallenge = options.challenge;
  req.session.passkeyAuthenticationUserId = usuario.id;
  res.json(options);
};

const verificarLogin = async (req, res) => {
  const { rpID, origin } = obterConfiguracaoWebAuthn(req);
  const challenge = req.session.passkeyAuthenticationChallenge;
  const userId = req.session.passkeyAuthenticationUserId;
  if (!challenge || !userId) return res.status(400).json({ erro: "A tentativa expirou. Tente novamente." });
  try {
    const credencial = await passkeysModel.findByCredentialId(req.body.rawId || req.body.id);
    if (!credencial || String(credencial.userId) !== String(userId)) return res.status(401).json({ erro: "Biometria não reconhecida." });
    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: credencial.credentialId, publicKey: Buffer.from(credencial.publicKey, "base64url"), counter: credencial.counter },
      requireUserVerification: true,
    });
    delete req.session.passkeyAuthenticationChallenge;
    delete req.session.passkeyAuthenticationUserId;
    if (!verification.verified) return res.status(401).json({ erro: "Biometria não reconhecida." });
    const usuario = await usuariosModel.findById(userId);
    await passkeysModel.updateCounter(credencial.credentialId, verification.authenticationInfo.newCounter);
    definirSessao(req, usuario);
    res.json({ ok: true, redirect: usuario.perfil === "admin" ? "/adm" : "/" });
  } catch (err) {
    delete req.session.passkeyAuthenticationChallenge;
    delete req.session.passkeyAuthenticationUserId;
    console.error("Erro no login por passkey:", err);
    res.status(401).json({ erro: "Não foi possível validar a biometria." });
  }
};

module.exports = { obterOpcoesRegistro, verificarRegistro, obterOpcoesLogin, verificarLogin };
