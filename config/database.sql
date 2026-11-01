-- ============================================
-- CPC - Conexão Por Créditos: esquema do MySQL (referência)
--
-- Não é preciso rodar este arquivo: ao iniciar, o app cria e atualiza estas
-- tabelas sozinho (config/banco.js). Para criar o banco vazio antes do deploy:
--   node config/init-db.js
-- ============================================

CREATE TABLE IF NOT EXISTS usuarios (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nome VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  senha CHAR(60) DEFAULT NULL,
  foto VARCHAR(255) DEFAULT NULL,
  perfil VARCHAR(50) NOT NULL DEFAULT 'user',
  provider VARCHAR(50) NOT NULL DEFAULT 'local',
  provider_id VARCHAR(255) DEFAULT NULL,
  telefone VARCHAR(20) DEFAULT NULL,
  endereco VARCHAR(255) DEFAULT NULL,
  data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultimo_login TIMESTAMP NULL DEFAULT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'ativo',
  INDEX idx_provider_id (provider, provider_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Provedores sociais vinculados (uma conta pode entrar com Google, Facebook, LinkedIn, Apple...)
CREATE TABLE IF NOT EXISTS usuario_provedores (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  provider VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  vinculado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_provedores_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  UNIQUE KEY uq_provedor (provider, provider_id),
  UNIQUE KEY uq_usuario_provedor (usuario_id, provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Chaves de acesso (Face ID / biometria). Só a chave PÚBLICA fica no servidor;
-- a biometria em si nunca sai do aparelho do usuário.
CREATE TABLE IF NOT EXISTS passkeys (
  id INT PRIMARY KEY AUTO_INCREMENT,
  usuario_id INT NOT NULL,
  credential_id VARCHAR(512) NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter BIGINT UNSIGNED NOT NULL DEFAULT 0,
  transports JSON DEFAULT NULL,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultimo_uso TIMESTAMP NULL DEFAULT NULL,
  CONSTRAINT fk_passkeys_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_passkeys_usuario (usuario_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
