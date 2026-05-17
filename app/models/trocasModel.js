const fs = require('fs');
const path = require('path');

const trocasPath = path.join(__dirname, '../../data/trocas.json');
const statsPath = path.join(__dirname, '../../data/stats.json');

const lerTrocas = () => {
  try {
    if (!fs.existsSync(trocasPath)) {
      fs.writeFileSync(trocasPath, JSON.stringify([], null, 2));
      return [];
    }
    const dados = fs.readFileSync(trocasPath, 'utf8');
    return dados.trim() ? JSON.parse(dados) : [];
  } catch (err) {
    console.error('Erro ao ler trocas.json:', err);
    return [];
  }
};

const salvarTrocas = (trocas) => {
  fs.writeFileSync(trocasPath, JSON.stringify(trocas, null, 2), 'utf8');
};

const lerStats = () => {
  try {
    if (!fs.existsSync(statsPath)) {
      const inicial = { membrosAtivos: 0, trocasRealizadas: 0, totalDoacoesReais: 0, ultimaAtualizacao: new Date().toISOString() };
      fs.writeFileSync(statsPath, JSON.stringify(inicial, null, 2));
      return inicial;
    }
    const dados = fs.readFileSync(statsPath, 'utf8');
    return JSON.parse(dados);
  } catch (err) {
    console.error('Erro ao ler stats.json:', err);
    return { membrosAtivos: 0, trocasRealizadas: 0, totalDoacoesReais: 0 };
  }
};

const salvarStats = (stats) => {
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf8');
};

const gerarId = () => {
  const trocas = lerTrocas();
  if (trocas.length === 0) return 1;
  return Math.max(...trocas.map(t => t.id)) + 1;
};

const trocasModel = {
  findAll: () => {
    return lerTrocas().sort((a, b) => new Date(b.dataSolicitacao) - new Date(a.dataSolicitacao));
  },

  findById: (id) => {
    return lerTrocas().find(t => t.id === parseInt(id)) || null;
  },

  create: (dados) => {
    const trocas = lerTrocas();
    const novaTroca = {
      id: gerarId(),
      anuncioId: parseInt(dados.anuncioId),
      anuncioTitulo: dados.anuncioTitulo || '',
      solicitanteNome: dados.solicitanteNome || '',
      solicitanteEmail: dados.solicitanteEmail || '',
      mensagem: dados.mensagem || '',
      status: 'pendente',
      dataSolicitacao: new Date().toISOString(),
      dataConclusao: null
    };
    trocas.push(novaTroca);
    salvarTrocas(trocas);
    console.log('✅ Troca criada para anúncio:', dados.anuncioTitulo);
    return novaTroca;
  },

  confirmar: (id) => {
    const trocas = lerTrocas();
    const idx = trocas.findIndex(t => t.id === parseInt(id));
    if (idx === -1) return false;
    trocas[idx].status = 'concluida';
    trocas[idx].dataConclusao = new Date().toISOString();
    salvarTrocas(trocas);

    // Atualizar stats ao confirmar troca
    const stats = lerStats();
    stats.trocasRealizadas += 1;
    stats.ultimaAtualizacao = new Date().toISOString();
    salvarStats(stats);

    return trocas[idx];
  },

  getStats: () => {
    const stats = lerStats();
    const trocas = lerTrocas();
    const trocasConcluidas = trocas.filter(t => t.status === 'concluida').length;

    return {
      membrosAtivos: stats.membrosAtivos,
      trocasRealizadas: stats.trocasRealizadas,
      totalDoacoesReais: stats.totalDoacoesReais,
      trocasConcluidas,
    };
  },

  incrementarMembro: () => {
    const stats = lerStats();
    stats.membrosAtivos += 1;
    stats.ultimaAtualizacao = new Date().toISOString();
    salvarStats(stats);
  },

  // Formata valor monetário em BRL
  formatarValor: (centavos) => {
    const reais = centavos / 100;
    if (reais >= 1000000) return `R$ ${(reais / 1000000).toFixed(1)}M`;
    if (reais >= 1000) return `R$ ${(reais / 1000).toFixed(1)}K`;
    return `R$ ${reais.toFixed(2)}`;
  }
};

module.exports = trocasModel;
