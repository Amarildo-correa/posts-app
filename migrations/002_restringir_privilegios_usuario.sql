-- migrations/002_restringir_privilegios_usuario.sql
-- ─────────────────────────────────────────────────────────────
-- Aplica o princípio de menor privilégio ao posts_user
-- O Docker Compose cria o usuário via tabela interna mysql.db
-- nenhum REVOKE padrão alcança esse grant — precisa deletar direto
-- DELETE FROM mysql.db remove o registro na fonte
-- padrão aplicado pelo Facebook em todos os usuários de serviço
-- ─────────────────────────────────────────────────────────────

-- remove o grant interno criado pelo Docker Compose via mysql.db
-- REVOKE padrão não alcança esse registro — vive numa tabela interna
DELETE FROM mysql.db WHERE user = 'posts_user' AND host = '%';

-- concede apenas as 4 operações de runtime que o Node.js precisa
-- SELECT → feed, perfil, post individual, busca
-- INSERT → novo post, cadastro, comentário
-- UPDATE → editar post, atualizar perfil, pontuação
-- DELETE → remover post, remover conta
GRANT SELECT, INSERT, UPDATE, DELETE ON posts_app_db.* TO 'posts_user'@'%';

-- aplica imediatamente — sem isso o MySQL mantém cache de privilégios antigo
FLUSH PRIVILEGES;