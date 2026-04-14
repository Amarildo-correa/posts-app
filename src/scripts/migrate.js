// src/scripts/migrate.js
// ─────────────────────────────────────────────────────────────
// migrate.js conecta SEMPRE no Master
// migrations são operações de escrita — CREATE TABLE, INSERT, ALTER
// a Replica recebe essas mudanças automaticamente via replicação
// ─────────────────────────────────────────────────────────────

import { fileURLToPath } from "url";
import path from "path"; // necessário para path.dirname() e path.resolve()
import fs from "fs"; // necessário para fs.readdirSync() e fs.readFileSync()
import mysql from "mysql2/promise";

// __dirname não existe em ES Modules — reconstruído via import.meta.url
// é o mesmo padrão que o Reddit usa em todos os scripts internos Node.js
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function executarMigrations() {
    console.log("[migrate] iniciando processo de migração...");

    // rejectUnauthorized: false — cria túnel TLS sem validar cert autoassinado
    // é o mesmo padrão do database.js — consistência entre todos os scripts
    const sslConfig = { rejectUnauthorized: false };

    // conecta no Master como root — migrations são sempre escrita
    // nunca conecte na Replica — read_only bloquearia qualquer CREATE TABLE
    const conexao = await mysql.createConnection({
        host: process.env.DB_HOST_MASTER,
        port: process.env.DB_PORT,
        user: "root",
        password: process.env.DB_ROOT_PASSWORD,
        database: process.env.DB_NAME,
        ssl: sslConfig,
        multipleStatements: true, // permite executar múltiplos statements por arquivo .sql
    });

    console.log("[migrate] conectado ao Master");

    // ── TABELA DE CONTROLE ────────────────────────────────────
    // sem essa tabela o migrate.js reexecuta tudo a cada restart
    // é o mesmo padrão do Flyway e do Liquibase — rastrear o que já rodou
    // IF NOT EXISTS = idempotente — pode rodar mil vezes sem efeito colateral
    await conexao.query(`
        CREATE TABLE IF NOT EXISTS migrations_executadas (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            arquivo VARCHAR(255) NOT NULL,
            executado_em DATETIME NOT NULL DEFAULT NOW(),
            PRIMARY KEY (id),
            UNIQUE KEY uq_arquivo (arquivo)
        )
    `);

    // ── LEITURA DOS ARQUIVOS .sql ─────────────────────────────
    const pastaMigrations = path.resolve(__dirname, "../../migrations");
    const todosArquivos = fs
        .readdirSync(pastaMigrations)
        .filter((f) => f.endsWith(".sql")) // só arquivos SQL
        .sort(); // ordem numérica garante sequência correta

    // ── FILTRO DE AMBIENTE ────────────────────────────────────
    // arquivos local_* são seeds de desenvolvimento — dados fictícios para testes
    // em produção esses dados nunca devem entrar no banco real
    // NODE_ENV=production é injetado pelo docker-compose.prod.yml
    const emProducao = process.env.NODE_ENV === "production";
    const arquivos = todosArquivos.filter((f) => {
        if (emProducao && f.startsWith("local_")) {
            console.log(`[migrate] ignorando em produção: ${f}`);
            return false; // descarta seeds locais em produção
        }
        return true;
    });

    // ── CONTROLE DE JÁ EXECUTADOS ────────────────────────────
    // busca quais migrations já rodaram nesse banco
    // permite que o container reinicie sem reexecutar o que já foi feito
    const [jaExecutados] = await conexao.query("SELECT arquivo FROM migrations_executadas");
    // transforma em Set para lookup O(1) — performance crítica com muitas migrations
    const executados = new Set(jaExecutados.map((r) => r.arquivo));

    // ── EXECUÇÃO INCREMENTAL ──────────────────────────────────
    for (const arquivo of arquivos) {
        // pula o que já foi executado — idempotência total
        if (executados.has(arquivo)) {
            console.log(`[migrate] já executado, pulando: ${arquivo}`);
            continue;
        }

        const sql = fs.readFileSync(path.join(pastaMigrations, arquivo), "utf-8").trim(); // .trim() remove espaços e quebras de linha extras

        // pula arquivos vazios — evita "Query was empty" do mysql2
        // local_002_seed_inicial.sql vazio não deve quebrar o boot
        if (!sql) {
            console.log(`[migrate] arquivo vazio, pulando: ${arquivo}`);
            continue;
        }

        console.log(`[migrate] executando: ${arquivo}`);
        await conexao.query(sql);

        // registra na tabela de controle APÓS execução com sucesso
        // se a query acima falhar, essa linha não executa — consistência garantida
        await conexao.query("INSERT INTO migrations_executadas (arquivo) VALUES (?)", [arquivo]);
    }

    await conexao.end();
    console.log("[migrate] todas as migrations concluídas");
    process.exit(0);
}

executarMigrations().catch((erro) => {
    console.error("[migrate] ERRO:", erro.message);
    process.exit(1);
});
