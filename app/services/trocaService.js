// Regras de créditos de uma troca.
//
// - Ao pedir a troca, o custo do anúncio sai do saldo de quem pediu e fica reservado na troca.
// - Troca concluída: os créditos reservados vão para quem ofereceu o anúncio.
// - Troca cancelada ou excluída antes de concluir: os créditos voltam para quem pediu.
// Trocas antigas (de antes dos créditos) não reservaram nada, então não movem saldo.
const usuariosModel = require("../models/models");
const trocasModel = require("../models/trocasModel");

const devolverReserva = async (troca) => {
  if (troca?.creditosReservados && troca.solicitanteId && troca.pontos > 0) {
    await usuariosModel.ajustarCreditos(troca.solicitanteId, troca.pontos);
  }
};

const ehDoSolicitante = (troca, usuario) =>
  String(troca.solicitanteId) === String(usuario.id) || troca.solicitanteEmail === usuario.email;

// Devolve { troca } ou { erro: "saldo" | "duplicada" | "proprio" }.
const solicitar = async ({ usuario, anuncio, mensagem }) => {
  if (anuncio.doadorId && String(anuncio.doadorId) === String(usuario.id)) return { erro: "proprio" };

  const pendente = (await trocasModel.findAll()).find(
    (t) => t.status === "pendente" && t.anuncioId === anuncio.id && ehDoSolicitante(t, usuario)
  );
  if (pendente) return { erro: "duplicada", troca: pendente };

  const pontos = Math.max(parseInt(anuncio.pontos) || 0, 0);
  if (pontos > 0 && !(await usuariosModel.ajustarCreditos(usuario.id, -pontos))) return { erro: "saldo" };

  try {
    const troca = await trocasModel.create({
      anuncioId: anuncio.id,
      anuncioTitulo: anuncio.titulo || "Anúncio CPC",
      doadorId: anuncio.doadorId || null,
      doadorNome: anuncio.doadorNome || "Doador CPC",
      foto: anuncio.foto || "../img/img malcon.png",
      solicitanteId: usuario.id,
      solicitanteNome: usuario.nome || "Visitante",
      solicitanteEmail: usuario.email || "",
      pontos,
      creditosReservados: pontos > 0,
      mensagem: mensagem || "",
    });
    return { troca };
  } catch (err) {
    if (pontos > 0) await usuariosModel.ajustarCreditos(usuario.id, pontos);
    throw err;
  }
};

const concluir = async (id) => {
  const troca = await trocasModel.confirmar(id);
  if (troca?.creditosReservados && troca.doadorId && troca.pontos > 0) {
    await usuariosModel.ajustarCreditos(troca.doadorId, troca.pontos);
  }
  return troca;
};

const cancelar = async (id) => {
  const troca = await trocasModel.cancelar(id);
  await devolverReserva(troca);
  return troca;
};

const excluir = async (id) => {
  const troca = await trocasModel.findById(id);
  if (!troca) return false;
  if (troca.status === "pendente") await cancelar(id);
  return trocasModel.delete(id);
};

// Anúncio que saiu do ar (ou conta removida): ninguém vai entregar, então devolve os créditos de quem pediu.
const cancelarPendentes = async ({ anuncioId, doadorId }) => {
  const pendentes = (await trocasModel.findAll()).filter((t) => t.status === "pendente"
    && ((anuncioId && t.anuncioId === Number(anuncioId)) || (doadorId && String(t.doadorId) === String(doadorId))));
  for (const troca of pendentes) await cancelar(troca.id);
  return pendentes.length;
};

module.exports = { solicitar, concluir, cancelar, excluir, cancelarPendentes };
