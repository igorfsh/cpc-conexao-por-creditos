const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const usuariosModel = require("../app/models/models");
require("dotenv").config();

const googleClientID = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleCallbackURL = process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback";

const githubClientID = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const githubCallbackURL = process.env.GITHUB_CALLBACK_URL || "http://localhost:3000/auth/github/callback";

const googleConfigured = Boolean(googleClientID && googleClientSecret);
const githubConfigured = Boolean(githubClientID && githubClientSecret);

const findOrCreateSocialUser = async ({ provider, providerId, nome, email, foto }) => {
  if (!provider || !providerId) {
    throw new Error("Provider e providerId são obrigatórios");
  }

  const emailNormalizado = email?.toLowerCase() || null;
  let usuario = await usuariosModel.findByProviderId(provider, providerId);

  if (!usuario && emailNormalizado) {
    usuario = await usuariosModel.findByEmail(emailNormalizado);
  }

  if (!usuario) {
    const novoEmail = emailNormalizado || `${provider}-${providerId}@${provider}.local`;

    await usuariosModel.create({
      nome: nome || `Usuário ${provider}`,
      email: novoEmail,
      foto: foto || null,
      provider,
      providerId,
      senha: null,
    });

    usuario = await usuariosModel.findByProviderId(provider, providerId);
  }

  return usuario;
};

if (googleConfigured) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: googleClientID,
        clientSecret: googleClientSecret,
        callbackURL: googleCallbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase();
          if (!email) {
            return done(new Error("Google não forneceu email."));
          }

          const usuario = await findOrCreateSocialUser({
            provider: "google",
            providerId: profile.id,
            nome: profile.displayName || profile.name?.givenName || "Usuário Google",
            email,
            foto: profile.photos?.[0]?.value || null,
          });

          return done(null, usuario);
        } catch (err) {
          console.error("Erro na estratégia Google OAuth:", err);
          return done(err);
        }
      }
    )
  );
} else {
  console.warn("Google OAuth não configurado. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente.");
}

if (githubConfigured) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: githubClientID,
        clientSecret: githubClientSecret,
        callbackURL: githubCallbackURL,
        scope: ["user:email"],
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value?.toLowerCase() || null;
          const fallbackEmail = profile.username
            ? `${profile.username}@github.local`
            : `github-${profile.id}@github.local`;

          const usuario = await findOrCreateSocialUser({
            provider: "github",
            providerId: profile.id,
            nome: profile.displayName || profile.username || "Usuário GitHub",
            email: email || fallbackEmail,
            foto: profile.photos?.[0]?.value || null,
          });

          return done(null, usuario);
        } catch (err) {
          console.error("Erro na estratégia GitHub OAuth:", err);
          return done(err);
        }
      }
    )
  );
} else {
  console.warn("GitHub OAuth não configurado. Defina GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET no ambiente.");
}

module.exports = {
  googleConfigured,
  githubConfigured,
};

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
