const path = require("path");
const usuariosModel = require("../models/models");
const trocasModel = require("../models/trocasModel");
const anunciosModel = require("../models/anunciosModel");
const passkeysModel = require("../models/passkeysModel");
const imageService = require("../services/imageService");
const fotos = require("../services/fotoAnuncioService");
const { biometriaPersistente } = require("../../config/banco");
const { extrairCidadeUF } = require("../services/enderecoService");
const { validarTelefone } = require("../public/js/telefone");

const anuncianteBase = "Malcolm Eliseu Ribeiro";

const exibirConta = async (req, res) => {
  if (req.session.usuario.perfil === "admin") return res.redirect("/adm");

  try {
    const usuario = await usuariosModel.findById(req.session.usuario.id);
    if (!usuario) return res.redirect("/login");
    const passkeys = await passkeysModel.findByUserId(usuario.id);

    const meusTrocas = trocasModel.findAll().filter(
      (troca) => troca.solicitanteEmail === usuario.email
    );
    const meusTrocasComPerfil = await Promise.all(meusTrocas.map(async (troca) => {
      const anuncio = anunciosModel.findById(troca.anuncioId);
      const anunciante = anuncio?.doadorId
        ? await usuariosModel.findById(anuncio.doadorId)
        : null;

      return {
        ...troca,
        fotoPerfil: troca.doadorNome === anuncianteBase
          ? (troca.foto || "/img/img malcon.png")
          : (anunciante?.foto || "/img/img perfil-white.png"),
      };
    }));
    const meusAnuncios = anunciosModel.findAll().filter(
      (anuncio) => String(anuncio.doadorId) === String(usuario.id)
    ).map((anuncio) => ({
      ...anuncio,
      fotoCapa: fotos.fotoCapa(anuncio),
      fotoPerfil: anuncio.doadorNome === anuncianteBase
        ? (anuncio.foto || "/img/img malcon.png")
        : (usuario.foto || "/img/img perfil-white.png"),
    }));

    return res.render("pages/conta", {
      usuario,
      passkeys,
      biometriaDisponivel: biometriaPersistente(),
      meusTrocas: meusTrocasComPerfil,
      meusAnuncios,
      totalTrocas: meusTrocasComPerfil.length,
      querySucesso: req.query.sucesso === "foto",
      queryErro: req.query.erro === "foto",
      dadosSucesso: req.query.sucesso === "dados",
      dadosErro: req.query.erro === "dados" ? "Não foi possível salvar seus dados."
        : req.query.erro === "email-invalido" ? "Informe um e-mail válido."
        : req.query.erro === "email-em-uso" ? "Esse e-mail já está em uso por outra conta."
        : req.query.erro === "telefone-invalido" ? "Telefone inválido. Use DDD + número, ex.: (11) 91234-5678."
        : req.query.erro === "excluir" ? "Não foi possível excluir a conta."
        : null,
    });
  } catch (err) {
    console.error("Erro ao carregar conta:", err);
    return res.redirect("/login");
  }
};

const atualizarFoto = async (req, res) => {
  if (!req.file) return res.redirect("/conta?erro=foto");

  try {
    const pastaDestino = path.join(__dirname, "../public/img/perfis");
    const nome = `perfil-${req.session.usuario.id}-${Date.now()}.webp`;
    await imageService.converterImagem(req.file, pastaDestino, nome, {
      resize: { width: 600, height: 600, fit: "contain" },
      autoOrientar: true,
      quality: 82,
    });

    const foto = `/img/perfis/${nome}`;
    await usuariosModel.updateFoto(req.session.usuario.id, foto);
    req.session.usuario.foto = foto;
    return res.redirect("/conta?sucesso=foto");
  } catch (err) {
    imageService.removerArquivoTemporario(req.file);
    console.error("Erro ao atualizar foto de perfil:", err);
    return res.redirect("/conta?erro=foto");
  }
};

const atualizarDados = async (req, res) => {
  const email = (req.body.email || "").trim().toLowerCase();
  const telefoneDigitado = (req.body.telefone || "").trim();
  const endereco = (req.body.endereco || "").trim().slice(0, 255);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.redirect("/conta?erro=email-invalido#meus-dados");
  const validacao = validarTelefone(telefoneDigitado);
  if (telefoneDigitado && !validacao.valido) return res.redirect("/conta?erro=telefone-invalido#meus-dados");
  const telefone = validacao.valido ? validacao.formatado : "";

  try {
    const existente = await usuariosModel.findByEmail(email);
    if (existente && String(existente.id) !== String(req.session.usuario.id)) {
      return res.redirect("/conta?erro=email-em-uso#meus-dados");
    }

    const usuario = await usuariosModel.updateDados(req.session.usuario.id, { email, telefone, endereco });
    if (!usuario) return res.redirect("/conta?erro=dados#meus-dados");
    req.session.usuario.email = usuario.email;
    anunciosModel.atualizarContatoDoador(usuario.id, {
      whatsapp: validacao.valido ? validacao.whatsapp : null,
      local: extrairCidadeUF(endereco),
    });
    return res.redirect("/conta?sucesso=dados#meus-dados");
  } catch (err) {
    console.error("Erro ao atualizar dados da conta:", err);
    return res.redirect("/conta?erro=dados#meus-dados");
  }
};

const excluirConta = async (req, res) => {
  const id = req.session.usuario.id;
  if (req.session.usuario.perfil === "admin") return res.redirect("/adm");

  try {
    await passkeysModel.deleteByUserId(id);
    anunciosModel.deletarPorDoador(id);
    const ok = await usuariosModel.delete(id);
    if (!ok) return res.redirect("/conta?erro=excluir#meus-dados");

    req.logout((logoutError) => {
      if (logoutError) console.error("Erro ao encerrar sessão Passport:", logoutError);
      req.session.destroy(() => res.redirect("/?conta=excluida"));
    });
  } catch (err) {
    console.error("Erro ao excluir conta:", err);
    return res.redirect("/conta?erro=excluir#meus-dados");
  }
};

module.exports = { exibirConta, atualizarFoto, atualizarDados, excluirConta };