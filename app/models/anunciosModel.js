const fs = require('fs');
const path = require('path');

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

const anunciosModel = {
  findAll: (opts = {}) => {
    let anuncios = lerAnuncios().filter(a => a.ativo !== false);
    if (opts.categoria) {
      anuncios = anuncios.filter(a => a.categoria === opts.categoria);
    }
    if (opts.busca) {
      const termo = opts.busca.toLowerCase();
      anuncios = anuncios.filter(a =>
        a.titulo.toLowerCase().includes(termo) ||
        a.descricao.toLowerCase().includes(termo) ||
        a.doadorNome.toLowerCase().includes(termo)
      );
    }
    return anuncios.sort((a, b) => new Date(b.dataCriacao) - new Date(a.dataCriacao));
  },

  findById: (id) => {
    const anuncios = lerAnuncios();
    return anuncios.find(a => a.id === parseInt(id)) || null;
  },

  create: (dados) => {
    const anuncios = lerAnuncios();
    const novoAnuncio = {
      id: gerarId(),
      titulo: dados.titulo.trim(),
      descricao: dados.descricao.trim(),
      categoria: dados.categoria || 'todos',
      pontos: parseInt(dados.pontos) || 10,
      doadorId: dados.doadorId || null,
      doadorNome: dados.doadorNome || 'Usuário CPC',
      doadorLocal: dados.doadorLocal || 'São Paulo-SP',
      foto: dados.foto || '../img/img malcon.png',
      tipo: dados.tipo || 'produto',
      ativo: true,
      dataCriacao: new Date().toISOString()
    };
    anuncios.push(novoAnuncio);
    salvarAnuncios(anuncios);
    console.log('✅ Anúncio criado:', novoAnuncio.titulo);
    return novoAnuncio;
  },

  delete: (id) => {
    const anuncios = lerAnuncios();
    const idx = anuncios.findIndex(a => a.id === parseInt(id));
    if (idx === -1) return false;
    anuncios[idx].ativo = false;
    salvarAnuncios(anuncios);
    return true;
  },

  contarPorCategoria: () => {
    const anuncios = lerAnuncios().filter(a => a.ativo !== false);
    return {
      total: anuncios.length,
      profissionais: anuncios.filter(a => a.categoria === 'profissionais').length,
      alimentos: anuncios.filter(a => a.categoria === 'alimentos').length,
      infantil: anuncios.filter(a => a.categoria === 'infantil').length,
    };
  }
};

module.exports = anunciosModel;
