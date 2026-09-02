Para instalar as dependencias use:
npm i --save

## Deploy no Render

O arquivo `render.yaml` configura o serviço Node.js automaticamente. No Render:

1. Crie um **New Blueprint Instance** e selecione este repositório.
2. Defina `APP_BASE_URL` como a URL pública gerada para o serviço.
3. Preencha as variáveis marcadas como `sync: false` no painel do Render.
4. Configure um banco MySQL externo e informe `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`.
5. Atualize os callbacks OAuth para `/auth/google/callback` e `/auth/github/callback` usando o domínio público.

O Codespace não deve ser usado como hospedagem de produção. O armazenamento JSON em `data/` e os uploads locais são adequados para desenvolvimento, mas não são persistentes no plano gratuito do Render. Para manter cadastros, anúncios e imagens após reinícios, use banco e armazenamento persistentes.