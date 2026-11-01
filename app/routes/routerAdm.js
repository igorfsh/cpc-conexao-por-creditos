const express = require("express");
const router = express.Router();
const anunciosModel = require("../models/anunciosModel");
const trocasModel = require("../models/trocasModel");
const usuariosModel = require("../models/models");
const passkeysModel = require("../models/passkeysModel");

const CATEGORIAS = ["alimentos", "profissionais", "infantil", "todos"];
const TIPOS = ["produto", "servico"];

// ============================================
// 🔒 MIDDLEWARE — só admin entra
// ============================================
const isAdmin = (req, res, next) => {
    if (req.session && req.session.usuario && req.session.usuario.perfil === "admin") {
        return next();
    }
    res.redirect("/login");
};

// Mensagens de retorno exibidas no topo das páginas (?msg=...)
const MENSAGENS = {
    "anuncio-editado":   { tipo: "ok",   texto: "Anúncio atualizado com sucesso." },
    "anuncio-removido":  { tipo: "ok",   texto: "Anúncio removido." },
    "anuncio-invalido":  { tipo: "erro", texto: "Não foi possível salvar o anúncio. Verifique os campos." },
    "troca-confirmada":  { tipo: "ok",   texto: "Troca confirmada como concluída." },
    "troca-cancelada":   { tipo: "ok",   texto: "Troca cancelada." },
    "troca-removida":    { tipo: "ok",   texto: "Troca removida do histórico." },
    "troca-erro":        { tipo: "erro", texto: "Não foi possível alterar essa troca." },
    "usuario-removido":  { tipo: "ok",   texto: "Conta removida. Os anúncios desse usuário foram desativados." },
    "usuario-proprio":   { tipo: "erro", texto: "Você não pode remover a própria conta por aqui." },
    "usuario-admin":     { tipo: "erro", texto: "Contas de administrador não podem ser removidas." },
    "usuario-erro":      { tipo: "erro", texto: "Não foi possível remover essa conta." },
};

router.use(isAdmin, (req, res, next) => {
    res.locals.mensagem = MENSAGENS[req.query.msg] || null;
    next();
});

const formatarData = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

// ============================================
// 📊 DASHBOARD — GET /adm
// ============================================
router.get("/", async (req, res) => {
    try {
        const stats         = trocasModel.getStats();
        const contagem      = anunciosModel.contarPorCategoria();
        const todasTrocas   = trocasModel.findAll();
        const usuarios      = await usuariosModel.findAll({ limit: 100000, offset: 0 });

        // Percentuais de categoria
        const total            = contagem.total || 1;
        const catAlimentos     = Math.round((contagem.alimentos     / total) * 100);
        const catProfissionais = Math.round((contagem.profissionais / total) * 100);
        const catInfantil      = Math.round((contagem.infantil      / total) * 100);
        const catOutros        = 100 - catAlimentos - catProfissionais - catInfantil;

        // Trocas hoje x ontem
        const hoje        = new Date().toISOString().slice(0, 10);
        const ontem       = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
        const trocasHoje  = todasTrocas.filter(t => t.dataSolicitacao && t.dataSolicitacao.startsWith(hoje)).length;
        const trocasOntem = todasTrocas.filter(t => t.dataSolicitacao && t.dataSolicitacao.startsWith(ontem)).length;
        const deltaPercent = trocasOntem ? Math.round(((trocasHoje - trocasOntem) / trocasOntem) * 100) : null;
        const trocasPendentes = todasTrocas.filter(t => t.status === "pendente").length;

        // Novos membros
        const inicioHoje   = new Date(); inicioHoje.setHours(0, 0, 0, 0);
        const inicioSemana = new Date(inicioHoje.getTime() - 6 * 86400000);
        const criadoEm     = u => u.dataCriacao ? new Date(u.dataCriacao) : null;
        const novosHoje       = usuarios.filter(u => criadoEm(u) >= inicioHoje).length;
        const novosEssaSemana = usuarios.filter(u => criadoEm(u) >= inicioSemana).length;

        // Atividade por hora — trocas agrupadas em faixas de 2h
        const faixas = Array(12).fill(0);
        todasTrocas.forEach(t => {
            if (t.dataSolicitacao) faixas[Math.floor(new Date(t.dataSolicitacao).getHours() / 2)]++;
        });
        const maxFaixa  = Math.max(...faixas, 1);
        const picoIdx   = faixas.indexOf(Math.max(...faixas));
        const atividade = faixas.map(qtd => Math.max(Math.round((qtd / maxFaixa) * 100), 4));
        const pad = n => String(n).padStart(2, "0");
        const picoFaixa = `${pad(picoIdx * 2)}h – ${pad(picoIdx * 2 + 2)}h`;

        const ultimasTrocas = todasTrocas.slice(0, 5).map(t => ({ ...t, data: formatarData(t.dataSolicitacao) }));

        res.render("pages/adm/dashboard", {
            stats,
            ultimasTrocas,
            totalAnuncios:    contagem.total,
            totalUsuarios:    usuarios.length,
            trocasHoje,
            trocasPendentes,
            deltaPercent,
            novosEssaSemana,
            novosHoje,
            doacoes:          trocasModel.formatarValor(stats.totalDoacoesReais || 0),
            atividade,
            picoFaixa,
            picoDia:          faixas[picoIdx],
            catAlimentos,
            catProfissionais,
            catInfantil,
            catOutros: Math.max(catOutros, 0),
        });
    } catch (err) {
        console.error("Erro no dashboard admin:", err);
        res.status(500).send("Erro ao carregar painel admin: " + err.message);
    }
});

// ============================================
// 📋 ANÚNCIOS — GET /adm/anuncios
// ============================================
router.get("/anuncios", (req, res) => {
    const anuncios = anunciosModel.findAll().map(a => ({ ...a, data: formatarData(a.dataCriacao) }));
    res.render("pages/adm/anuncios", { anuncios, contagem: anunciosModel.contarPorCategoria() });
});

// ============================================
// ✏️  EDITAR anúncio — POST /adm/anuncios/editar/:id
// ============================================
router.post("/anuncios/editar/:id", (req, res) => {
    const { titulo, descricao, categoria, tipo, pontos } = req.body;
    const pontosNum = parseInt(pontos);
    const valido = titulo && titulo.trim() && descricao && descricao.trim()
        && CATEGORIAS.includes(categoria) && TIPOS.includes(tipo)
        && Number.isInteger(pontosNum) && pontosNum >= 0;

    if (!valido) return res.redirect("/adm/anuncios?msg=anuncio-invalido");

    const atualizado = anunciosModel.update(Number(req.params.id), { titulo, descricao, categoria, tipo, pontos: pontosNum });
    res.redirect(`/adm/anuncios?msg=${atualizado ? "anuncio-editado" : "anuncio-invalido"}`);
});

// ============================================
// 🗑️  DELETAR anúncio — POST /adm/anuncios/deletar/:id
// ============================================
router.post("/anuncios/deletar/:id", (req, res) => {
    anunciosModel.delete(Number(req.params.id));
    res.redirect("/adm/anuncios?msg=anuncio-removido");
});

// ============================================
// 🔄 TROCAS — GET /adm/trocas
// ============================================
router.get("/trocas", (req, res) => {
    const trocas = trocasModel.findAll().map(t => ({
        ...t,
        data: formatarData(t.dataSolicitacao),
        dataFim: formatarData(t.dataConclusao),
    }));
    const contagem = {
        total:     trocas.length,
        pendente:  trocas.filter(t => t.status === "pendente").length,
        concluida: trocas.filter(t => t.status === "concluida").length,
        cancelada: trocas.filter(t => t.status === "cancelada").length,
    };
    res.render("pages/adm/trocas", { trocas, contagem });
});

// ============================================
// ✅ CONFIRMAR troca — POST /adm/trocas/confirmar/:id
// ============================================
router.post("/trocas/confirmar/:id", (req, res) => {
    const ok = trocasModel.confirmar(Number(req.params.id));
    res.redirect(`/adm/trocas?msg=${ok ? "troca-confirmada" : "troca-erro"}`);
});

// ============================================
// ✖️  CANCELAR troca — POST /adm/trocas/cancelar/:id
// ============================================
router.post("/trocas/cancelar/:id", (req, res) => {
    const ok = trocasModel.cancelar(Number(req.params.id));
    res.redirect(`/adm/trocas?msg=${ok ? "troca-cancelada" : "troca-erro"}`);
});

// ============================================
// 🗑️  DELETAR troca — POST /adm/trocas/deletar/:id
// ============================================
router.post("/trocas/deletar/:id", (req, res) => {
    const ok = trocasModel.delete(Number(req.params.id));
    res.redirect(`/adm/trocas?msg=${ok ? "troca-removida" : "troca-erro"}`);
});

// ============================================
// 👥 USUÁRIOS — GET /adm/usuarios
// ============================================
router.get("/usuarios", async (req, res) => {
    const usuarios = await usuariosModel.findAll({ limit: 100000, offset: 0 });
    res.render("pages/adm/usuarios", { usuarios });
});

// ============================================
// 🗑️  REMOVER conta — POST /adm/usuarios/deletar/:id
// ============================================
router.post("/usuarios/deletar/:id", async (req, res) => {
    const id = req.params.id;
    try {
        if (String(id) === String(req.session.usuario.id)) {
            return res.redirect("/adm/usuarios?msg=usuario-proprio");
        }
        const usuario = await usuariosModel.findById(id);
        if (!usuario) return res.redirect("/adm/usuarios?msg=usuario-erro");
        if (usuario.perfil === "admin") return res.redirect("/adm/usuarios?msg=usuario-admin");

        await passkeysModel.deleteByUserId(usuario.id);
        anunciosModel.desativarPorDoador(usuario.id);
        const ok = await usuariosModel.delete(usuario.id);
        res.redirect(`/adm/usuarios?msg=${ok ? "usuario-removido" : "usuario-erro"}`);
    } catch (err) {
        console.error("Erro ao remover usuário:", err);
        res.redirect("/adm/usuarios?msg=usuario-erro");
    }
});

module.exports = router;
