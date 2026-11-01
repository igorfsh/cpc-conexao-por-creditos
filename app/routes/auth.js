const express = require("express");
const passport = require("passport");
const authController = require("../controllers/authController");
const { provedoresConfigurados } = require("../../config/passport");

const router = express.Router();

const opcoesInicio = {
  google: { scope: ["profile", "email"], prompt: "select_account" },
  facebook: { scope: ["email", "public_profile"] },
  linkedin: {},
  apple: {},
  github: { scope: ["user:email"] },
};

const exigirProvedor = (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const provider = req.params.provider || req.path.split("/")[1];
  if (!provedoresConfigurados[provider]) {
    return res.redirect("/login?erro=provedor-indisponivel");
  }
  next();
};

// Inicia o fluxo: /auth/google, /auth/facebook, /auth/linkedin, /auth/apple, /auth/github
router.get("/:provider", exigirProvedor, (req, res, next) => {
  const { provider } = req.params;
  req.session.oauthStartedAt = Date.now();
  // Salva a sessão antes de sair do site para o state do OAuth sobreviver ao retorno.
  req.session.save((sessionError) => {
    if (sessionError) {
      console.error(`❌ Falha ao iniciar sessão OAuth ${provider}:`, sessionError);
      return res.redirect("/login?erro=social");
    }
    passport.authenticate(provider, opcoesInicio[provider])(req, res, next);
  });
});

// A Apple devolve via POST (form_post) vindo de outro site: em "lax" o cookie de sessão não vem.
// Redirecionamos para o GET do mesmo callback, que é uma navegação comum e traz o cookie.
router.post("/apple/callback", exigirProvedor, (req, res) => {
  const params = new URLSearchParams();
  ["code", "state", "error", "user"].forEach((campo) => {
    if (req.body?.[campo]) params.set(campo, req.body[campo]);
  });
  res.redirect(303, `/auth/apple/callback?${params.toString()}`);
});

router.get("/:provider/callback", exigirProvedor, (req, res, next) => {
  const { provider } = req.params;

  if (req.query.error) {
    console.warn(`⚠️ ${provider} retornou erro:`, req.query.error, req.query.error_description || "");
    const cancelado = ["access_denied", "user_cancelled_login", "user_cancelled_authorize"].includes(req.query.error);
    return res.redirect(`/login?erro=${cancelado ? "social-cancelado" : "social"}`);
  }

  passport.authenticate(provider, (err, user, info) => {
    if (err) {
      console.error(`❌ Erro no callback ${provider}:`, err.message || err);
      return res.redirect(`/login?erro=${err.codigo || "social"}`);
    }
    if (!user) {
      console.warn(`⚠️ Autenticação ${provider} sem usuário:`, info);
      return res.redirect("/login?erro=social-expirado");
    }

    // O Passport regenera a sessão no login; guardamos o destino para não perdê-lo.
    const destino = req.session.redirectAfterLogin;
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error(`❌ Falha ao logar usuário no callback ${provider}:`, loginErr);
        return res.redirect("/login?erro=social");
      }
      if (destino) req.session.redirectAfterLogin = destino;
      return authController.oauthCallback(req, res);
    });
  })(req, res, next);
});

module.exports = router;
