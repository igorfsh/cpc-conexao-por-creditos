const fs = require("fs");
const path = require("path");

// Chaves de acesso (Face ID/biometria). Com banco configurado ficam só no MySQL,
// para não sumirem quando o Render reinicia; sem banco, em data/passkeys.json.
const { pool, executar: withFallback } = require("../../config/banco");

const dbPath = path.join(__dirname, "../../data/passkeys.json");
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, "[]", "utf8");

const lerPasskeys = () => JSON.parse(fs.readFileSync(dbPath, "utf8") || "[]");
const salvarPasskeys = (passkeys) => fs.writeFileSync(dbPath, JSON.stringify(passkeys, null, 2), "utf8");


const mapRow = (row) => ({
  id: row.id,
  userId: row.usuario_id ?? row.userId,
  credentialId: row.credential_id ?? row.credentialId,
  publicKey: row.public_key ?? row.publicKey,
  counter: Number(row.counter || 0),
  transports: row.transports ? (typeof row.transports === "string" ? JSON.parse(row.transports) : row.transports) : [],
});

module.exports = {
  findByUserId: async (userId) => withFallback(
    async () => {
      const [rows] = await pool.query("SELECT * FROM passkeys WHERE usuario_id = ?", [userId]);
      return rows.map(mapRow);
    },
    () => lerPasskeys().filter((passkey) => String(passkey.userId) === String(userId))
  ),

  findByCredentialId: async (credentialId) => withFallback(
    async () => {
      const [rows] = await pool.query("SELECT * FROM passkeys WHERE credential_id = ?", [credentialId]);
      return rows[0] ? mapRow(rows[0]) : null;
    },
    () => lerPasskeys().find((passkey) => passkey.credentialId === credentialId) || null
  ),

  create: async ({ userId, credentialId, publicKey, counter, transports }) => withFallback(
    async () => {
      await pool.query(
        "INSERT INTO passkeys (usuario_id, credential_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)",
        [userId, credentialId, publicKey, counter, JSON.stringify(transports || [])]
      );
      return true;
    },
    () => {
      const passkeys = lerPasskeys();
      passkeys.push({ userId, credentialId, publicKey, counter, transports: transports || [] });
      salvarPasskeys(passkeys);
      return true;
    }
  ),

  replaceForUser: async ({ userId, credentialId, publicKey, counter, transports }) => withFallback(
    async () => {
      await pool.query("DELETE FROM passkeys WHERE usuario_id = ?", [userId]);
      await pool.query(
        "INSERT INTO passkeys (usuario_id, credential_id, public_key, counter, transports) VALUES (?, ?, ?, ?, ?)",
        [userId, credentialId, publicKey, counter, JSON.stringify(transports || [])]
      );
      return true;
    },
    () => {
      const passkeys = lerPasskeys().filter((passkey) => String(passkey.userId) !== String(userId));
      passkeys.push({ userId, credentialId, publicKey, counter, transports: transports || [] });
      salvarPasskeys(passkeys);
      return true;
    }
  ),

  updateCounter: async (credentialId, counter) => withFallback(
    async () => {
      await pool.query("UPDATE passkeys SET counter = ?, ultimo_uso = CURRENT_TIMESTAMP WHERE credential_id = ?", [counter, credentialId]);
      return true;
    },
    () => {
      const passkeys = lerPasskeys();
      const passkey = passkeys.find((item) => item.credentialId === credentialId);
      if (!passkey) return false;
      passkey.counter = counter;
      passkey.ultimoUso = new Date().toISOString();
      salvarPasskeys(passkeys);
      return true;
    }
  ),
  deleteByUserId: async (userId) => withFallback(
    async () => {
      await pool.query("DELETE FROM passkeys WHERE usuario_id = ?", [userId]);
      return true;
    },
    () => {
      salvarPasskeys(lerPasskeys().filter((passkey) => String(passkey.userId) !== String(userId)));
      return true;
    }
  ),
};
