const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const GitHubStrategy = require("passport-github2").Strategy;
const usuariosModel = require("../app/models/models");
require("dotenv").config();
 
const googleClientID = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const appBaseUrl =
  process.env.APP_BASE_URL ||
  process.env.BASE_URL ||
  process.env.APP_URL ||
  `http://localhost:${process.env.APP_PORT || process.env.PORT || 3000}`;
const googleCallbackURL = process.env.GOOGLE_CALLBACK_URL || `${appBaseUrl}/auth/google/callback`;
 
const githubClientID = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const githubCallbackURL = process.env.GITHUB_CALLBACK_URL || `${appBaseUrl}/auth/github/callback`;
 
const googleConfigured = Boolean(googleClientID && googleClientSecret);
const githubConfigured = Boolean(githubClientID && githubClientSecret);
 
const findOrCreateSocialUser = async ({ provider, providerId, nome, email, foto }) => {
  if (!provider || !providerId) {
    throw new Error("Provider e providerId são obrigatórios");
  }
 
  const emailNormalizado = email?.toLowerCase() || null;
  console.log(`🔍 Buscando usuário social: provider=${provider}, providerId=${providerId}, email=${emailNormalizado}`);
 
  let usuario = await usuariosModel.findByProviderId(provider, providerId);
 
  if (!usuario && emailNormalizado) {
    console.log(`🔍 Usuário não encontrado por providerId, buscando por email: ${emailNormalizado}`);
    usuario = await usuariosModel.findByEmail(emailNormalizado);
    if (usuario) {
      console.log(`✅ Usuário encontrado por email: ${usuario.nome}`);
    }
  }
 
  if (!usuario) {
    const novoEmail = emailNormalizado || `${provider}-${providerId}@${provider}.local`;
    console.log(`👤 Criando novo usuário: nome=${nome}, email=${novoEmail}, provider=${provider}`);
 
    const resultadoCriacao = await usuariosModel.create({
      nome: nome || `Usuário ${provider}`,
      email: novoEmail,
      foto: foto || null,
      provider,
      providerId,
      senha: null,
    });
 
    console.log(`✅ Usuário criado com ID: ${resultadoCriacao.id || resultadoCriacao.insertId}`);
 
    usuario = await usuariosModel.findByProviderId(provider, providerId);
    if (usuario) {
      console.log(`✅ Usuário recuperado após criação: ${usuario.nome} (ID: ${usuario.id})`);
    } else {
      console.error(`❌ Falha ao recuperar usuário após criação!`);
    }
  } else {
    console.log(`✅ Usuário já existe: ${usuario.nome} (ID: ${usuario.id})`);
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
          console.log("🔔 Google profile recebido:", {
            id: profile.id,
            displayName: profile.displayName,
            emails: profile.emails,
            photos: profile.photos,
          });
 
          const email = profile.emails?.[0]?.value?.toLowerCase() || null;
          if (!email) {
            console.error("❌ Google não forneceu email no profile:", profile.emails);
            return done(new Error("Google não forneceu email. Verifique as permissões de e-mail."));
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