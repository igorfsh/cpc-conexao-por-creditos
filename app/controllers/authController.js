// Controller dedicado para lógica de autenticação social
module.exports = {
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
      };
 
      console.log(`📋 Sessão atualizada para usuário: ${req.user.nome}`);
      console.log(`📊 Dados da sessão:`, req.session.usuario);
 
      // Salvar a sessão explicitamente antes de redirecionar
      req.session.save((err) => {
        if (err) {
          console.error("❌ Erro ao salvar sessão:", err);
          return res.redirect("/login");
        }
       
        console.log("✅ Sessão salva com sucesso, redirecionando para /");
        return res.redirect("/");
      });
    } catch (err) {
      console.error("❌ Falha no callback de OAuth:", err);
      return res.redirect("/login");
    }
  },
};