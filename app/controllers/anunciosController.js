const fs = require("fs");
const path = require("path");
const { validationResult } = require("express-validator");
const anunciosModel = require("../models/anunciosModel");
const usuariosModel = require("../models/models");
const { validarTelefone } = require("../public/js/telefone");
const imageService = require("../services/imageService");

const criarAnuncio = async (req, res) => {
  const erros = validationResult(req);

  if (erros && !erros.isEmpty()) {
    return res.render("pages/novo-anuncio", {
      erro: erros.array().map((erro) => erro.msg).join(" | "),
      sucesso: null,
      valores: req.body,
    });
  }

  const telefone = validarTelefone(req.body.whatsapp);
  const erroTelefone = !telefone.valido
    ? telefone.erro
    : !req.body.confirmarWhatsapp ? "Confirme que o número informado é o seu WhatsApp." : null;
  if (erroTelefone) {
    (req.files || []).forEach(imageService.removerArquivoTemporario);
    return res.render("pages/novo-anuncio", { erro: erroTelefone, sucesso: null, valores: req.body });
  }

  try {
    const usuario = req.session.usuario;
    const imagens = [];
    const pastaDestino = path.join(__dirname, "../public/img/anuncios");

    if (!req.files || req.files.length !== 3) {
      return res.render("pages/novo-anuncio", {
        erro: "É obrigatório enviar exatamente 3 fotos do item que será doado.",
        sucesso: null,
        valores: req.body,
      });
    }

    for (const [indice, arquivo] of (req.files || []).entries()) {
      const nome = `${Date.now()}-${indice}-${Math.round(Math.random() * 1000000)}.webp`;
      await imageService.converterImagem(arquivo, pastaDestino, nome, {
        resize: { width: 1200, withoutEnlargement: true },
        quality: 80,
      });
      imagens.push(`/img/anuncios/${nome}`);
    }

    anunciosModel.create({
      titulo: req.body.titulo,
      descricao: req.body.descricao,
      categoria: req.body.categoria,
      tipo: req.body.tipo,
      doadorId: usuario.id,
      doadorNome: usuario.nome,
      doadorLocal: req.body.doadorLocal,
      whatsapp: telefone.whatsapp,
      imagens,
      foto: imagens[0] || null,
    });

    // Primeiro telefone informado vira o telefone da conta.
    const conta = await usuariosModel.findById(usuario.id);
    if (conta && !validarTelefone(conta.telefone).valido) {
      await usuariosModel.updateDados(conta.id, { email: conta.email, telefone: telefone.formatado, endereco: conta.endereco });
    }

    return res.render("pages/novo-anuncio", {
      erro: null,
      sucesso: "Anúncio cadastrado com sucesso!",
      valores: { whatsapp: telefone.formatado, doadorLocal: req.body.doadorLocal },
    });
  } catch (err) {
    (req.files || []).forEach(imageService.removerArquivoTemporario);
    console.error("Erro ao cadastrar anúncio:", err);
    return res.render("pages/novo-anuncio", {
      erro: "Erro ao cadastrar. Tente novamente.",
      sucesso: null,
      valores: req.body,
    });
  }
};

// Valores do formulário a partir de um anúncio salvo (para a tela de edição).
const valoresDoAnuncio = (anuncio) => ({
  titulo: anuncio.titulo,
  descricao: anuncio.descricao,
  tipo: anuncio.tipo,
  categoria: anuncio.categoria,
  doadorLocal: anuncio.doadorLocal,
  whatsapp: validarTelefone(anuncio.whatsapp).formatado || "",
  confirmarWhatsapp: validarTelefone(anuncio.whatsapp).valido ? "1" : "",
});

const ehDono = (req, anuncio) =>
  Boolean(anuncio?.doadorId && String(anuncio.doadorId) === String(req.session.usuario?.id));

const exibirEdicao = (req, res) => {
  const anuncio = anunciosModel.findById(req.params.id);
  if (!anuncio || anuncio.ativo === false) return res.redirect("/conta");
  if (!ehDono(req, anuncio)) return res.redirect(`/contato/${anuncio.id}`);
  return res.render("pages/novo-anuncio", {
    erro: null,
    sucesso: null,
    valores: valoresDoAnuncio(anuncio),
    anuncioEdicao: anuncio,
  });
};

const editarAnuncio = async (req, res) => {
  const anuncio = anunciosModel.findById(req.params.id);
  const descartarUploads = () => (req.files || []).forEach(imageService.removerArquivoTemporario);
  if (!anuncio || anuncio.ativo === false) {
    descartarUploads();
    return res.redirect("/conta");
  }
  if (!ehDono(req, anuncio)) {
    descartarUploads();
    return res.redirect(`/contato/${anuncio.id}`);
  }

  const renderErro = (erro) => {
    descartarUploads();
    return res.render("pages/novo-anuncio", { erro, sucesso: null, valores: req.body, anuncioEdicao: anuncio });
  };

  const erros = validationResult(req);
  if (!erros.isEmpty()) return renderErro(erros.array().map((erro) => erro.msg).join(" | "));

  const telefone = validarTelefone(req.body.whatsapp);
  if (!telefone.valido) return renderErro(telefone.erro);
  if (!req.body.confirmarWhatsapp) return renderErro("Confirme que o número informado é o seu WhatsApp.");

  // Fotos são opcionais na edição: nenhuma mantém as atuais; para trocar, envie as 3.
  const arquivos = req.files || [];
  if (arquivos.length && arquivos.length !== 3) return renderErro("Para trocar as fotos, envie exatamente 3 imagens (ou nenhuma para manter as atuais).");

  try {
    const imagens = [];
    const pastaDestino = path.join(__dirname, "../public/img/anuncios");
    for (const [indice, arquivo] of arquivos.entries()) {
      const nome = `${Date.now()}-${indice}-${Math.round(Math.random() * 1000000)}.webp`;
      await imageService.converterImagem(arquivo, pastaDestino, nome, {
        resize: { width: 1200, withoutEnlargement: true },
        quality: 80,
      });
      imagens.push(`/img/anuncios/${nome}`);
    }

    const fotosAntigas = imagens.length ? (anuncio.imagens || []) : [];
    anunciosModel.update(anuncio.id, {
      titulo: req.body.titulo,
      descricao: req.body.descricao,
      tipo: req.body.tipo,
      categoria: req.body.categoria,
      doadorLocal: req.body.doadorLocal || "",
      whatsapp: telefone.whatsapp,
      imagens,
    });

    // Remove do disco as fotos substituídas (só as enviadas por usuários).
    fotosAntigas
      .filter((foto) => foto.startsWith("/img/anuncios/") && !imagens.includes(foto))
      .forEach((foto) => {
        const caminho = path.join(__dirname, "../public", foto);
        fs.rm(caminho, { force: true }, () => {});
      });

    return res.redirect(`/contato/${anuncio.id}?editado=1`);
  } catch (err) {
    console.error("Erro ao editar anúncio:", err);
    return renderErro("Erro ao salvar as alterações. Tente novamente.");
  }
};

module.exports = { criarAnuncio, exibirEdicao, editarAnuncio };