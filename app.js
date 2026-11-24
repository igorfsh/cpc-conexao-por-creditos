const express = require("express");
const session = require("express-session");
const compression = require("compression");
const path = require("path");
const app = express();
const upload = require("./app/middlewares/upload");
const { uploadImagem } = require("./app/controllers/uploadController");
require("dotenv").config();

const isProduction =
  process.env.NODE_ENV === "production" ||
  process.env.RENDER === "true" ||
  process.env.GOOGLE_CALLBACK_URL?.startsWith("https://");

const sessionSecret = process.env.SESSION_SECRET;

if (isProduction && !sessionSecret) {
  throw new Error("SESSION_SECRET é obrigatório em produção.");
}

if (isProduction) {
  app.set("trust proxy", 1);
}

app.use(compression());

// Arquivos estáticos antes da sessão/Passport: imagens e CSS não abrem sessão nem consultam o banco.
// Imagens e fontes ficam 7 dias no cache do navegador; CSS/JS 1 hora (para um deploy aparecer rápido).
app.use(express.static(path.join(__dirname, "app/public"), {
  maxAge: "1h",
  setHeaders: (res, arquivo) => {
    if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(arquivo)) {
      res.setHeader("Cache-Control", "public, max-age=604800");
    }
  },
}));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const { prepararBanco, statusArmazenamento } = require("./config/banco");
const { criarSessaoStore } = require("./config/sessaoStore");

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", armazenamento: statusArmazenamento() });
});

const passport = require("passport");
const { provedoresConfigurados, NOMES_PROVEDORES } = require("./config/passport");
const authRoutes = require("./app/routes/auth");

// Proteção contra CSRF: formulário enviado por outro site (com o cookie de quem está logado)
// é recusado. O navegador sempre manda Origin (ou Referer) em POST; comparamos com o nosso endereço.
// A Apple devolve o login por POST vindo do site dela, então essa rota fica de fora.
const METODOS_SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);
const ROTAS_DE_FORA = new Set(["/auth/apple/callback"]);
const hostDaUrl = (url) => {
  try {
    return new URL(url).host;
  } catch (err) {
    return null;
  }
};
app.use((req, res, next) => {
  if (METODOS_SEGUROS.has(req.method) || ROTAS_DE_FORA.has(req.path)) return next();
  const origem = hostDaUrl(req.get("origin")) || hostDaUrl(req.get("referer"));
  const nossos = [req.get("host"), req.get("x-forwarded-host"), hostDaUrl(process.env.APP_BASE_URL)];
  if (origem && nossos.includes(origem)) return next();
  console.warn(`🚫 Pedido ${req.method} ${req.path} recusado: origem ${origem || "ausente"}.`);
  res.status(403).send("Pedido recusado: ele não veio do site do CPC. Volte à página e tente de novo.");
});

app.use(session({
  store: criarSessaoStore(),
  secret: sessionSecret || "seu-secret-seguro-aqui",
  resave: false,
  saveUninitialized: false, // só cria sessão quando há algo para guardar (login, desafio de biometria...)
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));

app.post("/upload", upload.single("minhaImagem"), uploadImagem);

app.use(passport.initialize());
app.use(passport.session());

// Com a sessão no banco, o express-session manda o redirect antes de terminar de gravar:
// o navegador abria a próxima página com a sessão antiga (ex.: login que "não pegava").
// Se a sessão mudou nesta requisição, grava primeiro e só depois responde.
app.use((req, res, next) => {
  if (!req.session) return next();
  const antes = JSON.stringify(req.session);
  const gravarAntes = (responder) => (...args) => {
    if (!req.session || JSON.stringify(req.session) === antes) return responder(...args);
    req.session.save(() => responder(...args));
  };
  res.redirect = gravarAntes(res.redirect.bind(res));
  res.json = gravarAntes(res.json.bind(res));
  next();
});

app.use((req, res, next) => {
  res.locals.usuarioLogado = req.session.usuario || null;
  res.locals.usuarioId = req.session.usuarioId || null;
  res.locals.provedoresSociais = Object.keys(NOMES_PROVEDORES)
    .filter((id) => provedoresConfigurados[id])
    .map((id) => ({ id, nome: NOMES_PROVEDORES[id] }));
  next();
});


app.set("view engine", "ejs");
app.set("views", "./app/views");

const rotaPrincipal = require("./app/routes/router");
const rotaAdm = require("./app/routes/routerAdm"); // ✅ NOVO

app.use("/auth", authRoutes);
app.use("/adm", rotaAdm);       // ✅ NOVO — antes do "/"
app.use("/", rotaPrincipal);

const porta = process.env.APP_PORT || process.env.PORT || 3000;

// Cria/atualiza as tabelas antes de aceitar requisições.
prepararBanco().finally(() => {
  app.listen(porta, () => {
    console.log(`Servidor ouvindo na porta ${porta}\nhttp://localhost:${porta}`);
  });
});