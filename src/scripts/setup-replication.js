// src/scripts/setup-replication.js
// ─────────────────────────────────────────────────────────────
// Configura a replicação entre mysql_master e mysql_replica
// Executa UMA ÚNICA VEZ — na primeira vez que o ambiente sobe
// Idempotente — pode ser executado novamente sem quebrar nada
// ─────────────────────────────────────────────────────────────

import mysql from "mysql2/promise";

async function configurarReplicacao() {
    console.log("[replicacao] iniciando configuração Master/Replica via SSL...");

    // ── CONFIGURAÇÃO SSL (TLS Padrão) ─────────────────────────────
    // rejectUnauthorized: false -> Cria o túnel criptografado seguro,
    // mas não tenta validar a cadeia de certificados autoassinados nem envia cert de cliente.
    const sslConfig = {
        rejectUnauthorized: false,
    };

    // ── Conexão no Master como root ──────────────────────────────
    const master = await mysql.createConnection({
        host: process.env.DB_HOST_MASTER,
        port: process.env.DB_PORT,
        user: "root",
        password: process.env.DB_ROOT_PASSWORD,
        ssl: sslConfig,
        multipleStatements: true,
    });

    console.log("[replicacao] conectado ao Master");

    await master.query(`
        CREATE USER IF NOT EXISTS ${mysql.escape("replicador")}@'%' IDENTIFIED BY ${mysql.escape(process.env.DB_PASSWORD)};
        GRANT REPLICATION SLAVE ON *.* TO ${mysql.escape("replicador")}@'%';
        FLUSH PRIVILEGES;
    `);

    const [statusMaster] = await master.query("SHOW MASTER STATUS");
    const binlogFile = statusMaster[0].File;
    const binlogPosition = statusMaster[0].Position;

    await master.end();

    // ── Conexão na Replica como root ──────────────────────────────
    const replica = await mysql.createConnection({
        host: process.env.DB_HOST_REPLICA,
        port: process.env.DB_PORT,
        user: "root",
        password: process.env.DB_ROOT_PASSWORD,
        ssl: sslConfig,
    });

    await replica.query("STOP REPLICA");

    // ── Configura a fonte de replicação (COM SSL) ─────────────────
    // Didática: Além de SOURCE_SSL=1, informamos os caminhos dos certs
    // para que o nó Replica consiga falar com o Master de forma segura.
    // ── Configura a fonte de replicação (COM TLS PADRÃO) ──────────
    await replica.query(`
        CHANGE REPLICATION SOURCE TO
            SOURCE_HOST = ${mysql.escape(process.env.DB_HOST_MASTER)},
            SOURCE_USER = ${mysql.escape("replicador")},
            SOURCE_PASSWORD = ${mysql.escape(process.env.DB_PASSWORD)},
            SOURCE_LOG_FILE = ${mysql.escape(binlogFile)},
            SOURCE_LOG_POS = ${binlogPosition},
            SOURCE_SSL = 1
    `);

    await replica.query("START REPLICA");
    await new Promise((r) => setTimeout(r, 2000));

    const [statusFinal] = await replica.query("SHOW REPLICA STATUS");
    if (statusFinal[0].Slave_IO_Running === "Yes" && statusFinal[0].Slave_SQL_Running === "Yes") {
        console.log("[replicacao] replicação funcionando via SSL");
    } else {
        console.error("[replicacao] ERRO na replicação");
        process.exit(1);
    }

    await replica.end();
    process.exit(0);
}

configurarReplicacao().catch((err) => {
    console.error("[replicacao] ERRO fatal:", err.message);
    process.exit(1);
});
