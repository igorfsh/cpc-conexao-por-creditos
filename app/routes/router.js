const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");
const usuariosModel = require("../models/models");
const anunciosModel = require("../models/anunciosModel");
const trocasModel = require("../models/trocasModel");

const autenticado = (req, res, next) => {
  if (req.session && req.session.usuario) return next();
  res.redirect("/login");
};

router.get("/login", (req, res) => {
  if (req.session && req.session.usuario) return res.redirect("/");
  res.render("pages/login", { erro: null, sucesso: null, valores: {}, erroValidacao: {}, msgErro: {} });
});

router.get("/cadastro", (req, res) => {
  if (req.session && req.session.usuario) return res.redirect("/");
  res.render("pages/login", { erro: null, sucesso: null, valores: {}, erroValidacao: {}, msgErro: {} });
});

// HOME com estatísticas reais
router.get("/", (req, res) => {
  try {
    const stats = trocasModel.getStats();
    res.render("pages/home", {
      membrosAtivos: stats.membrosAtivos.toLocaleString('pt-BR'),
      trocasRealizadas: stats.trocasRealizadas.toLocaleString('pt-BR'),
      totalDoacoes: trocasModel.formatarValor(stats.totalDoacoesReais * 100),
    });
  } catch (err) {
    console.error("Erro home:", err);
    res.render("pages/home", { membrosAtivos: "0", trocasRealizadas: "0", totalDoacoes: "R$ 0" });
  }
});

// LISTAGENS com dados reais
router.get("/todos", (req, res) => {
  const busca = req.query.busca || '';
  const anuncios = anunciosModel.findAll({ busca });
  res.render("pages/todos", { anuncios, busca });
});

router.get("/kids", (req, res) => {
  const busca = req.query.busca || '';
  const anuncios = anunciosModel.findAll({ categoria: 'infantil', busca });
  res.render("pages/infantil", { anuncios, busca });
});

router.get("/alimentos", (req, res) => {
  const busca = req.query.busca || '';
  const anuncios = anunciosModel.findAll({ categoria: 'alimentos', busca });
  res.render("pages/alimentos", { anuncios, busca });
});

router.get("/profissionais", (req, res) => {
  const busca = req.query.busca || '';
  const anuncios = anunciosModel.findAll({ categoria: 'profissionais', busca });
  res.render("pages/profissionais", { anuncios, busca });
});

// CONTATO / ANÚNCIO INDIVIDUAL
router.get("/contato/:id", (req, res) => {
  const anuncio = anunciosModel.findById(req.params.id);
  if (!anuncio) return res.redirect("/todos");
  res.render("pages/contato-troca", { anuncio });
});

router.get("/contato", (req, res) => {
  const anuncios = anunciosModel.findAll();
  const anuncio = anuncios[0] || null;
  res.render("pages/contato-troca", { anuncio });
});

// RESUMO DE TROCA
router.get("/resumo/:anuncioId", (req, res) => {
  const anuncio = anunciosModel.findById(req.params.anuncioId);
  if (!anuncio) return res.redirect("/todos");
  req.session.anuncioPendente = anuncio;
  res.render("pages/resumo-troca", { anuncio });
});

router.get("/resumo", (req, res) => {
  const anuncio = req.session.anuncioPendente || null;
  res.render("pages/resumo-troca", { anuncio });
});

// CONFIRMAR TROCA - registra no banco e atualiza stats
router.post("/confirmar-troca", (req, res) => {
  try {
    const { anuncioId, anuncioTitulo, mensagem } = req.body;
    const usuario = req.session.usuario;
    trocasModel.create({
      anuncioId,
      anuncioTitulo: anuncioTitulo || 'Anúncio CPC',
      solicitanteNome: usuario ? usuario.nome : (req.body.nome || 'Visitante'),
      solicitanteEmail: usuario ? usuario.email : (req.body.email || ''),
      mensagem: mensagem || '',
    });
    delete req.session.anuncioPendente;
    res.redirect("/obrigado");
  } catch (err) {
    console.error("Erro confirmar troca:", err);
    res.redirect("/obrigado");
  }
});

// NOVO ANÚNCIO (doador cadastra item/serviço)
router.get("/novo-anuncio", (req, res) => {
  res.render("pages/novo-anuncio", { erro: null, sucesso: null, valores: {} });
});

router.post("/novo-anuncio",
  body("titulo").trim().notEmpty().withMessage("Título é obrigatório"),
  body("descricao").trim().notEmpty().withMessage("Descrição é obrigatória"),
  body("categoria").notEmpty().withMessage("Categoria é obrigatória"),
  body("pontos").isInt({ min: 1, max: 100 }).withMessage("Pontos: 1 a 100"),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.render("pages/novo-anuncio", {
        erro: errors.array().map(e => e.msg).join(' | '),
        sucesso: null,
        valores: req.body,
      });
    }
    try {
      const usuario = req.session.usuario;
      anunciosModel.create({
        titulo: req.body.titulo,
        descricao: req.body.descricao,
        categoria: req.body.categoria,
        pontos: req.body.pontos,
        tipo: req.body.tipo || 'produto',
        doadorId: usuario ? usuario.id : null,
        doadorNome: usuario ? usuario.nome : (req.body.doadorNome || 'Usuário CPC'),
        doadorLocal: req.body.doadorLocal || 'São Paulo-SP',
      });
      res.render("pages/novo-anuncio", { erro: null, sucesso: "Anúncio cadastrado com sucesso!", valores: {} });
    } catch (err) {
      res.render("pages/novo-anuncio", { erro: "Erro ao cadastrar. Tente novamente.", sucesso: null, valores: req.body });
    }
  }
);

// API endpoints
router.get("/api/stats", (req, res) => {
  const stats = trocasModel.getStats();
  res.json({
    membrosAtivos: stats.membrosAtivos,
    trocasRealizadas: stats.trocasRealizadas,
    totalDoacoes: trocasModel.formatarValor(stats.totalDoacoesReais * 100),
  });
});

router.get("/api/anuncios", (req, res) => {
  const { categoria, busca } = req.query;
  res.json(anunciosModel.findAll({ categoria, busca }));
});

// Páginas estáticas
router.get("/avaliacao", (req, res) => res.render("pages/avaliacao"));
router.get("/saibamais", (req, res) => res.render("pages/saibamais"));
router.get("/servicos", (req, res) => res.render("pages/servicos"));
router.get("/noticia", (req, res) => res.render("pages/noticia"));
router.get("/sobrenos", (req, res) => res.render("pages/sobrenos"));
router.get("/comofunciona", (req, res) => res.render("pages/comofunciona"));
router.get("/doe", (req, res) => res.render("pages/doe"));
router.get("/obrigado", (req, res) => res.render("pages/obrigado"));

router.get("/conta", autenticado, async (req, res) => {
  try {
    const usuario = await usuariosModel.findById(req.session.usuarioId);
    if (!usuario) return res.redirect("/login");
    const meusTrocas = trocasModel.findAll().filter(t => t.solicitanteEmail === usuario.email);
    res.render("pages/conta", { usuario, meusTrocas, totalTrocas: meusTrocas.length });
  } catch (err) {
    res.redirect("/login");
  }
});

router.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

// CADASTRO
router.post("/cadastro",
  body("nome").trim().notEmpty().withMessage("*Campo obrigatório!").isLength({ min: 3 }).withMessage("*Mínimo 3 caracteres!"),
  body("email").trim().notEmpty().withMessage("*Campo obrigatório!").isEmail().withMessage("*Email inválido!"),
  body("senha").notEmpty().withMessage("*Campo obrigatório!").isLength({ min: 6 }).withMessage("*Mínimo 6 caracteres!"),
  body("confirmarSenha").notEmpty().withMessage("*Campo obrigatório!").custom((v, { req }) => {
    if (v !== req.body.senha) throw new Error("Senhas não coincidem!");
    return true;
  }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const erroValidacao = {}, msgErro = {};
      errors.array().forEach(e => { erroValidacao[e.path] = "input-error"; msgErro[e.path] = e.msg; });
      return res.render("pages/login", { valores: req.body, erroValidacao, msgErro, erro: null, sucesso: false });
    }
    try {
      const existe = await usuariosModel.findByEmail(req.body.email);
      if (existe) return res.render("pages/login", { valores: req.body, erroValidacao: { email: "input-error" }, msgErro: { email: "*Email já cadastrado!" }, erro: null, sucesso: false });
      await usuariosModel.create({ nome: req.body.nome.trim(), email: req.body.email.toLowerCase(), senha: req.body.senha });
      trocasModel.incrementarMembro();
      return res.render("pages/login", { sucesso: "Cadastro realizado! Faça login agora.", erro: null, valores: {}, erroValidacao: {}, msgErro: {} });
    } catch (err) {
      return res.render("pages/login", { erro: "Erro ao cadastrar. Tente novamente.", sucesso: false, valores: req.body, erroValidacao: {}, msgErro: {} });
    }
  }
);

// LOGIN
router.post("/login",
  body("usuarioDigitado").notEmpty().withMessage("*Informe o usuário/email!"),
  body("senhaDigitada").notEmpty().withMessage("*Informe a senha!"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const erroValidacao = {}, msgErro = {};
      errors.array().forEach(e => { erroValidacao[e.path] = "input-error"; msgErro[e.path] = e.msg; });
      return res.render("pages/login", { erro: "*Preencha todos os campos!", sucesso: false, valores: req.body, erroValidacao, msgErro });
    }
    try {
      const u = req.body.usuarioDigitado.toLowerCase();
      const usuario = await usuariosModel.findByCredentials(u, req.body.senhaDigitada);
      if (usuario) {
        req.session.usuarioId = usuario.id;
        req.session.usuario = { id: usuario.id, nome: usuario.nome, email: usuario.email, foto: usuario.foto || null };
        return res.redirect("/");
      }
      const existe = await usuariosModel.findByUsuarioOuEmail(u);
      if (existe) return res.render("pages/login", { erro: null, sucesso: false, valores: req.body, erroValidacao: { senhaDigitada: "input-error" }, msgErro: { senhaDigitada: "*Senha incorreta!" } });
      return res.render("pages/login", { erro: null, sucesso: false, valores: req.body, erroValidacao: { usuarioDigitado: "input-error" }, msgErro: { usuarioDigitado: "Usuário não encontrado!" } });
    } catch (err) {
      return res.render("pages/login", { erro: "Erro ao fazer login.", sucesso: false, valores: req.body, erroValidacao: {}, msgErro: {} });
    }
  }
);

module.exports = router;
