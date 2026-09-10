const usuariosModel = require("../models/models");
const trocasModel = require("../models/trocasModel");
const { validationResult } = require("express-validator");

const cadastroController = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const erroValidacao = {}, msgErro = {};
    errors.array().forEach((erro) => {
      erroValidacao[erro.path] = "input-error";
      msgErro[erro.path] = erro.msg;
    });
    return res.render("pages/login", { valores: req.body, erroValidacao, msgErro, erro: null, sucesso: false });
  }

  try {
    const existe = await usuariosModel.findByEmail(req.body.email);
    if (existe) {
      return res.render("pages/login", {
        valores: req.body,
        erroValidacao: { email: "input-error" },
        msgErro: { email: "*Email já cadastrado!" },
        erro: null,
        sucesso: false,
      });
    }

    const usuarioCriado = await usuariosModel.create({
      nome: req.body.nome.trim(),
      email: req.body.email.toLowerCase(),
      senha: req.body.senha,
    });
    const usuario = usuarioCriado.id
      ? usuarioCriado
      : await usuariosModel.findById(usuarioCriado.insertId);
    if (!usuario) throw new Error("Usuário criado, mas não localizado");
    trocasModel.incrementarMembro();
    await usuariosModel.updateLastLogin(usuario.id);
    req.session.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email, foto: usuario.foto || null, perfil: usuario.perfil || "user", status: usuario.status || "ativo" };
    req.session.usuarioId = usuario.id;
    const destino = req.session.redirectAfterLogin || "/";
    delete req.session.redirectAfterLogin;
    return res.redirect(destino);
  } catch (err) {
    console.error("Erro ao cadastrar:", err);
    return res.render("pages/login", { erro: "Erro ao cadastrar. Tente novamente.", sucesso: false, valores: req.body, erroValidacao: {}, msgErro: {} });
  }
};

const loginController = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const erroValidacao = {}, msgErro = {};
    errors.array().forEach((erro) => {
      erroValidacao[erro.path] = "input-error";
      msgErro[erro.path] = erro.msg;
    });
    return res.render("pages/login", { erro: "*Preencha todos os campos!", sucesso: false, valores: req.body, erroValidacao, msgErro });
  }

  try {
    const usuarioDigitado = req.body.usuarioDigitado.toLowerCase();
    const usuario = await usuariosModel.findByCredentials(usuarioDigitado, req.body.senhaDigitada);
    if (usuario) {
      if (usuario.status && usuario.status !== "ativo") {
        return res.render("pages/login", { erro: "Esta conta está inativa.", sucesso: false, valores: req.body, erroValidacao: {}, msgErro: {} });
      }
      await usuariosModel.updateLastLogin(usuario.id);
      req.session.usuarioId = usuario.id;
      req.session.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email, foto: usuario.foto || null, perfil: usuario.perfil || "user", status: usuario.status || "ativo" };
      if (usuario.perfil === "admin") return res.redirect("/adm");
      const destino = req.session.redirectAfterLogin || "/";
      delete req.session.redirectAfterLogin;
      return res.redirect(destino);
    }

    const existe = await usuariosModel.findByUsuarioOuEmail(usuarioDigitado);
    if (existe) return res.render("pages/login", { erro: null, sucesso: false, valores: req.body, erroValidacao: { senhaDigitada: "input-error" }, msgErro: { senhaDigitada: "*Senha incorreta!" } });
    return res.render("pages/login", { erro: null, sucesso: false, valores: req.body, erroValidacao: { usuarioDigitado: "input-error" }, msgErro: { usuarioDigitado: "Usuário não encontrado!" } });
  } catch (err) {
    console.error("Erro ao fazer login:", err);
    return res.render("pages/login", { erro: "Erro ao fazer login.", sucesso: false, valores: req.body, erroValidacao: {}, msgErro: {} });
  }
};

module.exports = { cadastroController, loginController };
