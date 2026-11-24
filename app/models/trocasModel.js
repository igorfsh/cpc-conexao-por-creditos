const fs = require('fs');
const path = require('path');

// Com banco configurado trocas e números da home vão para o MySQL; sem banco, para data/*.json (config/banco.js).
const { pool, executar } = require('../../config/banco');

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

const somarStat = (campo, coluna) => executar(
  async () => {
    await pool.query(`UPDATE estatisticas SET ${coluna} = ${coluna} + 1, ultima_atualizacao = CURRENT_TIMESTAMP WHERE id = 1`);
  },
  () => {
    const stats = lerStats();
    stats[campo] += 1;
    stats.ultimaAtualizacao = new Date().toISOString();
    salvarStats(stats);
  }
);

const gerarId = () => {
  const trocas = lerTrocas();
  if (trocas.length === 0) return 1;
  return Math.max(...trocas.map(t => t.id)) + 1;
};

const paraISO = (data) => (data ? new Date(data).toISOString() : null);

// Linha do MySQL no mesmo formato dos objetos de data/trocas.json.
const mapRowToTroca = (row) => ({
  id: row.id,
  anuncioId: row.anuncio_id,
  anuncioTitulo: row.anuncio_titulo,
  doadorId: row.doador_id ?? null,
  doadorNome: row.doador_nome,
  foto: row.foto,
  solicitanteId: row.solicitante_id ?? null,
  solicitanteNome: row.solicitante_nome,
  solicitanteEmail: row.solicitante_email,
  pontos: row.pontos,
  creditosReservados: Boolean(row.creditos_reservados),
  mensagem: row.mensagem || '',
  status: row.status,
  dataSolicitacao: paraISO(row.data_solicitacao),
  dataConclusao: paraISO(row.data_conclusao),
  ...(row.avaliacao_nota ? {
    avaliacaoNota: row.avaliacao_nota,
    avaliacaoComentario: row.avaliacao_comentario || '',
    avaliacaoData: paraISO(row.avaliacao_data),
  } : {}),
});

const maisRecentesPrimeiro = (trocas) =>
  trocas.sort((a, b) => new Date(b.dataSolicitacao) - new Date(a.dataSolicitacao));

// Troca só muda de status saindo de "pendente": devolve a troca alterada, ou null se não era pendente.
const encerrar = (id, status) => executar(
  async () => {
    const [r] = await pool.query(
      "UPDATE trocas SET status = ?, data_conclusao = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pendente'",
      [status, parseInt(id)]
    );
    return r.affectedRows ? trocasModel.findById(id) : null;
  },
  () => {
    const trocas = lerTrocas();
    const idx = trocas.findIndex(t => t.id === parseInt(id));
    if (idx === -1 || trocas[idx].status !== 'pendente') return null;
    trocas[idx].status = status;
    trocas[idx].dataConclusao = new Date().toISOString();
    salvarTrocas(trocas);
    return trocas[idx];
  }
);

const trocasModel = {
  findAll: () => executar(
    async () => {
      const [linhas] = await pool.query('SELECT * FROM trocas');
      return maisRecentesPrimeiro(linhas.map(mapRowToTroca));
    },
    () => maisRecentesPrimeiro(lerTrocas())
  ),

  findById: (id) => executar(
    async () => {
      const [linhas] = await pool.query('SELECT * FROM trocas WHERE id = ?', [parseInt(id)]);
      return linhas.length ? mapRowToTroca(linhas[0]) : null;
    },
    () => lerTrocas().find(t => t.id === parseInt(id)) || null
  ),

  create: (dados) => {
    const novaTroca = {
      anuncioId: parseInt(dados.anuncioId),
      anuncioTitulo: dados.anuncioTitulo || '',
      doadorId: dados.doadorId || null,
      doadorNome: dados.doadorNome || 'Doador CPC',
      foto: dados.foto || '../img/img malcon.png',
      solicitanteId: dados.solicitanteId || null,
      solicitanteNome: dados.solicitanteNome || '',
      solicitanteEmail: (dados.solicitanteEmail || '').toLowerCase(),
      pontos: parseInt(dados.pontos) || 0,
      creditosReservados: Boolean(dados.creditosReservados),
      mensagem: dados.mensagem || '',
      status: 'pendente',
      dataSolicitacao: new Date().toISOString(),
      dataConclusao: null
    };
    return executar(
      async () => {
        const [r] = await pool.query(
          `INSERT INTO trocas (anuncio_id, anuncio_titulo, doador_id, doador_nome, foto, solicitante_id, solicitante_nome,
             solicitante_email, pontos, creditos_reservados, mensagem)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [novaTroca.anuncioId, novaTroca.anuncioTitulo, novaTroca.doadorId, novaTroca.doadorNome, novaTroca.foto,
            novaTroca.solicitanteId, novaTroca.solicitanteNome, novaTroca.solicitanteEmail, novaTroca.pontos,
            novaTroca.creditosReservados ? 1 : 0, novaTroca.mensagem]
        );
        console.log('✅ Troca criada para anúncio:', novaTroca.anuncioTitulo);
        return { id: r.insertId, ...novaTroca };
      },
      () => {
        const trocas = lerTrocas();
        const criada = { id: gerarId(), ...novaTroca };
        trocas.push(criada);
        salvarTrocas(trocas);
        console.log('✅ Troca criada para anúncio:', criada.anuncioTitulo);
        return criada;
      }
    );
  },

  // Conclui a troca e conta mais uma troca realizada na home.
  confirmar: async (id) => {
    const troca = await encerrar(id, 'concluida');
    if (troca) await somarStat('trocasRealizadas', 'trocas_realizadas');
    return troca;
  },

  cancelar: (id) => encerrar(id, 'cancelada'),

  delete: (id) => executar(
    async () => {
      const [r] = await pool.query('DELETE FROM trocas WHERE id = ?', [parseInt(id)]);
      return r.affectedRows > 0;
    },
    () => {
      const trocas = lerTrocas();
      const restantes = trocas.filter(t => t.id !== parseInt(id));
      if (restantes.length === trocas.length) return false;
      salvarTrocas(restantes);
      return true;
    }
  ),

  avaliar: (id, email, nota, comentario = "") => {
    const notaNumerica = Number(nota);
    if (!Number.isInteger(notaNumerica) || notaNumerica < 1 || notaNumerica > 5) return Promise.resolve(null);
    const texto = String(comentario || "").trim().slice(0, 300);

    return executar(
      async () => {
        const [r] = await pool.query(
          `UPDATE trocas SET avaliacao_nota = ?, avaliacao_comentario = ?, avaliacao_data = CURRENT_TIMESTAMP
           WHERE id = ? AND solicitante_email = ?`,
          [notaNumerica, texto, parseInt(id), String(email).toLowerCase()]
        );
        return r.affectedRows ? trocasModel.findById(id) : null;
      },
      () => {
        const trocas = lerTrocas();
        const idx = trocas.findIndex(
          (troca) => troca.id === parseInt(id) && troca.solicitanteEmail === email
        );
        if (idx === -1) return null;

        trocas[idx].avaliacaoNota = notaNumerica;
        trocas[idx].avaliacaoComentario = texto;
        trocas[idx].avaliacaoData = new Date().toISOString();
        salvarTrocas(trocas);
        return trocas[idx];
      }
    );
  },

  getStats: async () => {
    const trocas = await trocasModel.findAll();
    const trocasConcluidas = trocas.filter(t => t.status === 'concluida').length;
    const stats = await executar(
      async () => {
        const [linhas] = await pool.query('SELECT * FROM estatisticas WHERE id = 1');
        const row = linhas[0] || {};
        return {
          membrosAtivos: Number(row.membros_ativos) || 0,
          trocasRealizadas: Number(row.trocas_realizadas) || 0,
          totalDoacoesReais: Number(row.total_doacoes_reais) || 0,
        };
      },
      lerStats
    );

    return {
      membrosAtivos: stats.membrosAtivos,
      trocasRealizadas: stats.trocasRealizadas,
      totalDoacoesReais: stats.totalDoacoesReais,
      trocasConcluidas,
    };
  },

  incrementarMembro: () => somarStat('membrosAtivos', 'membros_ativos'),

  // Formata valor monetário em BRL
  formatarValor: (centavos) => {
    const reais = centavos / 100;
    if (reais >= 1000000) return `R$ ${(reais / 1000000).toFixed(1)}M`;
    if (reais >= 1000) return `R$ ${(reais / 1000).toFixed(1)}K`;
    return `R$ ${reais.toFixed(2)}`;
  }
};

module.exports = trocasModel;
