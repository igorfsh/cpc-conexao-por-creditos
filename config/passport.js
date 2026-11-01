const fs = require("fs");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const {
  FacebookStrategy,
  LinkedInStrategy,
  AppleStrategy,
  lerIdTokenApple,
  lerNomeApple,
} = require("./oauthProviders");
const usuariosModel = require("../app/models/models");
require("dotenv").config();

const appBaseUrl =
  process.env.APP_BASE_URL ||
  process.env.BASE_URL ||
  process.env.APP_URL ||
  `http://localhost:${process.env.APP_PORT || process.env.PORT || 3000}`;

const callbackPara = (provider) =>
  process.env[`${provider.toUpperCase()}_CALLBACK_URL`] || `${appBaseUrl}/auth/${provider}/callback`;

// Erro com código para a tela de login exibir a mensagem certa.
class SocialAuthError extends Error {
  constructor(codigo, mensagem) {
    super(mensagem);
    this.codigo = codigo;
  }
}

const NOMES_PROVEDORES = {
  google: "Google",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  apple: "Apple",
  github: "GitHub",
};

const findOrCreateSocialUser = async ({ provider, providerId, nome, email, foto, emailVerificado }) => {
  if (!provider || !providerId) {
    throw new Error("Provider e providerId são obrigatórios");
  }

  const emailNormalizado = email?.trim().toLowerCase() || null;
  console.log(`🔍 Login social: provider=${provider}, providerId=${providerId}, email=${emailNormalizado}`);

  // 1. Conta que já entrou com este provedor
  let usuario = await usuariosModel.findByProviderId(provider, providerId);
  if (usuario) {
    if (usuario.status && usuario.status !== "ativo") {
      throw new SocialAuthError("conta-inativa", "Esta conta está inativa.");
    }
    return usuariosModel.updateSocialLogin(usuario.id, { foto });
  }

  // 2. Conta existente com o mesmo e-mail: só vincula se o provedor confirmou o e-mail
  if (emailNormalizado) {
    const existente = await usuariosModel.findByEmail(emailNormalizado);
    if (existente) {
      if (!emailVerificado) {
        throw new SocialAuthError(
          "email-nao-verificado",
          `O e-mail da sua conta ${NOMES_PROVEDORES[provider] || provider} não está verificado.`
        );
      }
      if (existente.status && existente.status !== "ativo") {
        throw new SocialAuthError("conta-inativa", "Esta conta está inativa.");
      }
      console.log(`🔗 Vinculando ${provider} à conta existente ${existente.id}`);
      await usuariosModel.linkSocialProvider(existente.id, provider, providerId, foto);
      return usuariosModel.updateSocialLogin(existente.id, { foto });
    }
  }

  // 3. Cadastro novo
  const novoEmail = emailNormalizado || `${provider}-${providerId}@${provider}.local`;
  console.log(`👤 Criando usuário via ${provider}: ${novoEmail}`);
  await usuariosModel.create({
    nome: nome || `Usuário ${NOMES_PROVEDORES[provider] || provider}`,
    email: novoEmail,
    foto: foto || null,
    provider,
    providerId,
    senha: null,
  });

  usuario = await usuariosModel.findByProviderId(provider, providerId);
  if (!usuario) throw new Error(`Falha ao recuperar usuário criado via ${provider}`);
  usuario.novoCadastro = true;
  return usuario;
};

// Adapta o perfil normalizado do Passport ao findOrCreateSocialUser.
const verificarPerfil = (provider, { exigirEmail = false, emailVerificado } = {}) =>
  async (accessToken, refreshToken, profile, done) => {
    try {
      const principal = profile.emails?.find((e) => e.primary) || profile.emails?.[0];
      const email = principal?.value || null;
      if (exigirEmail && !email) {
        throw new SocialAuthError("sem-email", `${NOMES_PROVEDORES[provider]} não compartilhou seu e-mail.`);
      }
      const usuario = await findOrCreateSocialUser({
        provider,
        providerId: profile.id,
        nome: profile.displayName || profile.username || null,
        email,
        foto: profile.photos?.[0]?.value || null,
        emailVerificado: emailVerificado ? emailVerificado(profile) : principal?.verified === true,
      });
      return done(null, usuario);
    } catch (err) {
      console.error(`Erro na estratégia ${provider}:`, err.message);
      return done(err);
    }
  };

const provedoresConfigurados = {};

// ---------- Google ----------
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: callbackPara("google"),
      state: true,
    },
    verificarPerfil("google", {
      exigirEmail: true,
      emailVerificado: (profile) => profile._json?.email_verified === true || profile.emails?.[0]?.verified === true,
    })
  ));
  provedoresConfigurados.google = true;
}

// ---------- Facebook ----------
if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
  passport.use(new FacebookStrategy(
    {
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: callbackPara("facebook"),
      graphVersion: process.env.FACEBOOK_GRAPH_VERSION || "",
    },
    verificarPerfil("facebook")
  ));
  provedoresConfigurados.facebook = true;
}

// ---------- LinkedIn ----------
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  passport.use(new LinkedInStrategy(
    {
      clientID: process.env.LINKEDIN_CLIENT_ID,
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
      callbackURL: callbackPara("linkedin"),
    },
    verificarPerfil("linkedin")
  ));
  provedoresConfigurados.linkedin = true;
}

// ---------- Apple / iCloud ----------
const lerChaveApple = () => {
  if (process.env.APPLE_PRIVATE_KEY) return process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  if (process.env.APPLE_PRIVATE_KEY_PATH) return fs.readFileSync(process.env.APPLE_PRIVATE_KEY_PATH, "utf8");
  return null;
};

const appleChave = lerChaveApple();
if (process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_KEY_ID && appleChave) {
  try {
    passport.use(new AppleStrategy(
      {
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        privateKey: appleChave,
        callbackURL: callbackPara("apple"),
      },
      async (req, accessToken, refreshToken, params, profile, done) => {
        try {
          const claims = lerIdTokenApple(params.id_token, process.env.APPLE_CLIENT_ID);
          const usuario = await findOrCreateSocialUser({
            provider: "apple",
            providerId: claims.sub,
            nome: lerNomeApple(req.query.user || req.body?.user),
            email: claims.email || null,
            foto: null,
            emailVerificado: claims.email_verified === true || claims.email_verified === "true",
          });
          return done(null, usuario);
        } catch (err) {
          console.error("Erro na estratégia apple:", err.message);
          return done(err);
        }
      }
    ));
    provedoresConfigurados.apple = true;
  } catch (err) {
    console.error("Sign in with Apple não configurado: chave privada inválida.", err.message);
  }
}

// ---------- GitHub ----------
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy(
    {
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: callbackPara("github"),
      scope: ["user:email"],
      allRawEmails: true,
      state: true,
    },
    verificarPerfil("github")
  ));
  provedoresConfigurados.github = true;
}

const faltando = Object.keys(NOMES_PROVEDORES).filter((p) => !provedoresConfigurados[p]);
if (faltando.length) {
  console.warn(`Login social não configurado para: ${faltando.join(", ")}. Veja .env.example.`);
}

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const usuario = await usuariosModel.findById(id);
    done(null, usuario);
  } catch (err) {
    done(err);
  }
});

module.exports = {
  provedoresConfigurados,
  NOMES_PROVEDORES,
  findOrCreateSocialUser,
  googleConfigured: Boolean(provedoresConfigurados.google),
  githubConfigured: Boolean(provedoresConfigurados.github),
};
