const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");

// Com banco configurado tudo vai para o MySQL; sem banco, para data/usuarios.json (config/banco.js).
const { pool, executar: withFallback } = require("../../config/banco");

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
        return usuarios.find(u => String(u.id) === String(id)) || null;
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
        return usuarios.find(u => u.email?.toLowerCase() === email.toLowerCase()) || null;
      }
    );
  },

  findByProviderId: async (provider, providerId) => {
    const id = String(providerId);
    return await withFallback(
      async () => {
        const [linhas] = await pool.query(
          `SELECT u.* FROM usuarios u
           LEFT JOIN usuario_provedores p ON p.usuario_id = u.id
           WHERE (u.provider = ? AND u.provider_id = ?) OR (p.provider = ? AND p.provider_id = ?)
           LIMIT 1`,
          [provider, id, provider, id]
        );
        if (!linhas || linhas.length === 0) return null;
        return mapRowToUsuario(linhas[0]);
      },
      () => {
        const usuarios = lerUsuarios();
        return usuarios.find(u =>
          (u.provider === provider && String(u.providerId) === id)
          || (u.provedores || []).some(p => p.provider === provider && String(p.providerId) === id)
        ) || null;
      }
    );
  },

  // Vincula um provedor social a uma conta existente sem desfazer vínculos anteriores.
  linkSocialProvider: async (id, provider, providerId, foto = null) => {
    const providerIdTexto = String(providerId);
    return await withFallback(
      async () => {
        await pool.query(
          "INSERT IGNORE INTO usuario_provedores (usuario_id, provider, provider_id) VALUES (?, ?, ?)",
          [id, provider, providerIdTexto]
        );
        await pool.query(
          `UPDATE usuarios
           SET provider = IF(provider IS NULL OR provider = 'local', ?, provider),
               provider_id = IF(provider_id IS NULL, ?, provider_id),
               foto = COALESCE(foto, ?)
           WHERE id = ?`,
          [provider, providerIdTexto, foto, id]
        );
        return usuariosModel.findById(id);
      },
      () => {
        const usuarios = lerUsuarios();
        const usuario = usuarios.find(u => String(u.id) === String(id));
        if (!usuario) return null;

        usuario.provedores = usuario.provedores || [];
        if (!usuario.provedores.some(p => p.provider === provider)) {
          usuario.provedores.push({ provider, providerId: providerIdTexto, vinculadoEm: new Date().toISOString() });
        }
        if (!usuario.provider || usuario.provider === "local") {
          usuario.provider = provider;
          usuario.providerId = providerIdTexto;
        }
        if (!usuario.foto && foto) usuario.foto = foto;
        salvarUsuarios(usuarios);
        return usuario;
      }
    );
  },

  // Login social de conta já existente: não sobrescreve nome/e-mail editados pelo usuário.
  updateSocialLogin: async (id, dados = {}) => {
    const foto = dados.foto || null;
    return await withFallback(
      async () => {
        await pool.query(
          "UPDATE usuarios SET foto = COALESCE(foto, ?), ultimo_login = CURRENT_TIMESTAMP WHERE id = ?",
          [foto, id]
        );
        return usuariosModel.findById(id);
      },
      () => {
        const usuarios = lerUsuarios();
        const usuario = usuarios.find(u => String(u.id) === String(id));
        if (!usuario) return null;
        if (!usuario.foto && foto) usuario.foto = foto;
        usuario.ultimoLogin = new Date().toISOString();
        salvarUsuarios(usuarios);
        return usuario;
      }
    );
  },

  updateLastLogin: async (id) => {
    return await withFallback(
      async () => {
        await pool.query("UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = ?", [id]);
        return true;
      },
      () => {
        const usuarios = lerUsuarios();
        const usuario = usuarios.find(item => String(item.id) === String(id));
        if (!usuario) return false;
        usuario.ultimoLogin = new Date().toISOString();
        salvarUsuarios(usuarios);
        return true;
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
      providerId: dados.providerId ? String(dados.providerId) : null,
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
          provedores: usuarioValido.providerId
            ? [{ provider: usuarioValido.provider, providerId: usuarioValido.providerId, vinculadoEm: new Date().toISOString() }]
            : [],
          dataCriacao: new Date().toISOString(),
          ultimoLogin: usuarioValido.provider === "local" ? null : new Date().toISOString(),
          status: "ativo"
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
          "SELECT * FROM usuarios WHERE LOWER(email) = ? OR LOWER(nome) = ?",
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
          "SELECT * FROM usuarios WHERE LOWER(email) = ? OR LOWER(nome) = ?",
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
  },

  updateDados: async (id, dados = {}) => {
    const email = dados.email.trim().toLowerCase();
    const telefone = dados.telefone?.trim() || null;
    const endereco = dados.endereco?.trim() || null;
    return await withFallback(
      async () => {
        await pool.query(
          "UPDATE usuarios SET email = ?, telefone = ?, endereco = ? WHERE id = ?",
          [email, telefone, endereco, id]
        );
        return usuariosModel.findById(id);
      },
      () => {
        const usuarios = lerUsuarios();
        const usuario = usuarios.find(u => String(u.id) === String(id));
        if (!usuario) return null;
        usuario.email = email;
        usuario.telefone = telefone;
        usuario.endereco = endereco;
        salvarUsuarios(usuarios);
        return usuario;
      }
    );
  },

  delete: async (id) => {
    return await withFallback(
      async () => {
        const [result] = await pool.query("DELETE FROM usuarios WHERE id = ?", [id]);
        return result.affectedRows > 0;
      },
      () => {
        const usuarios = lerUsuarios();
        const restantes = usuarios.filter(u => String(u.id) !== String(id));
        if (restantes.length === usuarios.length) return false;
        salvarUsuarios(restantes);
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
  telefone: row.telefone || null,
  endereco: row.endereco || null,
  perfil: row.perfil || "user",   // ✅ NOVO
  provider: row.provider || "local",
  providerId: row.provider_id || row.providerId || null,
  dataCriacao: row.data_criacao || row.dataCriacao,
  ultimoLogin: row.ultimo_login || row.ultimoLogin || null,
  status: row.status || "ativo"
});

module.exports = usuariosModel;