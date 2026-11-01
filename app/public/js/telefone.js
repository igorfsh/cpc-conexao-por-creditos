// Validação de telefone/WhatsApp brasileiro. Usado no navegador (window.CPCTelefone) e no servidor (require).
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.CPCTelefone = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  var DDDS = [
    11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
  ];

  // Retorna { valido, whatsapp: "5511912345678", formatado: "(11) 91234-5678" } ou { valido: false, erro }.
  function validarTelefone(valor) {
    var digitos = String(valor || "").replace(/\D/g, "");
    if (!digitos) return { valido: false, erro: "Informe o número de WhatsApp com DDD." };

    if (digitos.indexOf("00") === 0) digitos = digitos.slice(2);
    if (digitos.indexOf("55") === 0 && (digitos.length === 12 || digitos.length === 13)) digitos = digitos.slice(2);
    if (digitos.charAt(0) === "0" && (digitos.length === 11 || digitos.length === 12)) digitos = digitos.slice(1);

    if (digitos.length !== 10 && digitos.length !== 11) {
      return { valido: false, erro: "O número deve ter DDD + 8 ou 9 dígitos. Ex.: (11) 91234-5678" };
    }

    var ddd = Number(digitos.slice(0, 2));
    var numero = digitos.slice(2);
    if (DDDS.indexOf(ddd) === -1) return { valido: false, erro: "DDD " + digitos.slice(0, 2) + " não existe." };

    var celular = numero.length === 9 && numero.charAt(0) === "9";
    var fixo = numero.length === 8 && /[2-5]/.test(numero.charAt(0));
    if (!celular && !fixo) {
      return {
        valido: false,
        erro: numero.length === 9
          ? "Celular deve começar com 9 depois do DDD."
          : "Número inválido. Celulares têm 9 dígitos começando com 9.",
      };
    }
    if (/^(\d)\1+$/.test(numero)) return { valido: false, erro: "Número inválido." };

    var meio = numero.length - 4;
    return {
      valido: true,
      whatsapp: "55" + digitos,
      formatado: "(" + digitos.slice(0, 2) + ") " + numero.slice(0, meio) + "-" + numero.slice(meio),
    };
  }

  // Máscara enquanto digita: (11) 91234-5678
  function mascararTelefone(valor) {
    var d = String(valor || "").replace(/\D/g, "");
    if (d.indexOf("55") === 0 && d.length > 11) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? "(" + d : "";
    var resto = d.slice(2);
    var meio = resto.length > 8 ? 5 : 4;
    return "(" + d.slice(0, 2) + ") " + (resto.length > meio ? resto.slice(0, meio) + "-" + resto.slice(meio) : resto);
  }

  return { validarTelefone: validarTelefone, mascararTelefone: mascararTelefone };
});
