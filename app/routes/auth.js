const express = require("express");
const passport = require("passport");
const authController = require("../controllers/authController");
const { googleConfigured, githubConfigured } = require("../../config/passport");
 
const router = express.Router();
 
// Inicia fluxo de autenticação Google
router.get("/google", (req, res, next) => {
  if (!googleConfigured) {
    return res.redirect("/login");
  }
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })(req, res, next);
});
 
// Callback do Google
router.get("/google/callback", (req, res, next) => {
  if (!googleConfigured) {
    console.warn("Google OAuth não configurado, redirect /login");
    return res.redirect("/login");
  }
 
  console.log("🔁 Recebido callback /auth/google/callback", {
    query: req.query,
    sessionID: req.sessionID,
  });
 
  passport.authenticate("google", (err, user, info) => {
    if (err) {
      console.error("❌ Erro no Passport Google callback:", err, info);
      return res.redirect("/login");
    }
 
    if (!user) {
      console.warn("⚠️ Autenticação Google falhou, usuário não retornado.", info);
      return res.redirect("/login");
    }
 
    req.logIn(user, (loginErr) => {
      if (loginErr) {
        console.error("❌ Falha ao logar usuário no callback Google:", loginErr);
        return res.redirect("/login");
      }
 
      return authController.oauthCallback(req, res);
    });
  })(req, res, next);
});
 
// Inicia fluxo de autenticação GitHub
router.get("/github", (req, res, next) => {
  if (!githubConfigured) {
    return res.redirect("/login");
  }
  passport.authenticate("github", {
    scope: ["user:email"],
  })(req, res, next);
});
 
// Callback do GitHub
router.get(
  "/github/callback",
  (req, res, next) => {
    if (!githubConfigured) {
      return res.redirect("/login");
    }
    return passport.authenticate("github", {
      failureRedirect: "/login",
      session: true,
    })(req, res, next);
  },
  authController.oauthCallback
);
 
module.exports = router;