// Testes das regras de créditos (app/services/trocaService.js).
// Rodam no modo local (data/*.json), sem tocar no MySQL; os arquivos de data/ são restaurados no fim.
// Uso: npm test
process.env.DB_HOST = "";
process.env.DB_NAME = "";
process.env.DATABASE_URL = "";

const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const pastaDados = path.join(__dirname, "../data");
const copia = fs.mkdtempSync(path.join(os.tmpdir(), "cpc-dados-"));
const arquivos = ["usuarios.json", "anuncios.json", "trocas.json", "stats.json", "passkeys.json"];

before(() => {
  arquivos.forEach((nome) => {
    const origem = path.join(pastaDados, nome);
    if (fs.existsSync(origem)) fs.copyFileSync(origem, path.join(copia, nome));
  });
});

after(() => {
  arquivos.forEach((nome) => {
    const salvo = path.join(copia, nome);
    const destino = path.join(pastaDados, nome);
    if (fs.existsSync(salvo)) fs.copyFileSync(salvo, destino);
    else fs.rmSync(destino, { force: true });
  });
  fs.rmSync(copia, { recursive: true, force: true });
});

const usuarios = require("../app/models/models");
const anuncios = require("../app/models/anunciosModel");
const trocas = require("../app/models/trocasModel");
const servico = require("../app/services/trocaService");
const { SALDO_INICIAL } = require("../config/banco");

const marca = Date.now();
const criarConta = async (nome) => {
  const criada = await usuarios.create({ nome, email: `${nome.split(" ")[0].toLowerCase()}.${marca}@exemplo.com`, senha: "segredo123" });
  return usuarios.findById(criada.id);
};
const saldo = async (conta) => (await usuarios.findById(conta.id)).creditos;

let doador, solicitante, anuncio;

before(async () => {
  doador = await criarConta("Doador Teste");
  solicitante = await criarConta("Solicitante Teste");
  anuncio = await anuncios.create({
    titulo: "Item teste", descricao: "x", categoria: "alimentos", pontos: 5,
    doadorId: doador.id, doadorNome: doador.nome,
  });
});

test("conta nova começa com o saldo inicial", async () => {
  assert.strictEqual(await saldo(doador), SALDO_INICIAL);
  assert.strictEqual(await saldo(solicitante), SALDO_INICIAL);
});

test("não dá para pedir o próprio anúncio", async () => {
  const resultado = await servico.solicitar({ usuario: doador, anuncio });
  assert.strictEqual(resultado.erro, "proprio");
});

test("pedir reserva os créditos e concluir paga o doador uma vez só", async () => {
  const { troca } = await servico.solicitar({ usuario: solicitante, anuncio });
  assert.strictEqual(await saldo(solicitante), SALDO_INICIAL - 5);
  assert.strictEqual((await servico.solicitar({ usuario: solicitante, anuncio })).erro, "duplicada");

  await servico.concluir(troca.id);
  assert.strictEqual(await saldo(doador), SALDO_INICIAL + 5);
  assert.strictEqual(await servico.concluir(troca.id), null);
  assert.strictEqual(await saldo(doador), SALDO_INICIAL + 5);
});

test("cancelar devolve os créditos uma vez só", async () => {
  const antes = await saldo(solicitante);
  const { troca } = await servico.solicitar({ usuario: solicitante, anuncio });
  assert.strictEqual(await saldo(solicitante), antes - 5);
  await servico.cancelar(troca.id);
  assert.strictEqual(await servico.cancelar(troca.id), null);
  assert.strictEqual(await saldo(solicitante), antes);
});

test("excluir troca pendente devolve os créditos", async () => {
  const antes = await saldo(solicitante);
  const { troca } = await servico.solicitar({ usuario: solicitante, anuncio });
  await servico.excluir(troca.id);
  assert.strictEqual(await trocas.findById(troca.id), null);
  assert.strictEqual(await saldo(solicitante), antes);
});

test("anúncio removido cancela os pedidos pendentes", async () => {
  const antes = await saldo(solicitante);
  await servico.solicitar({ usuario: solicitante, anuncio });
  await anuncios.delete(anuncio.id);
  assert.strictEqual(await servico.cancelarPendentes({ anuncioId: anuncio.id }), 1);
  assert.strictEqual(await saldo(solicitante), antes);
});

test("saldo insuficiente recusa o pedido sem mexer no saldo", async () => {
  const antes = await saldo(solicitante);
  const caro = await anuncios.create({
    titulo: "Item caro", descricao: "x", categoria: "alimentos", pontos: antes + 1,
    doadorId: doador.id, doadorNome: doador.nome,
  });
  assert.strictEqual((await servico.solicitar({ usuario: solicitante, anuncio: caro })).erro, "saldo");
  assert.strictEqual(await saldo(solicitante), antes);
});

test("senhas novas são guardadas com bcrypt", async () => {
  const conta = JSON.parse(fs.readFileSync(path.join(pastaDados, "usuarios.json"), "utf8"))
    .find((u) => u.id === solicitante.id);
  assert.match(conta.senha, /^\$2/);
});
