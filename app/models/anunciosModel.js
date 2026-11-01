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
      whatsapp: dados.whatsapp || null,
      foto: dados.foto || (Array.isArray(dados.imagens) && dados.imagens[0]) || null,
      imagens: Array.isArray(dados.imagens) ? dados.imagens.slice(0, 3) : [],
      tipo: dados.tipo || 'produto',
      ativo: true,
      dataCriacao: new Date().toISOString()
    };
    anuncios.push(novoAnuncio);
    salvarAnuncios(anuncios);
    console.log('✅ Anúncio criado:', novoAnuncio.titulo);
    return novoAnuncio;
  },

  update: (id, dados) => {
    const anuncios = lerAnuncios();
    const idx = anuncios.findIndex(a => a.id === parseInt(id));
    if (idx === -1) return null;
    if (dados.titulo && dados.titulo.trim()) anuncios[idx].titulo = dados.titulo.trim();
    if (dados.descricao && dados.descricao.trim()) anuncios[idx].descricao = dados.descricao.trim();
    if (dados.categoria) anuncios[idx].categoria = dados.categoria;
    if (dados.tipo) anuncios[idx].tipo = dados.tipo;
    if (dados.pontos !== undefined && !isNaN(parseInt(dados.pontos))) anuncios[idx].pontos = parseInt(dados.pontos);
    if (dados.doadorLocal !== undefined) anuncios[idx].doadorLocal = dados.doadorLocal.trim() || anuncios[idx].doadorLocal;
    if (dados.whatsapp) anuncios[idx].whatsapp = dados.whatsapp;
    if (Array.isArray(dados.imagens) && dados.imagens.length) {
      anuncios[idx].imagens = dados.imagens.slice(0, 3);
      anuncios[idx].foto = dados.imagens[0];
    }
    anuncios[idx].dataAtualizacao = new Date().toISOString();
    salvarAnuncios(anuncios);
    return anuncios[idx];
  },

  desativarPorDoador: (doadorId) => {
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
  },

  atualizarContatoDoador: (doadorId, { whatsapp, local } = {}) => {
    if (!whatsapp && !local) return 0;
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
  },

  deletarPorDoador: (doadorId) => {
    const anuncios = lerAnuncios();
    const restantes = anuncios.filter(a => String(a.doadorId) !== String(doadorId));
    const removidos = anuncios.length - restantes.length;
    if (removidos) salvarAnuncios(restantes);
    return removidos;
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