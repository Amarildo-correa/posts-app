-- migrations/001_criar_tabelas.sql
-- ─────────────────────────────────────────────────────────────
-- Schema inicial do posts-app
-- Executa automaticamente via migrate.js antes do servidor subir
-- Imutável após executado em produção — nunca edite esse arquivo
-- Para alterações futuras: crie 003_*, 004_* etc.
-- ─────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────
-- TABELA: usuarios
-- Responsabilidade única: autenticação
-- Separada de perfis — contextos diferentes
-- O Facebook separa auth de identidade pública desde o início
-- ─────────────────────────────────────────────────────────────
CREATE TABLE usuarios (
    id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    email         VARCHAR(255)  NOT NULL,              -- login do usuário
    senha_hash    VARCHAR(255)  NOT NULL,              -- bcrypt — nunca senha pura
    criado_em     DATETIME      NOT NULL DEFAULT NOW(),
    atualizado_em DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),

    PRIMARY KEY   (id),

-- índice único no email — busca de login em O(log n)
-- sem esse índice SELECT WHERE email = ? faz full scan em milhões de usuarios
UNIQUE KEY uq_email (email) );


-- ─────────────────────────────────────────────────────────────
-- TABELA: perfis
-- Responsabilidade única: identidade pública do usuário
-- Relação 1:1 com usuarios — fk_usuario_id é a PK
-- ON DELETE CASCADE — se o usuario for deletado, o perfil some junto
-- ─────────────────────────────────────────────────────────────
CREATE TABLE perfis (
    fk_usuario_id       INT UNSIGNED  NOT NULL,              -- PK e FK simultaneamente
    nome                VARCHAR(100)  NOT NULL,              -- nome de exibição público
    nome_slug           VARCHAR(100)  NOT NULL,              -- URL: /u/joao-silva
    criado_em           DATETIME      NOT NULL DEFAULT NOW(),
    total_perfis        INT UNSIGNED  NOT NULL DEFAULT 0,
    -- desnormalização de nível 1 — estatística DO usuário
    -- quantos posts ESSE usuário publicou
    -- atualizado pela SP cadastrar_usuario_perfil e criar_post
    -- exibido no card de perfil sem precisar de COUNT(*)
    total_posts_perfil INT UNSIGNED  NOT NULL DEFAULT 0,
    
    atualizado_em DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW(),

    PRIMARY KEY   (fk_usuario_id),

-- índice único no slug — GET /u/:slug precisa ser O(log n)
-- sem esse índice cada visita de perfil faz full scan


UNIQUE KEY    uq_slug (nome_slug),

    FOREIGN KEY   (fk_usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);


-- ─────────────────────────────────────────────────────────────
-- TABELA: posts
-- Responsabilidade única: conteúdo publicado
-- Duas colunas de texto — padrão Medium/Substack:
--   texto_curto → exibido no feed (carregamento rápido)
--   texto_longo → exibido na página individual do post
-- status como ENUM — soft delete — post nunca deletado fisicamente
-- ─────────────────────────────────────────────────────────────
CREATE TABLE posts (
    id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    fk_usuario_id INT UNSIGNED  NOT NULL,              -- autor do post

    -- título opcional — DEFAULT '' em vez de NULL
    -- evita o custo do NULL tracker do MySQL em milhões de linhas
    titulo VARCHAR(60) NOT NULL DEFAULT '',

    -- texto_curto aparece no feed — limite de 155 chars
    -- 155 é o limite recomendado de meta description do Google
    -- o feed carrega só essa coluna — sem texto_longo — query mais leve
    texto_curto VARCHAR(155) NOT NULL,

    -- texto_longo aparece só na página individual do post
    -- DEFAULT '' porque post pode ser criado só com texto_curto
    -- carregado só quando o usuário abre o post — lazy loading natural
    texto_longo VARCHAR(1000) NOT NULL DEFAULT '',

    -- slug da URL do post — gerado no Node.js a partir do título
    -- UNIQUE garante que dois posts nunca têm a mesma URL
    post_slug VARCHAR(100) NOT NULL,

    -- total de posts publicados do usuário
    -- NOT NULL DEFAULT 0 — nunca NULL — contador começa em zero
    -- UNSIGNED — contador nunca negativo
    total_posts INT UNSIGNED NOT NULL DEFAULT 0,

    -- ENUM como soft delete — post nunca deletado fisicamente
    -- rascunho: só o autor vê — post incompleto
    -- publicado: aparece no feed público
    -- removido: soft delete — dado preservado pra auditoria
    -- DEFAULT 'rascunho' é mais seguro — post só vai pro feed quando pronto
    -- evita que conteúdo incompleto apareça por acidente
    status ENUM(
        'rascunho',
        'publicado',
        'removido'
    ) NOT NULL DEFAULT 'publicado',
    criado_em DATETIME NOT NULL DEFAULT NOW(),
    atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    PRIMARY KEY (id),

    -- índice único do slug — GET /posts/:slug em O(log n)
    -- sem esse índice cada acesso a um post faz full scan
    UNIQUE KEY uq_post_slug (post_slug),

    -- índice composto do feed público
    -- WHERE status = 'publicado' ORDER BY criado_em DESC
    -- sem esse índice: full scan em milhões de posts por requisição de feed
    -- com esse índice: O(log n) direto nos publicados mais recentes
    KEY idx_feed (status, criado_em DESC),

    -- índice de posts por autor — página de perfil
    -- WHERE fk_usuario_id = ? AND status = 'publicado'
    KEY idx_autor (fk_usuario_id, status),

    -- FULLTEXT nas duas colunas de texto — busca sem Elasticsearch
    -- MATCH(titulo, texto_curto, texto_longo) AGAINST(?)
    -- suficiente pra milhões de posts antes de precisar de search dedicado


    FULLTEXT KEY  ft_busca (titulo, texto_curto, texto_longo),

                FOREIGN KEY   (fk_usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
);


-- desnormalização de nível 2 — estatísticas GLOBAIS da plataforma
-- tabela com uma única linha — o painel de controle do Comentaaê
-- atualizada por Stored Procedures a cada evento relevante
-- leitura em O(1) independente do volume de dados
CREATE TABLE estatisticas_site (
    id INT UNSIGNED NOT NULL DEFAULT 1,
    total_usuarios INT UNSIGNED NOT NULL DEFAULT 0,
    total_posts INT UNSIGNED NOT NULL DEFAULT 0,
    atualizado_em DATETIME NOT NULL DEFAULT NOW() ON UPDATE NOW(),
    PRIMARY KEY (id),
    CONSTRAINT chk_unico CHECK (id = 1)
);

-- linha única — inserida na criação do banco
-- INSERT IGNORE evita erro se executado mais de uma vez
INSERT IGNORE INTO estatisticas_site (id) VALUES (1);