// src/scripts/migrate.js
// ─────────────────────────────────────────────────────────────
// migrate.js conecta SEMPRE no Master
// migrations são operações de escrita — CREATE TABLE, INSERT, ALTER
// a Replica recebe essas mudanças automaticamente via replicação
// nunca conecte o migrate.js na Replica — read_only bloquearia tudo
// ─────────────────────────────────────────────────────────────

// fs — módulo nativo do Node.js para operações de sistema de arquivos
// lê a pasta migrations/ e os arquivos .sql sem dependência externa
import fs from "fs";

// path — módulo nativo do Node.js para manipulação de caminhos
// resolve caminhos relativos corretamente em qualquer sistema operacional
// evita problemas com barras invertidas no Windows vs Linux do container
import path from "path";

// fileURLToPath — necessário para recriar __dirname em ES Modules
// __dirname não existe mais no escopo global de ES Modules
// no CommonJS o Node.js injetava automaticamente — aqui reconstruímos manualmente
// razão: ES Modules é o padrão do browser — no browser não existe conceito de diretório
import { fileURLToPath } from "url";

// mysql2/promise — driver MySQL com suporte a async/await
// a versão /promise retorna Promises em vez de callbacks
// permite usar await nas queries — código legível e sem callback hell
import mysql from "mysql2/promise";

// dotenv/config — importa e configura em uma linha — padrão ES Modules
// equivalente ao require('dotenv').config() do CommonJS
// injeta as variáveis do .env no process.env automaticamente
// necessário porque esse script roda antes do server.js
// sem isso process.env.DB_HOST seria undefined
import "dotenv/config";

// ─────────────────────────────────────────────────────────────
// RECRIA __dirname — não existe nativamente em ES Modules
// import.meta.url retorna a URL do arquivo atual
// ex: file:///app/src/scripts/migrate.js
// fileURLToPath converte URL pra caminho do sistema: /app/src/scripts/migrate.js
// path.dirname pega só o diretório: /app/src/scripts
// ─────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────
// FUNÇÃO PRINCIPAL — executa todas as migrations pendentes
// async porque todas as operações de banco são assíncronas
// await garante que cada etapa termina antes da próxima começar
// ─────────────────────────────────────────────────────────────
async function executarMigrations() {
    // conexão direta no Master — migrations são escrita
    // a Replica recebe as mudanças automaticamente via binary log
    const conexao = await mysql.createConnection({
        host: process.env.DB_HOST_MASTER, // mysql_posts — hostname interno Docker
        port: process.env.DB_PORT, // 3306 — porta interna do MySQL
        database: process.env.DB_NAME, // posts_app_db — banco do projeto
        user: process.env.DB_USER, // usuário do banco — vem do .env
        password: process.env.DB_PASSWORD, // senha do banco — vem do .env

        // multipleStatements permite executar múltiplos SQL separados por ;
        // necessário porque os arquivos .sql têm vários CREATE TABLE juntos
        // o Reddit usa essa flag nos scripts de migration internamente
        multipleStatements: true,
    });

    console.log("[migrate] conectado ao Master");

    // ─────────────────────────────────────────────────────────────
    // ETAPA 1 — cria a tabela de controle se ainda não existir
    // IF NOT EXISTS garante que não quebra se já existir
    // essa tabela é o coração do sistema — guarda o histórico de migrations
    // ─────────────────────────────────────────────────────────────
    await conexao.execute(`CREATE TABLE IF NOT EXISTS migrations_executadas (
                            arquivo      VARCHAR(255) NOT NULL,
                            executado_em DATETIME     NOT NULL DEFAULT NOW(),
                            PRIMARY KEY  (arquivo)
    )
  `);

    console.log("[migrate] tabela migrations_executadas verificada");

    // ─────────────────────────────────────────────────────────────
    // ETAPA 2 — consulta quais migrations já foram executadas
    // retorna um Set para busca em O(1) — mais eficiente que Array.includes
    // em projetos com centenas de migrations a diferença é perceptível
    // ─────────────────────────────────────────────────────────────
    const [linhas] = await conexao.execute("SELECT arquivo FROM migrations_executadas");

    // converte o array de objetos em Set de strings
    // Set tem busca em O(1) — independente do tamanho da coleção
    // é o mesmo princípio que o Redis usa para verificação de membership
    const jaExecutadas = new Set(linhas.map((l) => l.arquivo));

    console.log(`[migrate] ${jaExecutadas.size} migration(s) já executada(s)`);

    // ─────────────────────────────────────────────────────────────
    // ETAPA 3 — lê e filtra os arquivos da pasta migrations/ por ambiente
    // a convenção de nomenclatura define quais arquivos executam onde:
    //   sem prefixo   → estrutura pura — executa em TODOS os ambientes
    //   prefixo local_ → dados fictícios — executa SÓ na máquina local
    // é o mesmo padrão de separação de artefatos por contexto
    // que o Facebook usa no sistema interno de build Buck
    // ─────────────────────────────────────────────────────────────
    const pastaMigrations = path.resolve(__dirname, "..", "..", "migrations");

    // verifica o ambiente atual injetado pelo docker-compose.yml (docker-compose.yml)
    // NODE_ENV=development → docker-compose.override.yml (docker-compose.yml)
    // NODE_ENV=production  → docker-compose.prod.yml (docker-compose.yml)
    // essa variável é a fonte da verdade do ambiente — nunca hardcode
    const emProducao = process.env.NODE_ENV === "production";

    // log do ambiente detectado — visibilidade total no terminal
    // você vê exatamente em qual contexto o migrate.js está rodando
    // evita confusão entre ambientes — problema clássico em times grandes
    console.log(`[migrate] ambiente detectado: ${emProducao ? "produção" : "local"}`);

    const arquivos = fs
        .readdirSync(pastaMigrations)

        // filtra a lista de arquivos conforme o ambiente atual
        .filter((arquivo) => {
            // descarta qualquer arquivo que não seja .sql
            // garante que README.md ou outros arquivos na pasta não quebram o sistema
            if (!arquivo.endsWith(".sql")) return false;

            // REGRA CENTRAL DA CONVENÇÃO:
            // arquivos com prefixo local_ contêm dados fictícios de teste
            // eles NUNCA devem executar em produção no Vultr
            // apenas na máquina local do desenvolvedor
            //
            // exemplo de arquivo filtrado em produção:
            // local_002_seed_inicial.sql → filtrado quando NODE_ENV=production
            // o banco de produção nunca recebe registros fictícios
            //
            // exemplo de arquivo que passa em produção:
            // 001_criar_tabelas.sql → sem prefixo local_ → executa em todos os ambientes
            // 003_add_coluna_avatar.sql → sem prefixo → executa em todos os ambientes
            if (emProducao && arquivo.startsWith("local_")) {
                console.log(`[migrate] ✗ ${arquivo} — ignorado em produção (prefixo local_)`);
                return false;
            }

            // em ambiente local: todos os arquivos passam
            // estrutura de tabelas + dados fictícios de seed
            return true;
        })

        // sort() garante ordem de execução numérica correta
        // 001 executa antes de 002 — sempre
        // sem sort() o filesystem pode retornar em ordem arbitrária
        // executar migrations fora de ordem quebra chaves estrangeiras
        // exemplo: local_002_seed.sql antes de 001_criar_tabelas.sql
        // causaria erro — tabela ainda não existe
        .sort();

    console.log(`[migrate] ${arquivos.length} arquivo(s) selecionado(s)`);

    // ─────────────────────────────────────────────────────────────
    // ETAPA 4 — executa apenas as migrations pendentes em ordem
    // ─────────────────────────────────────────────────────────────
    for (const arquivo of arquivos) {
        // remove a extensão .sql para comparar com o registro na tabela
        // "001_criar_tabelas.sql" vira "001_criar_tabelas"
        const nome = arquivo.replace(".sql", "");

        // verifica se já foi executada — busca em O(1) no Set
        // se já está no histórico, pula sem executar
        if (jaExecutadas.has(nome)) {
            console.log(`[migrate] ✓ ${nome} — já executada, pulando`);
            continue;
        }

        // lê o conteúdo do arquivo .sql como string UTF-8
        // readFileSync é síncrono — adequado aqui porque estamos dentro de um for
        // em scripts de migration não há problema em bloquear — é um processo único
        const sql = fs.readFileSync(path.join(pastaMigrations, arquivo), "utf8");

        console.log(`[migrate] → executando ${nome}...`);

        // executa o SQL do arquivo no banco
        // multipleStatements permite múltiplos CREATE TABLE no mesmo arquivo
        // se falhar, o catch abaixo captura e encerra o processo com erro
        await conexao.execute(sql);

        // registra a migration como executada na tabela de controle
        // INSERT simples — arquivo é a PK, executado_em é gerado pelo DEFAULT NOW()
        // se o INSERT falhar após o SQL executar, o arquivo fica sem registro
        // na próxima execução ele rodaria de novo — por isso o SQL deve ser idempotente
        await conexao.execute("INSERT INTO migrations_executadas (arquivo) VALUES (?)", [nome]);

        console.log(`[migrate] ✓ ${nome} — executada com sucesso`);
    }

    // ─────────────────────────────────────────────────────────────
    // ETAPA 5 — encerra a conexão e o processo
    // encerrar explicitamente libera o recurso imediatamente
    // sem isso o processo Node.js ficaria aguardando o timeout do MySQL
    // ─────────────────────────────────────────────────────────────
    await conexao.end();

    console.log("[migrate] todas as migrations concluídas — servidor pode subir");

    // process.exit(0) — código 0 significa sucesso
    // o Docker interpreta código 0 como "processo concluído com sucesso"
    // o CMD do Dockerfile só executa se esse processo encerrar com 0
    process.exit(0);
}

// ─────────────────────────────────────────────────────────────
// EXECUÇÃO — chama a função principal e captura qualquer erro
// erros não capturados em scripts Node.js encerram silenciosamente
// aqui capturamos explicitamente para logar e encerrar com código 1
// código 1 sinaliza falha — o Docker não sobe o servidor em caso de falha
// é o mesmo padrão de exit codes que o GitHub Actions usa nos pipelines
// ─────────────────────────────────────────────────────────────
executarMigrations().catch((erro) => {
    console.error("[migrate] ERRO:", erro.message);

    // process.exit(1) — código 1 significa falha
    // o Docker interpreta código 1 como "processo falhou"
    // o servidor Node.js não sobe — banco está em estado inconsistente
    // você precisa corrigir o erro e fazer o deploy novamente
    process.exit(1);
});
