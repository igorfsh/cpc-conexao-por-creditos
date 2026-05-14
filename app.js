const express = require("express");
const session = require("express-session");
const app = express();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
require("dotenv").config();

// Middleware de parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const passport = require("passport");
require("./config/passport");
const authRoutes = require("./app/routes/auth");

// Configurar sessão
app.use(session({
  secret: process.env.SESSION_SECRET || "seu-secret-seguro-aqui",
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // true se usar HTTPS
    maxAge: 1000 * 60 * 60 * 24 * 7 // 7 dias
  }
}));

// Inicializar Passport
app.use(passport.initialize());
app.use(passport.session());

// Middleware para passar dados de sessão para as views
app.use((req, res, next) => {
  res.locals.usuarioLogado = req.session.usuario || null;
  res.locals.usuarioId = req.session.usuarioId || null;
  next();
});

const upload = multer({ dest: 'uploads/' }); // Pasta temporária
app.post('/upload', upload.single('minhaImagem'), async (req, res) => {
    try {
        const { path: tempPath, originalname } = req.file;
                // Define o novo nome com extensão .webpconst nomeArquivo = path.parse(originalname).name + '-' + Date.now() + '.webp';
        const destinoFinal = path.join(__dirname, 'public/images', nomeArquivo)

        // A MÁGICA: O Sharp lê o arquivo temporário e converte para WebPawait sharp(tempPath)
            .webp({ quality: 80 }) // 80 é um ótimo equilíbrio entre peso e qualidade            .toFile(destinoFinal);
        // Apaga o arquivo original (JPG/PNG) para não ocupar espaço à toa        fs.unlinkSync(tempPath);
        res.send(`Imagem convertida com sucesso: ${nomeArquivo}`);
    } catch (error) {
        console.error(error);
        res.status(500).send("Erro ao processar imagem.");
    }
});




app.use(express.static("./app/public"));
 
app.set("view engine", "ejs");
app.set("views", "./app/views");
 
const rotaPrincipal = require("./app/routes/router");
app.use("/auth", authRoutes);
app.use("/", rotaPrincipal);
 
// Definir porta via variável de ambiente APP_PORT ou PORT, ou 3000 como fallback
const porta = process.env.APP_PORT || process.env.PORT || 3000;
 
app.listen(porta, () => {
  console.log(`Servidor ouvindo na porta ${porta}\nhttp://localhost:${porta}`);
});