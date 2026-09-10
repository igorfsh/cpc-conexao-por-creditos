# 🚀 CPC - Conexão Por Créditos

## Sistema de Autenticação com Login/Cadastro

---

## 📋 Setup Rápido

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar `.env`
```bash
cp .env.example .env
```

Edite `.env` com suas credenciais (para quando usar MySQL em produção)

### 3. Iniciar o servidor
```bash
npm start
# ou
node app.js
```

Acesse: `http://localhost:3000` 🌐

---

## 🔐 Autenticação

### Fluxo de Login/Cadastro:

1. **Primeira Visita** → Clique em **LOGIN** no header
2. **Ainda não tem conta?** → Clique em **CADASTRAR**
   - Preencha: Nome (mín. 3 caracteres), Email, Senha (mín. 6 caracteres)
   - Confirme a senha
   - Clique em **CADASTRAR**
   
3. **Conta Criada** → Volte para **LOGIN**
   - Digite seu Email
   - Digite sua Senha
   - Clique em **ENTRAR**

4. **Logado** → Header muda para **👤 Seu Nome**
   - Clique para ver seu **PERFIL** (`/conta`)
   - Veja seus dados salvos no banco
   - Clique em **SAIR** para fazer logout

---

## 💾 Armazenamento de Dados

### Desenvolvimento (Atual)
- **Banco de dados**: JSON (arquivo `data/usuarios.json`)
- **Sessões**: Express-session (em memória, 7 dias)
- **Vantagem**: Funciona sem MySQL instalado

```json
// data/usuarios.json - exemplo
[
  {
    "id": 1,
    "nome": "João Silva",
    "email": "joao@email.com",
    "senha": "123456",
    "dataCriacao": "2026-04-17T01:04:00.000Z"
  }
]
```

### Produção
Para usar MySQL em produção:
1. Instale MySQL
2. Configure credenciais em `.env`
3. Execute `node config/init-db.js`
4. O modelo usa MySQL automaticamente quando `DB_HOST` e `DB_NAME` estão definidos

Para o login por Face ID ou biometria digital no Render, configure também:

- `WEBAUTHN_RP_ID`: somente o domínio público, sem `https://` e sem caminho
- `WEBAUTHN_ORIGIN`: a origem pública completa, por exemplo `https://cpc-conexao-por-creditos.onrender.com`

A tabela `passkeys` precisa ser criada pelo `config/database.sql`. Não use `data/passkeys.json` para credenciais em produção, pois o filesystem do Render pode ser reiniciado.

---

## 📁 Estrutura

```
/
├── app.js                    # Servidor principal
├── .env                      # Variáveis de ambiente (privado)
├── .env.example             # Template .env
├── package.json             # Dependências
│
├── app/
│   ├── controllers/         # Lógica de negócio
│   │   └── controllers.js
│   ├── models/              # Banco de dados
│   │   └── models.js
│   ├── routes/              # Rotas
│   │   └── router.js
│   ├── views/               # EJS templates
│   │   ├── pages/
│   │   │   ├── login.ejs
│   │   │   ├── conta.ejs
│   │   │   ├── home.ejs
│   │   │   └── ...
│   │   └── partials/
│   │       ├── header.ejs
│   │       └── footer.ejs
│   └── public/              # Estáticos
│       ├── css/
│       ├── js/
│       └── img/
│
├── config/
│   ├── pool_conexoes.js     # Conexão MySQL
│   ├── init-db.js           # Script de inicialização
│   └── database.sql         # Schema SQL
│
└── data/
    └── usuarios.json        # Banco de dados (JSON)
```

---

## 🔧 Variáveis de Ambiente (.env)

```ini
# Servidor
APP_PORT=3000

# Banco de Dados
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=cpc

# Sessão
SESSION_SECRET=seu-secret-seguro-aqui

# Ambiente
NODE_ENV=development
```

---

## 🛣️ Rotas Disponíveis

| Rota | Método | Descrição |
|------|--------|-----------|
| `/` | GET | Home page |
| `/login` | GET | Página de login/cadastro |
| `/cadastro` | POST | Enviar cadastro |
| `/login` | POST | Enviar login |
| `/logout` | GET | Fazer logout |
| `/conta` | GET | Perfil (protegido) |
| `/sobrenos` | GET | Sobre nós |
| `/como-funciona` | GET | Como funciona |
| `/servicos` | GET | Serviços |
| `...` | GET | Outras páginas |

---

## 🔒 Proteção de Rotas

A rota `/conta` é **protegida**:
- ✅ Usuário logado → Acessa normalmente
- ❌ Não logado → Redireciona para `/login`

---

## 📝 Exemplo de Teste

1. Acesse `http://localhost:3000`
2. Clique em **LOGIN**
3. Clique em **CADASTRAR**
4. Preencha:
   - Nome: `João Silva`
   - Email: `joao@test.com`
   - Senha: `123456`
   - Confirmar: `123456`
5. Clique em **CADASTRAR**
6. Retorne para **LOGIN**
7. Preencha:
   - Usuário/Email: `joao@test.com`
   - Senha: `123456`
8. Clique em **ENTRAR**
9. Veja seu perfil com seus dados! 👤

---

## 🚀 Próximos Passos

- [ ] Hash de senhas (bcryptjs)
- [ ] Reset de senha por email
- [ ] Upload de foto de perfil
- [ ] Editar perfil
- [ ] Deletar conta
- [ ] Autenticação OAuth (Google, GitHub)
- [ ] Migrar para MySQL em produção

---

## 🐛 Troubleshooting

### Erro: "Não consigo fazer login"
- ✅ Certifique-se que o email está correto
- ✅ Verifique se cadastrou primeiro
- ✅ Tente com o email ao invés do nome

### Erro: "Porta 3000 já está em uso"
- Mude a porta em `.env`: `APP_PORT=3001`

### Erro: "Sessão não persiste"
- Cookies podem estar desabilitados
- Abra em modo privado/incógnito

---

📧 **Dúvidas?** Consulte os logs do console do servidor!

