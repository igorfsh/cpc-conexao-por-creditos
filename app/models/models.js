const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

let pool = null;
let usarJSON = !process.env.DB_HOST || !process.env.DB_NAME;
let tentouMySQL = false;

try {
  pool = require("../../config/pool_conexoes");
  tentouMySQL = true;
} catch (err) {
  console.log("⚠️  MySQL indisponível na inicialização, usando JSON");
  tentouMySQL = false;
}

const withFallback = async (mysqlFn, jsonFn) => {
  try {
    if (tentouMySQL && !usarJSON) {
      return await mysqlFn();
    } else {
      return jsonFn();
    }
  } catch (err) {
    console.log("⚠️  Falha no MySQL, alternando para JSON:", err.message);
    usarJSON = true;
    return jsonFn();
  }
};

const dbPath = path.join(__dirname, "../../data/usuarios.json");
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, JSON.stringify([], null, 2));

const lerUsuarios = () => {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify([], null, 2), "utf8");
      return [];
    }
    const dados = fs.readFileSync(dbPath, "utf8");
    if (!dados || !dados.trim()) return [];
    return JSON.parse(dados);
  } catch (err) {
    console.error("❌ Falha ao ler usuario.json:", err);
    try {
      fs.writeFileSync(dbPath, JSON.stringify([], null, 2), "utf8");
    } catch (writeErr) {
      console.error("❌ Falha ao recriar usuario.json:", writeErr);
    }
    return [];
  }
};

const salvarUsuarios = (usuarios) => {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(usuarios, null, 2), "utf8");
  } catch (err) {
    console.error("❌ Falha ao salvar usuario.json:", err);
    throw err;
  }
};

const gerarId = () => {
  const usuarios = lerUsuarios();
  if (usuarios.length === 0) return 1;
  return Math.max(...usuarios.map(u => u.id)) + 1;
};

const usuariosModel = {
  findAll: async (opts = { limit: 100, offset: 0 }) => {
    return await withFallback(
      async () => {
        const [linhas] = await pool.query("SELECT * FROM usuarios LIMIT ? OFFSET ?", [opts.limit, opts.offset]);
        return linhas.map(mapRowToUsuario);
      },
      () => {
        const usuarios = lerUsuarios();
        return usuarios.slice(opts.offset, opts.offset + opts.limit);
      }
    );
  },

  findById: async (id) => {
    return await withFallback(
      async () => {
        const [linhas] = await pool.query("SELECT * FROM usuarios WHERE id = ?", [id]);
        if (!linhas || linhas.length === 0) return null;
        return mapRowToUsuario(linhas[0]);
      },
      () => {
        const usuarios = lerUsuarios();
        return usuarios.find(u => u.id === id) || null;
      }
    );
  },

  findByEmail: async (email) => {
    return await withFallback(
      async () => {
        const [linhas] = await pool.query("SELECT * FROM usuarios WHERE email = ?", [email.toLowerCase()]);
        if (!linhas || linhas.length === 0) return null;
        return mapRowToUsuario(linhas[0]);
      },
      () => {
        const usuarios = lerUsuarios();
        return usuarios.find(u => u.email === email.toLowerCase()) || null;
      }
    );
  },

  findByProviderId: async (provider, providerId) => {
    return await withFallback(
      async () => {
        const [linhas] = await pool.query(
          "SELECT * FROM usuarios WHERE provider = ? AND provider_id = ?",
          [provider, providerId]
        );
        if (!linhas || linhas.length === 0) return null;
        return mapRowToUsuario(linhas[0]);
      },
      () => {
        const usuarios = lerUsuarios();
        return usuarios.find(u => u.provider === provider && u.providerId === providerId) || null;
      }
    );
  },

  create: async (dados) => {
    if (!dados || !dados.nome || !dados.email) throw new Error("Nome e email são obrigatórios");

    const usuarioValido = {
      nome: dados.nome.trim(),
      email: dados.email.toLowerCase(),
      senha: dados.senha ?? null,
      foto: dados.foto || null,
      // ✅ NOVO: preserva perfil ao criar (padrão "user")
      perfil: dados.perfil || "user",
      provider: dados.provider || "local",
      providerId: dados.providerId || null,
    };

    if (usuarioValido.provider === "local" && !usuarioValido.senha) {
      throw new Error("Senha é obrigatória para cadastro local");
    }

    if (usuarioValido.provider === "local" && usuarioValido.senha) {
      const salt = bcrypt.genSaltSync(8);
      usuarioValido.senha = bcrypt.hashSync(usuarioValido.senha, salt);
    }

    return await withFallback(
      async () => {
        const sql = `INSERT INTO usuarios (nome, email, senha, foto, perfil, provider, provider_id) VALUES (?, ?, ?, ?, ?, ?, ?)`;
        const [result] = await pool.query(sql, [
          usuarioValido.nome,
          usuarioValido.email,
          usuarioValido.senha,
          usuarioValido.foto,
          usuarioValido.perfil,
          usuarioValido.provider,
          usuarioValido.providerId,
        ]);
        return { insertId: result.insertId };
      },
      () => {
        const usuarios = lerUsuarios();
        const id = gerarId();
        const novoUsuario = {
          id,
          nome: usuarioValido.nome,
          email: usuarioValido.email,
          senha: usuarioValido.senha,
          foto: usuarioValido.foto,
          perfil: usuarioValido.perfil,   // ✅ NOVO
          provider: usuarioValido.provider,
          providerId: usuarioValido.providerId,
          dataCriacao: new Date().toISOString()
        };
        usuarios.push(novoUsuario);
        salvarUsuarios(usuarios);
        console.log("✅ Usuário cadastrado (JSON):", dados.nome);
        return novoUsuario;
      }
    );
  },

  findByUsuarioOuEmail: async (usuarioOuEmail) => {
    return await withFallback(
      async () => {
        const [linhas] = await pool.query(
          "SELECT * FROM usuarios WHERE email = ? OR nome = ?",
          [usuarioOuEmail.toLowerCase(), usuarioOuEmail.toLowerCase()]
        );
        if (!linhas || linhas.length === 0) return null;
        return mapRowToUsuario(linhas[0]);
      },
      () => {
        const usuarios = lerUsuarios();
        return usuarios.find(u =>
          u.email === usuarioOuEmail.toLowerCase() || u.nome.toLowerCase() === usuarioOuEmail.toLowerCase()
        ) || null;
      }
    );
  },

  findByCredentials: async (usuarioOuEmail, senha) => {
    return await withFallback(
      async () => {
        const [linhas] = await pool.query(
          "SELECT * FROM usuarios WHERE email = ? OR nome = ?",
          [usuarioOuEmail.toLowerCase(), usuarioOuEmail.toLowerCase()]
        );
        if (!linhas || linhas.length === 0) return null;
        const row = linhas[0];
        if (!row.senha) return null;
        const match = bcrypt.compareSync(senha, row.senha);
        if (!match) return null;
        return mapRowToUsuario(row);
      },
      () => {
        const usuarios = lerUsuarios();
        const usuario = usuarios.find(u =>
          u.email === usuarioOuEmail.toLowerCase() || u.nome.toLowerCase() === usuarioOuEmail.toLowerCase()
        );
        if (!usuario || !usuario.senha) return null;
        const isHash = usuario.senha && usuario.senha.startsWith('$2');
  const match = isHash
    ? bcrypt.compareSync(senha, usuario.senha)   // senha com hash
    : usuario.senha === senha;                    // senha em texto puro (legado)
        if (!match) return null;
        return usuario;
      }
    );
  },

  updateFoto: async (id, foto) => {
    return await withFallback(
      async () => {
        await pool.query("UPDATE usuarios SET foto = ? WHERE id = ?", [foto, id]);
        return true;
      },
      () => {
        const usuarios = lerUsuarios();
        const usuario = usuarios.find(u => u.id == id);
        if (!usuario) return false;
        usuario.foto = foto;
        salvarUsuarios(usuarios);
        return true;
      }
    );
  }
};

// ✅ ALTERADO: inclui campo perfil
const mapRowToUsuario = (row) => ({
  id: row.id,
  nome: row.nome,
  email: row.email,
  foto: row.foto || null,
  perfil: row.perfil || "user",   // ✅ NOVO
  provider: row.provider || "local",
  providerId: row.provider_id || row.providerId || null,
  dataCriacao: row.data_criacao || row.dataCriacao
});

module.exports = usuariosModel;