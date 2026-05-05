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
router.get(
  "/google/callback",
  (req, res, next) => {
    if (!googleConfigured) {
      return res.redirect("/login");
    }
    return passport.authenticate("google", {
      failureRedirect: "/login",
      session: true,
    })(req, res, next);
  },
  authController.oauthCallback
);

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
