// Decide qual foto mostrar para um anúncio: a do ITEM (cards, resumo) ou a da PESSOA (avatar do anunciante).

// Imagens ilustrativas por categoria, para anúncios que ainda não têm foto do item.
const IMAGENS_CATEGORIA = {
  profissionais: ["/img/servicos.jpeg", "/img/img2-home.jpeg", "/img/img home-2.webp"],
  alimentos: ["/img/img alimentacao.jpeg", "/img/leite.webp", "/img/img2-home.jpeg"],
  infantil: ["/img/img kids.jpeg", "/img/img2-home.jpeg", "/img/img home-2.webp"],
  default: ["/img/img2-home.jpeg", "/img/img cpc-verde.jpeg", "/img/servicos.jpeg"],
};

const FOTO_ANUNCIANTE_BASE = "/img/img malcon.png";
const FOTO_PERFIL_PADRAO = "/img/img perfil.png";

const normalizar = (url) => String(url || "").replace(/^\.\.\//, "/");

// Fotos de perfil (anunciante de exemplo e uploads de perfil) não representam o item.
const ehFotoDePessoa = (url) => /malcon|\/img\/perfis\/|img perfil/i.test(normalizar(url));

const imagensDoItem = (anuncio) =>
  [...(Array.isArray(anuncio?.imagens) ? anuncio.imagens : []), anuncio?.foto]
    .filter(Boolean)
    .map(normalizar)
    .filter((url, i, lista) => !ehFotoDePessoa(url) && lista.indexOf(url) === i);

const fotoDoItem = (anuncio) => imagensDoItem(anuncio)[0] || null;

const imagensDaCategoria = (categoria) => IMAGENS_CATEGORIA[categoria] || IMAGENS_CATEGORIA.default;

// Foto de capa para cards: o item ou, sem foto do item, a ilustração da categoria.
const fotoCapa = (anuncio) => fotoDoItem(anuncio) || imagensDaCategoria(anuncio?.categoria)[0];

// Três imagens para o carrossel: fotos do item completadas com as da categoria.
const imagensCarrossel = (anuncio) => {
  const proprias = imagensDoItem(anuncio);
  const padrao = imagensDaCategoria(anuncio?.categoria);
  return [0, 1, 2].map((i) => proprias[i] || padrao[i]);
};

// Avatar de quem anuncia: foto da conta ou, nos anúncios de exemplo, a foto do anunciante base.
const fotoAnunciante = (anuncio, doador) => {
  if (doador?.foto) return doador.foto;
  if (!anuncio?.doadorId && ehFotoDePessoa(anuncio?.foto)) return normalizar(anuncio.foto);
  return anuncio?.doadorId ? FOTO_PERFIL_PADRAO : FOTO_ANUNCIANTE_BASE;
};

module.exports = { fotoDoItem, fotoCapa, imagensCarrossel, fotoAnunciante, ehFotoDePessoa };
