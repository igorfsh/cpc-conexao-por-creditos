(function () {
  "use strict";

  let installPrompt;
  const installInviteKey = "cpc-pwa-install-invite-seen";
  const banner = document.getElementById("pwa-install");
  const installButton = document.getElementById("pwa-install-button");
  const closeButton = document.getElementById("pwa-install-close");

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches
    || window.navigator.standalone === true;
  const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const installInviteSeen = window.localStorage.getItem(installInviteKey) === "true";

  if (!banner || !installButton || !closeButton || isStandalone || installInviteSeen) return;

  const markInstallInviteAsSeen = () => {
    window.localStorage.setItem(installInviteKey, "true");
    banner.hidden = true;
    installPrompt = null;
  };

  if (isIos) {
    banner.querySelector("strong").textContent = "Adicione o CPC à sua tela inicial";
    banner.querySelector("p").textContent = "Toque em Compartilhar e escolha Adicionar à Tela de Início para instalar.";
    banner.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    banner.hidden = false;
  });

  installButton.addEventListener("click", async () => {
    if (isIos) {
      banner.querySelector("p").textContent = "Agora toque no ícone Compartilhar do Safari e selecione Adicionar à Tela de Início.";
      installButton.textContent = "Veja como instalar";
      return;
    }

    if (!installPrompt) return;
    markInstallInviteAsSeen();
    installPrompt.prompt();
    await installPrompt.userChoice;
  });

  closeButton.addEventListener("click", () => {
    markInstallInviteAsSeen();
  });

  window.addEventListener("appinstalled", () => {
    markInstallInviteAsSeen();
  });
}());