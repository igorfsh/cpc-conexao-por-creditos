const express = require("express");
const { body } = require("express-validator");
const usuariosModel = require("../models/models");
const anunciosModel = require("../models/anunciosModel");
const trocasModel = require("../models/trocasModel");
const upload = require("../middlewares/upload");
const { extrairCidadeUF } = require("../services/enderecoService");
const { validarTelefone } = require("../public/js/telefone");
const fotos = require("../services/fotoAnuncioService");
const { criarAnuncio, exibirEdicao, editarAnuncio } = require("../controllers/anunciosController");
const { exibirConta, atualizarFoto, atualizarDados, excluirConta } = require("../controllers/usuariosController");
const { responderDuvida } = require("../controllers/iaController");
const { cadastroController, loginController } = require("../controllers/controllers");
const { mensagensErroSocial } = require("../controllers/authController");
const { obterOpcoesRegistro, verificarRegistro, obterOpcoesLogin, verificarLogin } = require("../controllers/passkeyController");
const trocaService = require("../services/trocaService");

const router = express.Router();

const autenticado = (req, res, next) => {
  if (req.session?.usuario) return next();
  res.redirect("/login");
};

router.get("/login", (req, res) => {
  if (req.session?.usuario) return res.redirect("/");
  const erro = mensagensErroSocial[req.query.erro] || null;
  res.render("pages/login", { erro, sucesso: null, valores: {}, erroValidacao: {}, msgErro: {} });
});

router.get("/cadastro", (req, res) => {
  if (req.session?.usuario) return res.redirect("/");
  res.render("pages/login", { modo: "cadastro", erro: null, sucesso: null, valores: {}, erroValidacao: {}, msgErro: {} });
});

router.get("/", async (req, res) => {
  try {
    const stats = await trocasModel.getStats();
    res.render("pages/home", {
      membrosAtivos: stats.membrosAtivos.toLocaleString("pt-BR"),
      trocasRealizadas: stats.trocasRealizadas.toLocaleString("pt-BR"),
      totalDoacoes: trocasModel.formatarValor(stats.totalDoacoesReais * 100),
    });
  } catch (err) {
    console.error("Erro home:", err);
    res.render("pages/home", { membrosAtivos: "0", trocasRealizadas: "0", totalDoacoes: "R$ 0" });
  }
});

const prepararAnuncio = async (anuncio, usuariosPorId = new Map(), { comAnunciante = true } = {}) => {
  if (!anuncio) return null;

  let doador = null;
  if (comAnunciante && anuncio.doadorId) {
    const chave = String(anuncio.doadorId);
    if (!usuariosPorId.has(chave)) usuariosPorId.set(chave, await usuariosModel.findById(anuncio.doadorId));
    doador = usuariosPorId.get(chave);
  }

  return {
    ...anuncio,
    fotoExibicao: fotos.fotoCapa(anuncio),        // cards: sempre o item (ou a ilustração da categoria)
    fotoItem: fotos.fotoDoItem(anuncio),          // só fotos reais do item
    imagensCarrossel: fotos.imagensCarrossel(anuncio),
    fotoAnunciante: fotos.fotoAnunciante(anuncio, doador),
  };
};

// WhatsApp validado do anúncio; anúncios antigos sem número usam o telefone da conta do anunciante.
const whatsappDoAnunciante = async (anuncio) => {
  const doAnuncio = validarTelefone(anuncio?.whatsapp);
  if (doAnuncio.valido) return doAnuncio.whatsapp;
  if (!anuncio?.doadorId) return null;
  const doador = await usuariosModel.findById(anuncio.doadorId);
  const daConta = validarTelefone(doador?.telefone);
  return daConta.valido ? daConta.whatsapp : null;
};

const ERROS_TROCA = {
  saldo: "Você não tem créditos suficientes para esta troca.",
  duplicada: "Você já pediu este item. A troca está aguardando conclusão.",
  falha: "Não foi possível registrar a troca. Tente novamente.",
};

const prepararResumo = async (req, anuncio) => {
  const preparado = await prepararAnuncio(anuncio);
  if (!preparado) return { anuncio: null };
  const conta = req.session?.usuario ? await usuariosModel.findById(req.session.usuario.id) : null;
  return {
    anuncio: preparado,
    whatsappAnunciante: await whatsappDoAnunciante(anuncio),
    proprioAnuncio: ehProprioAnuncio(req, anuncio),
    saldoAtual: conta ? conta.creditos : null,
    erroTroca: ERROS_TROCA[req.query.erro] || null,
  };
};

const ehProprioAnuncio = (req, anuncio) =>
  Boolean(anuncio?.doadorId && req.session?.usuario && String(anuncio.doadorId) === String(req.session.usuario.id));

const listarAnuncios = (categoria, pagina) => async (req, res) => {
  const busca = req.query.busca || "";
  const anuncios = await anunciosModel.findAll({ categoria, busca });
  const usuariosPorId = new Map();
  // Os cards só usam a foto do item: não precisa buscar a conta de cada anunciante no banco.
  const anunciosComFoto = await Promise.all(anuncios.map((anuncio) => prepararAnuncio(anuncio, usuariosPorId, { comAnunciante: false })));
  res.render(`pages/${pagina}`, { anuncios: anunciosComFoto, busca });
};

router.get("/todos", listarAnuncios(undefined, "todos"));
router.get("/kids", listarAnuncios("infantil", "infantil"));
router.get("/alimentos", listarAnuncios("alimentos", "alimentos"));
router.get("/profissionais", listarAnuncios("profissionais", "profissionais"));

router.get("/contato/:id", async (req, res) => {
  const anuncio = await anunciosModel.findById(req.params.id);
  if (!anuncio) return res.redirect("/todos");
  res.render("pages/contato-troca", {
    anuncio: await prepararAnuncio(anuncio),
    proprioAnuncio: ehProprioAnuncio(req, anuncio),
    editado: req.query.editado === "1",
  });
});

router.get("/contato", async (req, res) => {
  const anuncio = (await anunciosModel.findAll())[0] || null;
  res.render("pages/contato-troca", { anuncio: await prepararAnuncio(anuncio), proprioAnuncio: ehProprioAnuncio(req, anuncio) });
});

router.get("/resumo/:anuncioId", async (req, res) => {
  const anuncio = await anunciosModel.findById(req.params.anuncioId);
  if (!anuncio) return res.redirect("/todos");
  if (!req.session?.usuario) req.session.redirectAfterLogin = `/resumo/${req.params.anuncioId}`;
  req.session.anuncioPendente = anuncio;
  res.render("pages/resumo-troca", await prepararResumo(req, anuncio));
});

router.get("/resumo", async (req, res) => {
  // Relê o anúncio para pegar o WhatsApp atualizado, não a cópia guardada na sessão.
  const pendente = req.session.anuncioPendente;
  const anuncio = pendente ? (await anunciosModel.findById(pendente.id)) || pendente : null;
  if (anuncio && !req.session?.usuario) req.session.redirectAfterLogin = "/resumo";
  res.render("pages/resumo-troca", await prepararResumo(req, anuncio));
});

router.post("/confirmar-troca", autenticado, async (req, res) => {
  const anuncio = await anunciosModel.findById(req.body.anuncioId);
  if (!anuncio || anuncio.ativo === false) return res.redirect("/todos");

  try {
    const resultado = await trocaService.solicitar({
      usuario: req.session.usuario,
      anuncio,
      mensagem: req.body.mensagem,
    });
    if (resultado.erro === "proprio") return res.redirect(`/resumo/${anuncio.id}`);
    if (resultado.erro) return res.redirect(`/resumo/${anuncio.id}?erro=${resultado.erro}`);
    delete req.session.anuncioPendente;
    req.session.ultimaTrocaId = resultado.troca.id;
    return res.redirect("/obrigado");
  } catch (err) {
    console.error("Erro confirmar troca:", err);
    return res.redirect(`/resumo/${anuncio.id}?erro=falha`);
  }
});

router.get("/novo-anuncio", async (req, res) => {
  if (!req.session?.usuario) {
    req.session.redirectAfterLogin = "/novo-anuncio";
    return res.redirect("/login");
  }
  const usuario = await usuariosModel.findById(req.session.usuario.id);
  res.render("pages/novo-anuncio", {
    erro: null,
    sucesso: null,
    valores: { whatsapp: validarTelefone(usuario?.telefone).formatado || "", doadorLocal: extrairCidadeUF(usuario?.endereco) || "" },
  });
});

const validarImagensDoAnuncio = (req, res, next) => {
  if (!req.files || req.files.length !== 3) {
    return res.render("pages/novo-anuncio", {
      erro: "É obrigatório enviar exatamente 3 fotos do item que será doado.",
      sucesso: null,
      valores: req.body,
    });
  }
  return next();
};

router.post(
  "/novo-anuncio",
  (req, res, next) => {
    if (!req.session?.usuario) {
      req.session.redirectAfterLogin = "/novo-anuncio";
      return res.redirect("/login");
    }
    next();
  },
  upload.array("imagens", 3),
  validarImagensDoAnuncio,
  body("titulo").trim().notEmpty().withMessage("Título é obrigatório"),
  body("descricao").trim().notEmpty().withMessage("Descrição é obrigatória"),
  body("categoria").notEmpty().withMessage("Categoria é obrigatória"),
  criarAnuncio
);

router.get("/anuncio/:id/editar", autenticado, exibirEdicao);
router.post(
  "/anuncio/:id/editar",
  autenticado,
  upload.array("imagens", 3),
  body("titulo").trim().notEmpty().withMessage("Título é obrigatório"),
  body("descricao").trim().notEmpty().withMessage("Descrição é obrigatória"),
  body("categoria").notEmpty().withMessage("Categoria é obrigatória"),
  editarAnuncio
);

router.get("/api/stats", async (req, res) => {
  const stats = await trocasModel.getStats();
  res.json({
    membrosAtivos: stats.membrosAtivos,
    trocasRealizadas: stats.trocasRealizadas,
    totalDoacoes: trocasModel.formatarValor(stats.totalDoacoesReais * 100),
  });
});

router.get("/api/anuncios", async (req, res) => {
  res.json(await anunciosModel.findAll({ categoria: req.query.categoria, busca: req.query.busca }));
});

router.post("/api/chat", responderDuvida);

router.get("/avaliacao", autenticado, async (req, res) => {
  try {
    const usuario = await usuariosModel.findById(req.session.usuario.id);
    if (!usuario) return res.redirect("/login");

    const trocas = await Promise.all((await trocasModel.findAll())
      .filter((troca) => troca.solicitanteEmail === usuario.email)
      .map(async (troca) => {
        const anuncio = await anunciosModel.findById(troca.anuncioId);
        return { ...troca, fotoItem: anuncio ? fotos.fotoCapa(anuncio) : null };
      }));

    return res.render("pages/avaliacao", {
      pendentes: trocas.filter((troca) => !troca.avaliacaoNota),
      avaliadas: trocas.filter((troca) => troca.avaliacaoNota),
      salvaId: Number(req.query.salva) || null,
      erroId: Number(req.query.erro) || null,
    });
  } catch (err) {
    console.error("Erro ao carregar avaliações:", err);
    return res.redirect("/conta");
  }
});

router.post("/avaliacao/:id", autenticado, async (req, res) => {
  try {
    const usuario = await usuariosModel.findById(req.session.usuario.id);
    const id = Number(req.params.id);
    const avaliacao = usuario && await trocasModel.avaliar(id, usuario.email, req.body.nota, req.body.comentario);
    return res.redirect(avaliacao ? `/avaliacao?salva=${id}#troca-${id}` : `/avaliacao?erro=${id}#troca-${id}`);
  } catch (err) {
    console.error("Erro ao salvar avaliação:", err);
    return res.redirect(`/avaliacao?erro=${Number(req.params.id) || ""}`);
  }
});
router.get("/saibamais", (req, res) => res.render("pages/saibamais"));
router.get("/servicos", (req, res) => res.render("pages/servicos"));
// A página de notícias foi substituída pela seção "Nosso impacto" da home.
router.get("/noticia", (req, res) => res.redirect(301, "/#impacto"));
router.get("/sobrenos", (req, res) => res.render("pages/sobrenos"));
router.get("/comofunciona", (req, res) => res.render("pages/comofunciona"));
router.get("/doe", (req, res) => res.render("pages/doe"));
router.get("/obrigado", async (req, res) => {
  const usuario = req.session?.usuario;
  const troca = req.session?.ultimaTrocaId && usuario
    ? await trocasModel.findById(req.session.ultimaTrocaId)
    : null;
  if (!troca || troca.solicitanteEmail !== usuario.email) return res.render("pages/obrigado", { troca: null });

  const anuncio = await anunciosModel.findById(troca.anuncioId);
  const conta = await usuariosModel.findById(usuario.id);
  const preparado = await prepararAnuncio(anuncio);
  const whatsapp = anuncio ? await whatsappDoAnunciante(anuncio) : null;
  const mensagem = encodeURIComponent(
    `Olá ${(troca.doadorNome || "").split(" ")[0]}! Acabei de solicitar a troca de "${troca.anuncioTitulo}" no CPC. Podemos combinar?`
  );
  res.render("pages/obrigado", {
    troca,
    anuncio: preparado,
    whatsappLink: whatsapp ? `https://wa.me/${whatsapp}?text=${mensagem}` : null,
    saldoAtual: conta ? conta.creditos : null,
  });
});

router.get("/conta", autenticado, exibirConta);
router.post("/conta/foto", autenticado, upload.single("foto"), atualizarFoto);
router.post("/conta/dados", autenticado, atualizarDados);
router.post("/conta/excluir", autenticado, excluirConta);
router.post("/api/passkeys/registro/opcoes", autenticado, (req, res, next) => {
  req.session.passkeyRegistrationReplace = req.body?.substituir === true
    || req.body?.substituir === "true"
    || req.body?.substituir === 1;
  next();
}, obterOpcoesRegistro);
router.post("/api/passkeys/registro/verificar", autenticado, verificarRegistro);
router.post("/api/passkeys/login/opcoes", obterOpcoesLogin);
router.post("/api/passkeys/login/verificar", verificarLogin);

router.get("/logout", (req, res) => {
  req.logout((logoutError) => {
    if (logoutError) console.error("Erro ao encerrar sessão Passport:", logoutError);
    req.session.destroy(() => res.redirect("/"));
  });
});

router.post(
  "/cadastro",
  body("nome")
    .trim()
    .notEmpty().withMessage("*Campo obrigatório!")
    .custom((valor) => {
      const nome = valor.trim();
      const partes = nome.split(/\s+/).filter(Boolean);
      if (partes.length < 2) {
        throw new Error("*Informe o nome completo da pessoa (nome e sobrenome).");
      }
      const nomeValido = /^[A-Za-zÀ-ÖØ-öø-ÿ'`´.-]+(?:\s+[A-Za-zÀ-ÖØ-öø-ÿ'`´.-]+)+$/;
      if (!nomeValido.test(nome)) {
        throw new Error("*Use um nome real, sem apelidos ou nickname.");
      }
      return true;
    })
    .isLength({ min: 3 }).withMessage("*Mínimo 3 caracteres!"),
  body("email").trim().notEmpty().withMessage("*Campo obrigatório!").isEmail().withMessage("*Email inválido!"),
  body("senha").notEmpty().withMessage("*Campo obrigatório!").isLength({ min: 6 }).withMessage("*Mínimo 6 caracteres!"),
  body("confirmarSenha").notEmpty().withMessage("*Campo obrigatório!").custom((valor, { req }) => {
    if (valor !== req.body.senha) throw new Error("Senhas não coincidem!");
    return true;
  }),
  cadastroController
);

router.post(
  "/login",
  body("usuarioDigitado").notEmpty().withMessage("*Informe o usuário/email!"),
  body("senhaDigitada").notEmpty().withMessage("*Informe a senha!"),
  loginController
);

module.exports = router;
