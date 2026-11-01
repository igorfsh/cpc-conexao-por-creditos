Para instalar as dependencias use:
npm i --save

## Deploy no Render

O arquivo `render.yaml` configura o serviço Node.js automaticamente. No Render:

1. Crie um **New Blueprint Instance** e selecione este repositório.
2. Defina `APP_BASE_URL` como a URL pública gerada para o serviço.
3. Preencha as variáveis marcadas como `sync: false` no painel do Render.
4. Configure um banco MySQL externo e informe `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`.
5. Atualize os callbacks OAuth para `/auth/<provedor>/callback` usando o domínio público (veja abaixo).

## Contas e Face ID/biometria que não somem no Render

O disco do Render (plano gratuito) é apagado a cada deploy ou reinício. Por isso as **contas** e as **chaves de Face ID/digital** ficam num banco MySQL. Do aparelho, o servidor guarda só a chave pública; a biometria nunca sai do celular.

**Configuração (uma vez):**

1. Crie um MySQL gratuito e permanente, por exemplo no **TiDB Cloud Serverless** (tidbcloud.com, compatível com MySQL) ou no **Aiven for MySQL** (plano Free).
2. No painel do serviço no Render → **Environment**, defina:
   - `DATABASE_URL` = a URL de conexão do provedor, no formato `mysql://usuario:senha@host:porta/banco`; **ou** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME` separados.
   - `DB_SSL` = `true` (já vem no `render.yaml`; esses provedores exigem conexão criptografada).
   - `DB_SSL_CA` = só se o provedor fornecer um certificado `.pem` (o Aiven fornece; cole o conteúdo do arquivo).
3. Faça o deploy. Ao iniciar, o app **cria e atualiza as tabelas sozinho** (`config/banco.js`).
4. Abra `https://SEU-DOMINIO/health` e confira: `"modo": "mysql", "persistente": true, "pronto": true, "biometria": "disponivel"`.

**Proteções:**

- **Sem banco configurado no Render**, o log mostra um erro e o cadastro de Face ID/digital fica **bloqueado** (`"biometria": "bloqueada"` no `/health`). Assim ninguém cadastra uma biometria que sumiria no próximo reinício.
- Com banco configurado, nada é gravado em JSON. Se o banco cair ou demorar mais de 8 s (`DB_TIMEOUT_MS`), o usuário vê uma mensagem de erro em vez de um "sucesso" falso.
- Mantenha `WEBAUTHN_RP_ID` e `WEBAUTHN_ORIGIN` (já no `render.yaml`) com o mesmo domínio: se o domínio mudar, as chaves cadastradas deixam de valer.

Sem banco, em desenvolvimento local, tudo continua em `data/*.json` normalmente.

## Login e cadastro social

Os botões de Google, Facebook, LinkedIn, Apple (iCloud) e GitHub só aparecem na tela de login quando as variáveis do provedor estão definidas (veja `.env.example`). O mesmo botão serve para cadastro e login: se a pessoa já tem conta com o mesmo e-mail **verificado** pelo provedor, o provedor é vinculado à conta existente; senão, uma conta nova é criada. Uma conta pode ter vários provedores vinculados.

| Provedor | Onde criar o app | URL de callback a cadastrar |
|---|---|---|
| Google | console.cloud.google.com → APIs e serviços → Credenciais → ID do cliente OAuth (aplicativo da Web) | `https://SEU-DOMINIO/auth/google/callback` |
| Facebook | developers.facebook.com → criar app → caso de uso "Autenticar e solicitar dados de usuários" (permissões `email` e `public_profile`) | `https://SEU-DOMINIO/auth/facebook/callback` em "URIs de redirecionamento do OAuth válidos" |
| LinkedIn | developer.linkedin.com → criar app → aba Products → "Sign In with LinkedIn using OpenID Connect" | `https://SEU-DOMINIO/auth/linkedin/callback` em Auth → Authorized redirect URLs |
| Apple (iCloud) | developer.apple.com (conta paga do Apple Developer Program) → Identifiers: um App ID com "Sign in with Apple" e um **Services ID** (é o `APPLE_CLIENT_ID`); Keys: chave com "Sign in with Apple" (.p8, `APPLE_KEY_ID`); Team ID no canto da conta | `https://SEU-DOMINIO/auth/apple/callback` em Return URLs do Services ID. A Apple não aceita `localhost` nem HTTP. |
| GitHub | github.com/settings/developers → OAuth Apps | `https://SEU-DOMINIO/auth/github/callback` |

Com MySQL, rode `node config/init-db.js` para criar a tabela `usuario_provedores`.

O Codespace não deve ser usado como hospedagem de produção. O armazenamento JSON em `data/` e os uploads locais são adequados para desenvolvimento, mas não são persistentes no plano gratuito do Render. Para manter cadastros, anúncios e imagens após reinícios, use banco e armazenamento persistentes.