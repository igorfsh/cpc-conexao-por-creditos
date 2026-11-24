const fs = require('fs');
const path = require('path');

// Com banco configurado os anúncios vão para o MySQL; sem banco, para data/anuncios.json (config/banco.js).
const { pool, executar } = require('../../config/banco');

const dbPath = path.join(__dirname, '../../data/anuncios.json');

const lerAnuncios = () => {
  try {
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, JSON.stringify([], null, 2));
      return [];
    }
    const dados = fs.readFileSync(dbPath, 'utf8');
    return dados.trim() ? JSON.parse(dados) : [];
  } catch (err) {
    console.error('Erro ao ler anuncios.json:', err);
    return [];
  }
};

const salvarAnuncios = (anuncios) => {
  fs.writeFileSync(dbPath, JSON.stringify(anuncios, null, 2), 'utf8');
};

const gerarId = () => {
  const anuncios = lerAnuncios();
  if (anuncios.length === 0) return 1;
  return Math.max(...anuncios.map(a => a.id)) + 1;
};

const paraISO = (data) => (data ? new Date(data).toISOString() : null);

const lerImagens = (texto) => {
  try {
    const imagens = JSON.parse(texto || '[]');
    return Array.isArray(imagens) ? imagens : [];
  } catch (err) {
    return [];
  }
};

// Linha do MySQL no mesmo formato dos objetos de data/anuncios.json.
const mapRowToAnuncio = (row) => ({
  id: row.id,
  titulo: row.titulo,
  descricao: row.descricao,
  categoria: row.categoria,
  pontos: row.pontos,
  doadorId: row.doador_id ?? null,
  doadorNome: row.doador_nome,
  doadorLocal: row.doador_local,
  whatsapp: row.whatsapp || null,
  foto: row.foto || null,
  imagens: lerImagens(row.imagens),
  tipo: row.tipo,
  ativo: Boolean(row.ativo),
  dataCriacao: paraISO(row.data_criacao),
  dataAtualizacao: paraISO(row.data_atualizacao),
});

const filtrar = (anuncios, opts = {}) => {
  let lista = anuncios.filter(a => a.ativo !== false);
  if (opts.categoria) {
    lista = lista.filter(a => a.categoria === opts.categoria);
  }
  if (opts.busca) {
    const termo = opts.busca.toLowerCase();
    lista = lista.filter(a =>
      a.titulo.toLowerCase().includes(termo) ||
      a.descricao.toLowerCase().includes(termo) ||
      a.doadorNome.toLowerCase().includes(termo)
    );
  }
  return lista.sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));
};

// Só os campos enviados são alterados; o resto do anúncio fica como está.
const camposAlterados = (dados) => {
  const campos = {};
  if (dados.titulo && dados.titulo.trim()) campos.titulo = dados.titulo.trim();
  if (dados.descricao && dados.descricao.trim()) campos.descricao = dados.descricao.trim();
  if (dados.categoria) campos.categoria = dados.categoria;
  if (dados.tipo) campos.tipo = dados.tipo;
  if (dados.pontos !== undefined && !isNaN(parseInt(dados.pontos))) campos.pontos = parseInt(dados.pontos);
  if (dados.doadorLocal !== undefined && dados.doadorLocal.trim()) campos.doadorLocal = dados.doadorLocal.trim();
  if (dados.whatsapp) campos.whatsapp = dados.whatsapp;
  if (Array.isArray(dados.imagens) && dados.imagens.length) {
    campos.imagens = dados.imagens.slice(0, 3);
    campos.foto = dados.imagens[0];
  }
  return campos;
};

const COLUNAS = {
  titulo: 'titulo', descricao: 'descricao', categoria: 'categoria', tipo: 'tipo', pontos: 'pontos',
  doadorLocal: 'doador_local', whatsapp: 'whatsapp', foto: 'foto', imagens: 'imagens',
};

const anunciosModel = {
  findAll: (opts = {}) => executar(
    async () => {
      // A busca é feita em JS (mesma regra do modo JSON); a lista de anúncios é pequena.
      const [linhas] = await pool.query('SELECT * FROM anuncios WHERE ativo = 1');
      return filtrar(linhas.map(mapRowToAnuncio), opts);
    },
    () => filtrar(lerAnuncios(), opts)
  ),

  findById: (id) => executar(
    async () => {
      const [linhas] = await pool.query('SELECT * FROM anuncios WHERE id = ?', [parseInt(id)]);
      return linhas.length ? mapRowToAnuncio(linhas[0]) : null;
    },
    () => lerAnuncios().find(a => a.id === parseInt(id)) || null
  ),

  create: (dados) => {
    const novoAnuncio = {
      titulo: dados.titulo.trim(),
      descricao: dados.descricao.trim(),
      categoria: dados.categoria || 'todos',
      pontos: parseInt(dados.pontos) || 10,
      doadorId: dados.doadorId || null,
      doadorNome: dados.doadorNome || 'Usuário CPC',
      doadorLocal: dados.doadorLocal || 'São Paulo-SP',
      whatsapp: dados.whatsapp || null,
      foto: dados.foto || (Array.isArray(dados.imagens) && dados.imagens[0]) || null,
      imagens: Array.isArray(dados.imagens) ? dados.imagens.slice(0, 3) : [],
      tipo: dados.tipo || 'produto',
      ativo: true,
      dataCriacao: new Date().toISOString()
    };
    return executar(
      async () => {
        const [r] = await pool.query(
          `INSERT INTO anuncios (titulo, descricao, categoria, tipo, pontos, doador_id, doador_nome, doador_local, whatsapp, foto, imagens)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [novoAnuncio.titulo, novoAnuncio.descricao, novoAnuncio.categoria, novoAnuncio.tipo, novoAnuncio.pontos,
            novoAnuncio.doadorId, novoAnuncio.doadorNome, novoAnuncio.doadorLocal, novoAnuncio.whatsapp,
            novoAnuncio.foto, JSON.stringify(novoAnuncio.imagens)]
        );
        console.log('✅ Anúncio criado:', novoAnuncio.titulo);
        return { id: r.insertId, ...novoAnuncio };
      },
      () => {
        const anuncios = lerAnuncios();
        const criado = { id: gerarId(), ...novoAnuncio };
        anuncios.push(criado);
        salvarAnuncios(anuncios);
        console.log('✅ Anúncio criado:', criado.titulo);
        return criado;
      }
    );
  },

  update: (id, dados) => {
    const campos = camposAlterados(dados);
    return executar(
      async () => {
        const nomes = Object.keys(campos);
        const valores = nomes.map(nome => (nome === 'imagens' ? JSON.stringify(campos[nome]) : campos[nome]));
        const sets = nomes.map(nome => `${COLUNAS[nome]} = ?`).concat('data_atualizacao = CURRENT_TIMESTAMP');
        const [r] = await pool.query(`UPDATE anuncios SET ${sets.join(', ')} WHERE id = ?`, [...valores, parseInt(id)]);
        return r.affectedRows ? anunciosModel.findById(id) : null;
      },
      () => {
        const anuncios = lerAnuncios();
        const idx = anuncios.findIndex(a => a.id === parseInt(id));
        if (idx === -1) return null;
        Object.assign(anuncios[idx], campos, { dataAtualizacao: new Date().toISOString() });
        salvarAnuncios(anuncios);
        return anuncios[idx];
      }
    );
  },

  desativarPorDoador: (doadorId) => executar(
    async () => {
      const [r] = await pool.query('UPDATE anuncios SET ativo = 0 WHERE ativo = 1 AND doador_id = ?', [doadorId]);
      return r.affectedRows;
    },
    () => {
      const anuncios = lerAnuncios();
      let alterados = 0;
      anuncios.forEach(a => {
        if (a.ativo !== false && String(a.doadorId) === String(doadorId)) {
          a.ativo = false;
          alterados++;
        }
      });
      if (alterados) salvarAnuncios(anuncios);
      return alterados;
    }
  ),

  atualizarContatoDoador: (doadorId, { whatsapp, local } = {}) => {
    if (!whatsapp && !local) return Promise.resolve(0);
    return executar(
      async () => {
        const [r] = await pool.query(
          'UPDATE anuncios SET whatsapp = COALESCE(?, whatsapp), doador_local = COALESCE(?, doador_local) WHERE doador_id = ?',
          [whatsapp || null, local || null, doadorId]
        );
        return r.affectedRows;
      },
      () => {
        const anuncios = lerAnuncios();
        let alterados = 0;
        anuncios.forEach(a => {
          if (String(a.doadorId) !== String(doadorId)) return;
          if (whatsapp) a.whatsapp = whatsapp;
          if (local) a.doadorLocal = local;
          alterados++;
        });
        if (alterados) salvarAnuncios(anuncios);
        return alterados;
      }
    );
  },

  deletarPorDoador: (doadorId) => executar(
    async () => {
      const [r] = await pool.query('DELETE FROM anuncios WHERE doador_id = ?', [doadorId]);
      return r.affectedRows;
    },
    () => {
      const anuncios = lerAnuncios();
      const restantes = anuncios.filter(a => String(a.doadorId) !== String(doadorId));
      const removidos = anuncios.length - restantes.length;
      if (removidos) salvarAnuncios(restantes);
      return removidos;
    }
  ),

  delete: (id) => executar(
    async () => {
      const [r] = await pool.query('UPDATE anuncios SET ativo = 0 WHERE id = ?', [parseInt(id)]);
      return r.affectedRows > 0;
    },
    () => {
      const anuncios = lerAnuncios();
      const idx = anuncios.findIndex(a => a.id === parseInt(id));
      if (idx === -1) return false;
      anuncios[idx].ativo = false;
      salvarAnuncios(anuncios);
      return true;
    }
  ),

  contarPorCategoria: async () => {
    const anuncios = await anunciosModel.findAll();
    return {
      total: anuncios.length,
      profissionais: anuncios.filter(a => a.categoria === 'profissionais').length,
      alimentos: anuncios.filter(a => a.categoria === 'alimentos').length,
      infantil: anuncios.filter(a => a.categoria === 'infantil').length,
    };
  }
};

module.exports = anunciosModel;
