// src/config/database.js
// ─────────────────────────────────────────────────────────────
// Dois pools MySQL — Master para escrita, Replica para leitura
// O Node.js nunca sabe qual banco físico está usando
// só conhece a responsabilidade: poolEscrita ou poolLeitura
// é o mesmo padrão de separação que o Reddit usa internamente
// ─────────────────────────────────────────────────────────────

import mysql from "mysql2/promise";

// ── CONFIGURAÇÃO SSL (TLS Padrão) ─────────────────────────────
// rejectUnauthorized: false -> Cria o túnel criptografado seguro,
// mas não tenta validar a cadeia de certificados autoassinados nem envia cert de cliente.
const sslConfig = {
    rejectUnauthorized: false,
};

// ── POOL DE ESCRITA → mysql_master ────────────────────────────
// recebe INSERT, UPDATE, DELETE — operações que modificam dados
// connectionLimit menor — escrita é 10% do tráfego
// mais conexões no Master = mais contenção de locks = mais lentidão
const poolEscrita = mysql.createPool({
    host: process.env.DB_HOST_MASTER, // mysql_master — hostname interno Docker
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: sslConfig, // Didática: Ativa encriptação total para o tráfego de escrita

    // 5 conexões simultâneas de escrita — suficiente pra 90% dos casos
    // escritas são sequenciais por design — raramente precisam de paralelismo
    connectionLimit: 5,

    // aguarda conexão disponível em vez de falhar — sem rejeição em picos
    waitForConnections: true,
    queueLimit: 0,
});

// ── POOL DE LEITURA → mysql_replica ──────────────────────────
// recebe SELECT — feed, perfil, post individual, busca
// connectionLimit maior — leitura é 90% do tráfego
// mais conexões = mais queries paralelas = menor latência no feed
const poolLeitura = mysql.createPool({
    host: process.env.DB_HOST_REPLICA, // mysql_replica — hostname interno Docker
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: sslConfig, // Didática: Ativa encriptação total para o tráfego de leitura

    // 20 conexões simultâneas — o feed do Comentaaê escala aqui
    connectionLimit: 20,
    waitForConnections: true,
    queueLimit: 0,
});

export { poolEscrita, poolLeitura };
