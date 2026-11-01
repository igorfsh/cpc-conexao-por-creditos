const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

// Extrai só "Cidade-UF" do endereço completo, para não expor rua e número nos anúncios.
// Retorna null quando não encontra uma cidade seguida de UF válida no final.
const extrairCidadeUF = (endereco) => {
  if (!endereco) return null;
  const texto = endereco
    .replace(/\b\d{5}-?\d{3}\b/g, "")
    .trim()
    .replace(/[\s,.;-]+$/, "");
  const encontrado = texto.match(/(?:^|,)\s*([^,\d]+?)\s*[-\/,]\s*([A-Za-z]{2})$/);
  if (!encontrado) return null;

  const uf = encontrado[2].toUpperCase();
  const cidade = encontrado[1].trim();
  if (!UFS.includes(uf) || cidade.length < 2) return null;
  return `${cidade}-${uf}`;
};

module.exports = { extrairCidadeUF };
