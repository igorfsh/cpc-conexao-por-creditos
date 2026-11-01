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

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", armazenamento: statusArmazenamento() });
});

const passport = require("passport");
const { provedoresConfigurados, NOMES_PROVEDORES } = require("./config/passport");
const authRoutes = require("./app/routes/auth");

app.use(session({
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