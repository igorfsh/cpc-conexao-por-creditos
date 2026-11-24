// Sessões de login guardadas na tabela "sessoes" do MySQL.
// A loja padrão do express-session fica na memória: todo reinício do Render deslogava todo mundo.
// Sem banco configurado (desenvolvimento local), continua usando a memória.
const session = require("express-session");
const { pool, bancoConfigurado } = require("./banco");

const UM_DIA_MS = 1000 * 60 * 60 * 24;

const expiracao = (dados) => {
  const expira = dados?.cookie?.expires ? new Date(dados.cookie.expires).getTime() : NaN;
  return Number.isFinite(expira) ? expira : Date.now() + UM_DIA_MS;
};

class SessaoMySQLStore extends session.Store {
  constructor() {
    super();
    // Apaga sessões vencidas de hora em hora.
    this.limpeza = setInterval(() => {
      pool.query("DELETE FROM sessoes WHERE expira < ?", [Date.now()]).catch(() => {});
    }, 1000 * 60 * 60);
    this.limpeza.unref?.();
  }

  get(sid, callback) {
    pool.query("SELECT dados FROM sessoes WHERE sid = ? AND expira >= ?", [sid, Date.now()])
      .then(([linhas]) => callback(null, linhas.length ? JSON.parse(linhas[0].dados) : null))
      .catch((err) => {
        // Banco fora do ar não pode derrubar as páginas: segue como visitante.
        console.error("Erro ao ler sessão:", err.message);
        callback(null, null);
      });
  }

  set(sid, dados, callback) {
    pool.query(
      "INSERT INTO sessoes (sid, dados, expira) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE dados = VALUES(dados), expira = VALUES(expira)",
      [sid, JSON.stringify(dados), expiracao(dados)]
    )
      .then(() => callback?.())
      .catch((err) => {
        console.error("Erro ao salvar sessão:", err.message);
        callback?.(err);
      });
  }

  touch(sid, dados, callback) {
    pool.query("UPDATE sessoes SET expira = ? WHERE sid = ?", [expiracao(dados), sid])
      .then(() => callback?.())
      .catch(() => callback?.());
  }

  destroy(sid, callback) {
    pool.query("DELETE FROM sessoes WHERE sid = ?", [sid])
      .then(() => callback?.())
      .catch((err) => callback?.(err));
  }
}

const criarSessaoStore = () => (bancoConfigurado ? new SessaoMySQLStore() : undefined);

module.exports = { criarSessaoStore };
