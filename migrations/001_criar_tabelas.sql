-- /migration/001_criar_tabelas.sql

CREATE TABLE usuarios (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    email VARCHAR(255) NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT NOW(),
    atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_email (email)
);

CREATE TABLE perfis (
    fk_usuario_id INT UNSIGNED NOT NULL,
    nome VARCHAR(100) NOT NULL,
    nome_slug VARCHAR(100) NOT NULL,
    criado_em DATETIME NOT NULL DEFAULT NOW(),
    atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    PRIMARY KEY (fk_usuario_id),
    UNIQUE KEY uq_slug (nome_slug),
    FOREIGN KEY (fk_usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

CREATE TABLE posts (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    fk_usuario_id INT UNSIGNED NOT NULL,
    titulo VARCHAR(60) NOT NULL DEFAULT '',
    texto VARCHAR(600) NOT NULL,
    post_slug VARCHAR(100) NOT NULL,
    status ENUM(
        'rascunho',
        'publicado',
        'removido'
    ) NOT NULL DEFAULT 'rascunho',
    criado_em DATETIME NOT NULL DEFAULT NOW(),
    atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    PRIMARY KEY (id),
    UNIQUE KEY uq_post_slug (post_slug),
    KEY idx_feed (status, criado_em DESC),
    KEY idx_autor (fk_usuario_id, status),
    FULLTEXT KEY ft_busca (titulo, texto),
    FOREIGN KEY (fk_usuario_id) REFERENCES usuarios (id) ON DELETE CASCADE
);

CREATE TABLE estatisticas_site (
    id             INT UNSIGNED  NOT NULL DEFAULT 1,
    total_usuarios INT UNSIGNED  NOT NULL DEFAULT 0,
    total_posts    INT UNSIGNED  NOT NULL DEFAULT 0,
    atualizado_em  DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    PRIMARY KEY    (id),
    CONSTRAINT     chk_unico CHECK (id = 1)
);

INSERT IGNORE INTO estatisticas_site (id) VALUES (1);