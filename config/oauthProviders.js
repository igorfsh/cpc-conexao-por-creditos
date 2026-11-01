// Estratégias OAuth sem pacote dedicado, construídas sobre o passport-oauth2.
const crypto = require("crypto");
const util = require("util");
const OAuth2Strategy = require("passport-oauth2");
const { InternalOAuthError } = require("passport-oauth2");

const lerJSON = (corpo) => (typeof corpo === "string" ? JSON.parse(corpo) : corpo);

const base64url = (valor) => Buffer.from(valor).toString("base64url");

const decodificarJWT = (token) => {
  const partes = String(token || "").split(".");
  if (partes.length !== 3) throw new Error("JWT inválido");
  return JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
};

// ============================================
// Facebook (Graph API)
// ============================================
function FacebookStrategy(options, verify) {
  const versao = options.graphVersion ? `/${options.graphVersion}` : "";
  OAuth2Strategy.call(this, {
    authorizationURL: `https://www.facebook.com${versao}/dialog/oauth`,
    tokenURL: `https://graph.facebook.com${versao}/oauth/access_token`,
    scope: ["email", "public_profile"],
    state: true,
    ...options,
  }, verify);
  this.name = "facebook";
  this._graphURL = `https://graph.facebook.com${versao}`;
}
util.inherits(FacebookStrategy, OAuth2Strategy);

FacebookStrategy.prototype.userProfile = function (accessToken, done) {
  const prova = crypto.createHmac("sha256", this._oauth2._clientSecret).update(accessToken).digest("hex");
  const url = `${this._graphURL}/me?fields=id,name,email,picture.type(large)&appsecret_proof=${prova}`;
  this._oauth2.get(url, accessToken, (err, corpo) => {
    if (err) return done(new InternalOAuthError("Falha ao buscar perfil do Facebook", err));
    try {
      const json = lerJSON(corpo);
      return done(null, {
        provider: "facebook",
        id: String(json.id),
        displayName: json.name,
        // O Facebook só devolve e-mails confirmados pelo usuário.
        emails: json.email ? [{ value: json.email, verified: true }] : [],
        photos: json.picture?.data?.url && !json.picture.data.is_silhouette ? [{ value: json.picture.data.url }] : [],
        _json: json,
      });
    } catch (e) {
      return done(e);
    }
  });
};

// ============================================
// LinkedIn (Sign In with LinkedIn using OpenID Connect)
// ============================================
function LinkedInStrategy(options, verify) {
  OAuth2Strategy.call(this, {
    authorizationURL: "https://www.linkedin.com/oauth/v2/authorization",
    tokenURL: "https://www.linkedin.com/oauth/v2/accessToken",
    scope: ["openid", "profile", "email"],
    scopeSeparator: " ",
    state: true,
    ...options,
  }, verify);
  this.name = "linkedin";
  this._oauth2.useAuthorizationHeaderforGET(true);
}
util.inherits(LinkedInStrategy, OAuth2Strategy);

LinkedInStrategy.prototype.userProfile = function (accessToken, done) {
  this._oauth2.get("https://api.linkedin.com/v2/userinfo", accessToken, (err, corpo) => {
    if (err) return done(new InternalOAuthError("Falha ao buscar perfil do LinkedIn", err));
    try {
      const json = lerJSON(corpo);
      return done(null, {
        provider: "linkedin",
        id: String(json.sub),
        displayName: json.name || [json.given_name, json.family_name].filter(Boolean).join(" "),
        emails: json.email ? [{ value: json.email, verified: json.email_verified === true }] : [],
        photos: json.picture ? [{ value: json.picture }] : [],
        _json: json,
      });
    } catch (e) {
      return done(e);
    }
  });
};

// ============================================
// Apple (Sign in with Apple / iCloud)
// ============================================
const APPLE_ISSUER = "https://appleid.apple.com";

// O client_secret da Apple é um JWT ES256 assinado com a chave .p8 (validade máxima de 6 meses).
const gerarClientSecretApple = ({ teamID, keyID, clientID, privateKey }, validadeSegundos = 60 * 60 * 24 * 30) => {
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64url(JSON.stringify({ alg: "ES256", kid: keyID }));
  const corpo = base64url(JSON.stringify({
    iss: teamID,
    iat: agora,
    exp: agora + validadeSegundos,
    aud: APPLE_ISSUER,
    sub: clientID,
  }));
  const assinatura = crypto.sign("sha256", Buffer.from(`${cabecalho}.${corpo}`), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return { token: `${cabecalho}.${corpo}.${assinatura.toString("base64url")}`, expiraEm: (agora + validadeSegundos) * 1000 };
};

function AppleStrategy(options, verify) {
  const secret = gerarClientSecretApple(options);
  OAuth2Strategy.call(this, {
    authorizationURL: `${APPLE_ISSUER}/auth/authorize`,
    tokenURL: `${APPLE_ISSUER}/auth/token`,
    clientID: options.clientID,
    clientSecret: secret.token,
    callbackURL: options.callbackURL,
    scope: ["name", "email"],
    scopeSeparator: " ",
    state: true,
    passReqToCallback: true,
  }, verify);
  this.name = "apple";
  this._appleOptions = options;
  this._secretExpiraEm = secret.expiraEm;
}
util.inherits(AppleStrategy, OAuth2Strategy);

AppleStrategy.prototype.authenticate = function (req, options) {
  // Renova o client_secret antes de expirar, sem precisar reiniciar o servidor.
  if (Date.now() > this._secretExpiraEm - 24 * 60 * 60 * 1000) {
    const secret = gerarClientSecretApple(this._appleOptions);
    this._oauth2._clientSecret = secret.token;
    this._secretExpiraEm = secret.expiraEm;
  }
  return OAuth2Strategy.prototype.authenticate.call(this, req, options);
};

// Com escopo de nome/e-mail a Apple exige response_mode=form_post.
AppleStrategy.prototype.authorizationParams = function () {
  return { response_mode: "form_post" };
};

// A Apple não tem endpoint de perfil: os dados vêm no id_token da resposta do token.
AppleStrategy.prototype.userProfile = function (accessToken, done) {
  return done(null, {});
};

// O id_token chega direto do endpoint de token da Apple via TLS, então validamos as claims
// (OpenID Connect Core 3.1.3.7 dispensa a checagem de assinatura nesse caso).
const lerIdTokenApple = (idToken, clientID) => {
  const claims = decodificarJWT(idToken);
  if (claims.iss !== APPLE_ISSUER) throw new Error("id_token da Apple com emissor inválido");
  const audiencias = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiencias.includes(clientID)) throw new Error("id_token da Apple com audiência inválida");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("id_token da Apple expirado");
  if (!claims.sub) throw new Error("id_token da Apple sem identificador");
  return claims;
};

// A Apple envia o nome só no primeiro login, no campo "user" do POST de retorno.
const lerNomeApple = (campoUser) => {
  try {
    const user = typeof campoUser === "string" ? JSON.parse(campoUser) : campoUser;
    return [user?.name?.firstName, user?.name?.lastName].filter(Boolean).join(" ") || null;
  } catch (err) {
    return null;
  }
};

module.exports = {
  FacebookStrategy,
  LinkedInStrategy,
  AppleStrategy,
  lerIdTokenApple,
  lerNomeApple,
  gerarClientSecretApple,
  decodificarJWT,
};
