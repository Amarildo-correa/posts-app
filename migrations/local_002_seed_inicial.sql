-- 1. Criar o Usuário com ID 1 explicitamente
INSERT INTO usuarios (id, email, senha_hash) 
VALUES (1, 'dev@lab-arquitetura.com', '$2b$12$hash_simulado_senior_123');

-- 2. Criar o Perfil vinculado ao ID 1
INSERT INTO perfis (fk_usuario_id, nome, nome_slug) 
VALUES (1, 'Dev Local Master', 'dev-local-master');

-- 3. Criar Posts vinculados ao ID 1
INSERT INTO posts (fk_usuario_id, titulo, texto, post_slug, status) 
VALUES 
(1, 'Primeiro Post do Lab', 'Testando a persistência no MySQL Master.', 'primeiro-post-lab', 'publicado'),
(1, 'Teste de Replicação', 'Verificando se este dado chegará na réplica via rede.', 'teste-de-replicacao', 'publicado');

-- 4. Sincronizar a tabela de estatísticas
-- O ID 1 já existe pelo INSERT IGNORE do seu script anterior
UPDATE estatisticas_site 
SET total_usuarios = 1, 
    total_posts = 2 
WHERE id = 1;