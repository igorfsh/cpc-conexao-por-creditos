// Conexão com o MySQL, criação automática das tabelas e regra de armazenamento.
//
// - Com DB_HOST e DB_NAME definidos (ex.: Render), TUDO que tem tabela no banco
//   (contas, provedores sociais, Face ID/biometria) é lido e gravado só no MySQL.
//   Se o banco falhar, o erro aparece — nunca gravamos "escondido" em JSON, porque
//   o disco do Render é apagado a cada deploy/reinício e os dados sumiriam.
// - Sem banco configurado (desenvolvimento local), usa os arquivos em data/*.json.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

const bancoConfigurado = Boolean(process.env.DATABASE_URL || (process.env.DB_HOST && process.env.DB_NAME));
// O Render define RENDER=true automaticamente; lá o disco é apagado a cada deploy/reinício.
const emProducao = process.env.RENDER === "true" || process.env.NODE_ENV === "production";
const pool = bancoConfigurado ? require("./pool_conexoes") : null;

const estado = {
  modo: bancoConfigurado ? "mysql" : "json",
  pronto: !bancoConfigurado,
  erro: null,
};

// Banco travado não pode deixar a página carregando para sempre: depois do limite, vira erro.
const LIMITE_MS = parseInt(process.env.DB_TIMEOUT_MS, 10) || 8000;
const comLimite = (promessa) => {
  let timer;
  const limite = new Promise((_, rejeitar) => {
    timer = setTimeout(() => {
      const erro = new Error(`MySQL não respondeu em ${LIMITE_MS} ms`);
      erro.code = "ETIMEOUT";
      rejeitar(erro);
    }, LIMITE_MS);
  });
  return Promise.race([promessa, limite]).finally(() => clearTimeout(timer));
};

const executar = async (mysqlFn, jsonFn) => (bancoConfigurado ? comLimite(mysqlFn()) : jsonFn());

// ---------- Migrações (idempotentes, compatíveis com MySQL 8 e MariaDB) ----------
const TABELAS = [
  `CREATE TABLE IF NOT EXISTS usuarios (
    id INT PRIMARY KEY AUTO_INCREMENT,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    senha CHAR(60) DEFAULT NULL,
    foto VARCHAR(255) DEFAULT NULL,
    perfil VARCHAR(50) NOT NULL DEFAULT 'user',
    provider VARCHAR(50) NOT NULL DEFAULT 'local',
    provider_id VARCHAR(255) DEFAULT NULL,
    telefone VARCHAR(20) DEFAULT NULL,
    endereco VARCHAR(255) DEFAULT NULL,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_login TIMESTAMP NULL DEFAULT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ativo'
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS usuario_provedores (
    id INT PRIMARY KEY AUTO_INCREMENT,
    usuario_id INT NOT NULL,
    provider VARCHAR(50) NOT NULL,
    provider_id VARCHAR(255) NOT NULL,
    vinculado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_provedores_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    UNIQUE KEY uq_provedor (provider, provider_id),
    UNIQUE KEY uq_usuario_provedor (usuario_id, provider)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  // Chaves de acesso (Face ID / biometria): só a chave PÚBLICA fica no servidor.
  `CREATE TABLE IF NOT EXISTS passkeys (
    id INT PRIMARY KEY AUTO_INCREMENT,
    usuario_id INT NOT NULL,
    credential_id VARCHAR(512) NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
    transports JSON DEFAULT NULL,
    criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ultimo_uso TIMESTAMP NULL DEFAULT NULL,
    CONSTRAINT fk_passkeys_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
    INDEX idx_passkeys_usuario (usuario_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
];

// Colunas adicionadas depois da primeira versão da tabela usuarios.
const COLUNAS_USUARIOS = {
  perfil: "VARCHAR(50) NOT NULL DEFAULT 'user'",
  provider: "VARCHAR(50) NOT NULL DEFAULT 'local'",
  provider_id: "VARCHAR(255) DEFAULT NULL",
  telefone: "VARCHAR(20) DEFAULT NULL",
  endereco: "VARCHAR(255) DEFAULT NULL",
  ultimo_login: "TIMESTAMP NULL DEFAULT NULL",
  status: "VARCHAR(20) NOT NULL DEFAULT 'ativo'",
};

const INDICES = [
  { tabela: "usuarios", nome: "idx_provider_id", colunas: "provider, provider_id" },
];

// Na primeira subida o banco (DB_NAME) pode não existir ainda: cria em vez de falhar.
const criarBancoSeFaltar = async () => {
  try {
    await pool.query("SELECT 1");
  } catch (err) {
    if (err.code !== "ER_BAD_DB_ERROR") throw err;
    const { conn, database } = await pool.conexaoSemBanco();
    try {
      await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database.replace(/`/g, "")}\` CHARACTER SET utf8mb4`);
      console.log(`🛠️  Banco criado: ${database}`);
    } finally {
      await conn.end();
    }
  }
};

// Migração única: na primeira vez que o banco é usado (tabela usuarios vazia), copia as contas
// e chaves de biometria que estavam em data/*.json. Só roda com o banco vazio, para que uma conta
// excluída não "volte" num próximo reinício.
const lerJSON = (arquivo) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, "../data", arquivo), "utf8") || "[]");
  } catch (err) {
    return [];
  }
};

const importarContasDoJSON = async () => {
  const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM usuarios");
  if (total > 0) return;
  const usuarios = lerJSON("usuarios.json").filter((u) => u?.email && u?.nome);
  if (!usuarios.length) return;

  const novoId = new Map();
  for (const u of usuarios) {
    // Senhas antigas em texto puro passam a ser guardadas com bcrypt.
    const senha = u.senha ? (String(u.senha).startsWith("$2") ? u.senha : bcrypt.hashSync(String(u.senha), 8)) : null;
    const [r] = await pool.query(
      `INSERT IGNORE INTO usuarios (nome, email, senha, foto, perfil, provider, provider_id, telefone, endereco, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.nome, String(u.email).toLowerCase(), senha, u.foto || null, u.perfil || "user", u.provider || "local",
        u.providerId || null, u.telefone || null, u.endereco || null, u.status || "ativo"]
    );
    if (r.insertId) novoId.set(String(u.id), r.insertId);
  }

  let chaves = 0;
  for (const k of lerJSON("passkeys.json")) {
    const usuarioId = novoId.get(String(k.userId));
    if (!usuarioId || !k.credentialId || !k.publicKey) continue;
    const [r] = await pool.query(
      "INSERT IGNORE INTO passkeys (usuario_id, credential_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)",
      [usuarioId, k.credentialId, k.publicKey, Number(k.counter) || 0, JSON.stringify(k.transports || [])]
    );
    chaves += r.affectedRows;
  }
  console.log(`📥 Migração inicial: ${novoId.size} conta(s) e ${chaves} chave(s) de biometria copiadas de data/*.json para o banco.`);
};

const prepararBanco = async () => {
  if (!bancoConfigurado) {
    if (emProducao) {
      console.error(
        "❌ Banco NÃO configurado em produção. Defina DATABASE_URL (ou DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME e DB_SSL) no Render.\n" +
        "   Até lá o cadastro de Face ID/digital fica bloqueado, porque o disco do Render é apagado a cada deploy e as biometrias se perderiam."
      );
    } else {
      console.log("ℹ️  Modo local: sem banco configurado, os dados ficam em data/*.json (normal em desenvolvimento).");
    }
    return estado;
  }
  try {
    await criarBancoSeFaltar();
    for (const sql of TABELAS) await pool.query(sql);

    const [colunas] = await pool.query(
      "SELECT COLUMN_NAME AS nome FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios'"
    );
    const existentes = new Set(colunas.map((c) => c.nome));
    for (const [coluna, definicao] of Object.entries(COLUNAS_USUARIOS)) {
      if (!existentes.has(coluna)) {
        await pool.query(`ALTER TABLE usuarios ADD COLUMN ${coluna} ${definicao}`);
        console.log(`🛠️  Coluna adicionada: usuarios.${coluna}`);
      }
    }

    for (const indice of INDICES) {
      const [linhas] = await pool.query(
        "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1",
        [indice.tabela, indice.nome]
      );
      if (!linhas.length) await pool.query(`CREATE INDEX ${indice.nome} ON ${indice.tabela} (${indice.colunas})`);
    }

    await importarContasDoJSON();

    estado.pronto = true;
    estado.erro = null;
    console.log("✅ MySQL pronto: contas e chaves de acesso (Face ID/biometria) são salvas no banco.");
  } catch (err) {
    estado.pronto = false;
    estado.erro = err.code || err.message;
    console.error("❌ Não foi possível preparar o MySQL. Contas e biometria não serão salvas até o banco responder:", err.message);
    agendarNovaTentativa();
  }
  return estado;
};

// Se o banco falhou ao iniciar (ex.: fora do ar por um momento), tenta de novo sozinho.
let tentativa = null;
const agendarNovaTentativa = () => {
  if (tentativa) return;
  tentativa = setTimeout(() => {
    tentativa = null;
    console.log("🔁 Tentando conectar ao MySQL novamente...");
    prepararBanco();
  }, 30000);
  tentativa.unref?.();
};

// Biometria só pode ser cadastrada onde ela não vai sumir: no banco, ou no modo local de desenvolvimento.
const biometriaPersistente = () => (bancoConfigurado ? estado.pronto : !emProducao);

const statusArmazenamento = () => ({
  modo: estado.modo,
  persistente: estado.modo === "mysql",
  pronto: estado.pronto,
  biometria: biometriaPersistente() ? "disponivel" : "bloqueada",
  ...(estado.erro ? { erro: estado.erro } : {}),
});

module.exports = { pool, bancoConfigurado, emProducao, executar, prepararBanco, statusArmazenamento, biometriaPersistente };
