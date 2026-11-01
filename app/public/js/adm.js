// Painel admin — busca, filtros por chip, confirmação de ações e modais
document.addEventListener('DOMContentLoaded', function () {
  const busca = document.getElementById('busca');
  const chips = document.querySelectorAll('.adm-chips .chip');
  const linhas = document.querySelectorAll('.adm-table tbody tr');
  const semResultado = document.getElementById('semResultado');
  let filtroAtivo = '';

  const aplicarFiltros = () => {
    const termo = busca ? busca.value.trim().toLowerCase() : '';
    let visiveis = 0;
    linhas.forEach((linha) => {
      const okFiltro = !filtroAtivo || linha.dataset.filtro === filtroAtivo;
      const okBusca = !termo || (linha.dataset.busca || '').includes(termo);
      linha.hidden = !(okFiltro && okBusca);
      if (!linha.hidden) visiveis++;
    });
    if (semResultado) semResultado.hidden = visiveis > 0;
  };

  const selecionarChip = (chip) => {
    chips.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    filtroAtivo = chip.dataset.filtro;
    aplicarFiltros();
  };

  chips.forEach((chip) => chip.addEventListener('click', () => selecionarChip(chip)));
  if (busca) busca.addEventListener('input', aplicarFiltros);

  // Pré-seleciona o filtro vindo da URL (?status=pendente)
  const statusUrl = new URLSearchParams(location.search).get('status');
  const chipUrl = statusUrl && Array.from(chips).find((c) => c.dataset.filtro === statusUrl);
  if (chipUrl) selecionarChip(chipUrl);

  // Confirmação antes de ações destrutivas
  document.querySelectorAll('form[data-confirmar]').forEach((form) => {
    form.addEventListener('submit', (e) => {
      if (!confirm(form.dataset.confirmar)) e.preventDefault();
    });
  });

  // Fecha modais
  document.querySelectorAll('[data-fechar]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  });
  document.querySelectorAll('dialog').forEach((dialog) => {
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  });

  // Remove ?msg= da URL para o alerta não reaparecer ao recarregar
  const alerta = document.querySelector('.adm-alert');
  if (alerta) {
    const url = new URL(location.href);
    url.searchParams.delete('msg');
    history.replaceState(null, '', url);
    setTimeout(() => alerta.classList.add('adm-alert-hide'), 4000);
  }
});
