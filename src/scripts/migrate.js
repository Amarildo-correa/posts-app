// src/scripts/migrate.js
// ─────────────────────────────────────────────────────────────
// migrate.js conecta SEMPRE no Master
// migrations são operações de escrita — CREATE TABLE, INSERT, ALTER
// a Replica recebe essas mudanças automaticamente via replicação
// nunca conecte o migrate.js na Replica — read_only bloquearia tudo
// ─────────────────────────────────────────────────────────────

import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function executarMigrations() {
    console.log("[migrate] iniciando processo de migração...");

    // ── CONFIGURAÇÃO SSL (TLS Padrão) ─────────────────────────────
    // rejectUnauthorized: false -> Cria o túnel criptografado seguro,
    // mas não tenta validar a cadeia de certificados autoassinados nem envia cert de cliente.
    const sslConfig = {
        rejectUnauthorized: false,
    };

    // ETAPA 1 — conecta no banco Master
    const conexao = await mysql.createConnection({
        host: process.env.DB_HOST_MASTER,
        port: process.env.DB_PORT,
        user: "root",
        password: process.env.DB_ROOT_PASSWORD,
        database: process.env.DB_NAME,
        ssl: sslConfig, // Didática: Migração segura via SSL
        multipleStatements: true,
    });

    console.log("[migrate] conectado ao Master");

    // ETAPA 2 — busca os arquivos .sql na pasta migrations
    const pastaMigrations = path.resolve(__dirname, "../../migrations");
    const arquivos = fs.readdirSync(pastaMigrations).filter((f) => f.endsWith(".sql"));

    // ETAPA 3 — executa cada arquivo em ordem alfabética
    for (const arquivo of arquivos.sort()) {
        console.log(`[migrate] executando: ${arquivo}`);
        const sql = fs.readFileSync(path.join(pastaMigrations, arquivo), "utf-8");
        await conexao.query(sql);
    }

    await conexao.end();
    console.log("[migrate] todas as migrations concluídas");
    process.exit(0);
}

executarMigrations().catch((erro) => {
    console.error("[migrate] ERRO:", erro.message);
    process.exit(1);
});
