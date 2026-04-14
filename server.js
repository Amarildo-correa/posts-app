// server.js
// variáveis de ambiente injetadas pelo Docker via docker-compose.yml
// dotenv não é necessário — o Docker já faz esse trabalho

import express from "express";
import { poolEscrita, poolLeitura } from "./src/config/database.js";

const app = express();
const PORT = process.env.PORT || 3000;

// health check — verifica se os dois bancos estão respondendo em tempo real
// chamado por load balancers e sistemas de monitoramento continuamente
app.get("/health", async (req, res) => {
    try {
        await poolEscrita.execute("SELECT 1");
        await poolLeitura.execute("SELECT 1");
        res.json({ status: "ok", master: "conectado", replica: "conectado" });
    } catch (erro) {
        res.status(500).json({ status: "erro", mensagem: erro.message });
    }
});

app.get("/", (req, res) => {
    res.send("posts-app rodando — acesse /health para verificar os bancos");
});

app.listen(PORT, () => {
    console.log(`[server] rodando na porta ${PORT}`);
    console.log(`[server] Master:  ${process.env.DB_HOST_MASTER}`);
    console.log(`[server] Replica: ${process.env.DB_HOST_REPLICA}`);
});
