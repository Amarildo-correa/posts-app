// server.js
// variáveis de ambiente injetadas pelo Docker via docker-compose.yml
// dotenv não é necessário — o Docker já faz esse trabalho

import express from "express";
import { poolEscrita, poolLeitura } from "./src/config/database.js";

const app = express();
const PORT = process.env.PORT || 3000;

// health check — verifica se os dois bancos estão respondendo em tempo real
app.get("/health", async (req, res) => {
    try {
        await poolEscrita.execute("SELECT 1");
        await poolLeitura.execute("SELECT 1");
        res.json({ status: "ok", master: "conectado (SSL)", replica: "conectado (SSL)" });
    } catch (erro) {
        res.status(500).json({ status: "erro", mensagem: erro.message });
    }
});

app.get("/", (req, res) => {
    res.send("Comentaaê rodando em rede segura (Zero Trust)!");
});

app.listen(PORT, () => {
    console.log(`[server] rodando na porta ${PORT}`);
    console.log(`[server] Conexões Master/Replica protegidas por TLS`);
});
