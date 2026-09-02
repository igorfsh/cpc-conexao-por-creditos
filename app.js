const express = require("express");
const compression = require("compression");
const session = require("express-session");
const app = express();
const upload = require("./app/middlewares/upload");
const { uploadImagem } = require("./app/controllers/uploadController");
require("dotenv").config();

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(compression());

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

const passport = require("passport");
require("./config/passport");
const authRoutes = require("./app/routes/auth");

app.use(session({
  secret: process.env.SESSION_SECRET || "seu-secret-seguro-aqui",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
}));

app.post("/upload", upload.single("minhaImagem"), uploadImagem);

app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) => {
  res.locals.usuarioLogado = req.session.usuario || null;
  res.locals.usuarioId = req.session.usuarioId || null;
  next();
});

app.use(express.static("./app/public", {
  maxAge: process.env.NODE_ENV === "production" ? "1d" : 0,
  etag: true,
}));

app.set("view engine", "ejs");
app.set("views", "./app/views");

const rotaPrincipal = require("./app/routes/router");
const rotaAdm = require("./app/routes/routerAdm"); // ✅ NOVO

app.use("/auth", authRoutes);
app.use("/adm", rotaAdm);       // ✅ NOVO — antes do "/"
app.use("/", rotaPrincipal);

const porta = process.env.PORT || process.env.APP_PORT || 3000;

app.listen(porta, () => {
  console.log(`Servidor ouvindo na porta ${porta}\nhttp://localhost:${porta}`);
});