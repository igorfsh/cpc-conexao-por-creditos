// Controller dedicado para lógica de autenticação social
const mensagensErroSocial = {
  "provedor-indisponivel": "Esse login social ainda não está disponível. Use e-mail e senha ou outra opção.",
  "social": "Não foi possível entrar com a conta social. Tente novamente.",
  "social-cancelado": "Login social cancelado.",
  "social-expirado": "A tentativa de login expirou. Tente novamente.",
  "sem-email": "O provedor não compartilhou seu e-mail. Autorize o acesso ao e-mail e tente de novo.",
  "email-nao-verificado": "Já existe uma conta com esse e-mail, mas ele não está verificado no provedor. Entre com e-mail e senha.",
  "conta-inativa": "Esta conta está inativa.",
};

module.exports = {
  mensagensErroSocial,

  oauthCallback: (req, res) => {
    try {
      console.log("🔐 Processando OAuth callback...");
     
      if (!req.user) {
        console.error("❌ Nenhum usuário autenticado no callback!");
        return res.redirect("/login");
      }
 
      console.log(`✅ Usuário autenticado: ${req.user?.nome || "<sem nome>"} (ID: ${req.user?.id || "<sem id>"})`);
      console.log("📌 req.user completo:", req.user);
 
      // Salvar informações na sessão
      req.session.usuarioId = req.user.id;
      req.session.usuario = {
        id: req.user.id,
        nome: req.user.nome,
        email: req.user.email,
        foto: req.user.foto || null,
        provider: req.user.provider || "local",
        perfil: req.user.perfil || "user",
        status: req.user.status || "ativo",
      };
 
      console.log(`📋 Sessão atualizada para usuário: ${req.user.nome}`);
      console.log(`📊 Dados da sessão:`, req.session.usuario);
 
      // Salvar a sessão explicitamente antes de redirecionar
      req.session.save((err) => {
        if (err) {
          console.error("❌ Erro ao salvar sessão:", err);
          return res.redirect("/login");
        }
       
        const destino = req.session.redirectAfterLogin || (req.user.perfil === "admin" ? "/adm" : "/");
        delete req.session.redirectAfterLogin;
        console.log(`✅ Sessão salva com sucesso, redirecionando para ${destino}`);
        return res.redirect(destino);
      });
    } catch (err) {
      console.error("❌ Falha no callback de OAuth:", err);
      return res.redirect("/login");
    }
  },
};