-- ============================================
-- 📊 CPC - Conexão Por Créditos
-- Banco de Dados para Login/Cadastro
-- ============================================

-- Tabela de Usuários (Cadastro/Login)
CREATE TABLE IF NOT EXISTS usuarios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  senha CHAR(60) DEFAULT NULL,
  foto VARCHAR(255) DEFAULT NULL,
  perfil VARCHAR(50) NOT NULL DEFAULT 'user',
  provider VARCHAR(50) NOT NULL DEFAULT 'local',
  provider_id VARCHAR(255) DEFAULT NULL,
  data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS perfil VARCHAR(50) NOT NULL DEFAULT 'user';

-- Índice para buscas por email
CREATE INDEX idx_email ON usuarios(email);
-- Índice para busca por provedor social
CREATE INDEX idx_provider_id ON usuarios(provider, provider_id);

-- Credenciais WebAuthn vinculadas a contas já cadastradas
CREATE TABLE IF NOT EXISTS passkeys (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  credential_id VARCHAR(512) UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports JSON DEFAULT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_passkeys_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_passkeys_usuario (usuario_id)
);

-- ============================================
-- Dados de exemplo
-- ============================================
INSERT INTO usuarios (nome, email, senha)
VALUES 
('João da Silva', 'joao@email.com', '123456'),
('Maria Santos', 'maria@email.com', '123456');