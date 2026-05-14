// 📊 Modelo de Usuários (Login/Cadastro)
// Suporta MySQL e Mock JSON (para desenvolvimento)
// ============================================
 
const fs = require("fs");
const path = require("path");
 
// Tentar conectar ao MySQL, mas usar JSON como fallback
let pool = null;
let usarJSON = true;
let tentouMySQL = false;
 
try {
  pool = require("../../config/pool_conexoes");
  tentouMySQL = true;
  // Não mude usarJSON aqui - detectaremos em tempo de execução
} catch (err) {
  console.log("⚠️  MySQL indisponível na inicialização, usando JSON");
  tentouMySQL = false;
}
 
// Função auxiliar para detectar falha de conexão e usar JSON
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
 
// Caminho do arquivo JSON
const dbPath = path.join(__dirname, "../../data/usuarios.json");
const dbDir = path.dirname(dbPath);
 
// Garantir que o diretório existe
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
 
// Garantir que o arquivo exists
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
}
 
// ============================================
// FUNÇÕES DE LEITURA/ESCRITA JSON
// ============================================
 
const lerUsuarios = () => {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify([], null, 2), "utf8");
      return [];
    }
 
    const dados = fs.readFileSync(dbPath, "utf8");
    if (!dados || !dados.trim()) {
      return [];
    }
 
    return JSON.parse(dados);
  } catch (err) {
    console.error("❌ Falha ao ler usuario.json:", err);
    try {
      fs.writeFileSync(dbPath, JSON.stringify([], null, 2), "utf8");
      console.log("✅ usuario.json reiniciado como array vazio");
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
 
// ============================================
// MODELO DE USUÁRIOS
// ============================================
 
const usuariosModel = {
  // Listar todos os usuários
  findAll: async (opts = { limit: 100, offset: 0 }) => {
    return await withFallback(
      async () => {
        const sql = "SELECT * FROM usuarios LIMIT ? OFFSET ?";
        const [linhas] = await pool.query(sql, [opts.limit, opts.offset]);
        return linhas.map(mapRowToUsuario);
      },
      () => {
        const usuarios = lerUsuarios();
        return usuarios.slice(opts.offset, opts.offset + opts.limit);
      }
    );
  },
 
  // Buscar usuário por ID
  findById: async (id) => {
    return await withFallback(
      async () => {
        const [linhas] = await pool.query(
          "SELECT * FROM usuarios WHERE id = ?",
          [id]
        );
        if (!linhas || linhas.length === 0) return null;
        return mapRowToUsuario(linhas[0]);
      },
      () => {
        const usuarios = lerUsuarios();
        const usuario = usuarios.find(u => u.id === id);
        return usuario || null;
      }
    );
  },
 
  // Buscar usuário por email
  findByEmail: async (email) => {
    return await withFallback(
      async () => {
        const [linhas] = await pool.query(
          "SELECT * FROM usuarios WHERE email = ?",
          [email.toLowerCase()]
        );
        if (!linhas || linhas.length === 0) return null;
        return mapRowToUsuario(linhas[0]);
      },
      () => {
        const usuarios = lerUsuarios();
        const usuario = usuarios.find(u => u.email === email.toLowerCase());
        return usuario || null;
      }
    );
  },
 
  // Buscar usuário por provider e providerId
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
        const usuario = usuarios.find(
          u => u.provider === provider && u.providerId === providerId
        );
        return usuario || null;
      }
    );
  },
 
  // Criar novo usuário
  create: async (dados) => {
    if (!dados || !dados.nome || !dados.email) {
      throw new Error("Nome e email são obrigatórios");
    }
 
    const usuarioValido = {
      nome: dados.nome.trim(),
      email: dados.email.toLowerCase(),
      senha: dados.senha ?? null,
      foto: dados.foto || null,
      provider: dados.provider || "local",
      providerId: dados.providerId || null,
    };
 
    if (usuarioValido.provider === "local" && !usuarioValido.senha) {
      throw new Error("Senha é obrigatória para cadastro local");
    }
 
    return await withFallback(
      async () => {
        const sql = `
          INSERT INTO usuarios (nome, email, senha, foto, provider, provider_id)
          VALUES (?, ?, ?, ?, ?, ?)
        `;
        const [result] = await pool.query(sql, [
          usuarioValido.nome,
          usuarioValido.email,
          usuarioValido.senha,
          usuarioValido.foto,
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
 
  // Verificar se usuário existe (por nome ou email, sem senha)
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
        const usuario = usuarios.find(u =>
          u.email === usuarioOuEmail.toLowerCase() || u.nome.toLowerCase() === usuarioOuEmail.toLowerCase()
        );
        return usuario || null;
      }
    );
  },
 
  // Verificar login (nome/email + senha)
  findByCredentials: async (usuarioOuEmail, senha) => {
    return await withFallback(
      async () => {
        const [linhas] = await pool.query(
          "SELECT * FROM usuarios WHERE (email = ? OR nome = ?) AND senha = ?",
          [usuarioOuEmail.toLowerCase(), usuarioOuEmail.toLowerCase(), senha]
        );
        if (!linhas || linhas.length === 0) return null;
        return mapRowToUsuario(linhas[0]);
      },
      () => {
        const usuarios = lerUsuarios();
        const usuario = usuarios.find(u =>
          (u.email === usuarioOuEmail.toLowerCase() || u.nome.toLowerCase() === usuarioOuEmail.toLowerCase()) &&
          u.senha === senha
        );
        return usuario || null;
      }
    );
  }
};
 
// Mapear resultado do banco para objeto usuário (para MySQL)
const mapRowToUsuario = (row) => ({
  id: row.id,
  nome: row.nome,
  email: row.email,
  foto: row.foto || null,
  provider: row.provider || "local",
  providerId: row.provider_id || row.providerId || null,
  dataCriacao: row.data_criacao || row.dataCriacao
});
 
module.exports = usuariosModel;