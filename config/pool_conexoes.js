// Conexão com o MySQL. Aceita variáveis separadas (DB_HOST, DB_PORT, DB_USER...)
// ou uma URL única (DATABASE_URL=mysql://usuario:senha@host:porta/banco),
// que é o formato entregue por serviços como TiDB Cloud, Aiven e Railway.
const fs = require("fs");
const mysql = require("mysql2/promise");

const lerConfiguracao = () => {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    const sslNaUrl = /^(true|1|required|require|verify_identity|verify_ca)$/i
      .test(url.searchParams.get("ssl") || url.searchParams.get("ssl-mode") || url.searchParams.get("sslmode") || "");
    return {
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: decodeURIComponent(url.pathname.replace(/^\//, "")),
      sslNaUrl,
    };
  }
  return {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "cpc",
    sslNaUrl: false,
  };
};

// Bancos na nuvem exigem conexão criptografada. DB_SSL=true liga o TLS validando o
// certificado; DB_SSL_CA (conteúdo do .pem ou caminho do arquivo) é para provedores
// com certificado próprio, como o Aiven.
const lerSSL = (sslNaUrl) => {
  const ligado = sslNaUrl || /^(true|1|required)$/i.test(process.env.DB_SSL || "");
  if (!ligado) return undefined;
  const ssl = { minVersion: "TLSv1.2", rejectUnauthorized: true };
  const ca = process.env.DB_SSL_CA;
  if (ca) ssl.ca = ca.includes("BEGIN CERTIFICATE") ? ca.replace(/\\n/g, "\n") : fs.readFileSync(ca, "utf8");
  return ssl;
};

const { sslNaUrl, ...conexao } = lerConfiguracao();
const ssl = lerSSL(sslNaUrl);

const pool = mysql.createPool({
  ...conexao,
  ssl,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
});

module.exports = pool;
// Usado para criar o banco (CREATE DATABASE) quando ele ainda não existe.
module.exports.conexaoSemBanco = () => {
  const { database, ...semBanco } = conexao;
  return mysql.createConnection({ ...semBanco, ssl, connectTimeout: 10000 }).then((conn) => ({ conn, database }));
};
