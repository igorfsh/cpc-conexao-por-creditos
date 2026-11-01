// Conexão com o MySQL, criação automática das tabelas e regra de armazenamento.
//
// - Com DB_HOST e DB_NAME definidos (ex.: Render), TUDO que tem tabela no banco
//   (contas, provedores sociais, Face ID/biometria) é lido e gravado só no MySQL.
//   Se o banco falhar, o erro aparece — nunca gravamos "escondido" em JSON, porque
//   o disco do Render é apagado a cada deploy/reinício e os dados sumiriam.
// - Sem banco configurado (desenvolvimento local), usa os arquivos em data/*.json.
require("dotenv").config();

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

    estado.pronto = true;
    estado.erro = null;
    console.log("✅ MySQL pronto: contas e chaves de acesso (Face ID/biometria) são salvas no banco.");
  } catch (err) {
    estado.pronto = false;
    estado.erro = err.code || err.message;
    console.error("❌ Não foi possível preparar o MySQL. Contas e biometria não serão salvas até o banco responder:", err.message);
  }
  return estado;
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
