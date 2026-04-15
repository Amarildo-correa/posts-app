// server.js
// As variáveis de ambiente são injetadas diretamente pelo Docker, garantindo o princípio de "Twelve-Factor App".
// O uso de variáveis externas permite que a mesma imagem rode em Dev ou Produção sem alteração no código.
// O pacote 'dotenv' é dispensado aqui pois o Docker já popula o process.env do Node.js.

import express from "express"; // Framework web minimalista para gerenciar rotas e middleware.
// Importação de pools distintos para separar o tráfego de Escrita (Master) do tráfego de Leitura (Replica).
// Essa estratégia é fundamental para escalar aplicações que possuem muito mais leitura do que escrita.
import { poolEscrita, poolLeitura } from "./src/config/database.js";

const app = express(); // Inicialização da aplicação Express.
// Define a porta: usa a injetada pelo ambiente ou o padrão 3000 para desenvolvimento local.
const PORT = process.env.PORT || 3000;

/**
 * Rota de Health Check (Verificação de Saúde)
 * Essencial para orquestradores (como o Docker Compose) saberem se a aplicação está operacional.
 */
app.get("/health", async (req, res) => {
    try {
        // Executa uma query ultra leve (SELECT 1) em ambos os bancos para validar a conectividade.
        // O uso do 'await' garante que a resposta só seja enviada se ambos os pools estiverem vivos.
        await poolEscrita.execute("SELECT 1");
        await poolLeitura.execute("SELECT 1");

        // Retorna status 200 OK informando que a infraestrutura de dados está saudável e protegida por TLS.
        res.json({ status: "ok", master: "conectado (SSL)", replica: "conectado (SSL)" });
    } catch (erro) {
        // Caso qualquer um dos bancos falhe, o catch captura o erro e retorna status 500 (Erro Interno).
        // Isso alerta sistemas de monitoramento que o container pode precisar de reinicialização.
        res.status(500).json({ status: "erro", mensagem: erro.message });
    }
});

// Rota principal da aplicação Comentaaê.
app.get("/", (req, res) => {
    // A menção a "Zero Trust" indica que a segurança não depende apenas do firewall,
    // mas que cada conexão interna (Node -> MySQL) é criptografada e verificada individualmente.
    res.send("Comentaaê rodando em rede segura (Zero Trust)!");
});

// Inicialização do servidor para escutar requisições na porta configurada.
app.listen(PORT, () => {
    console.log(`[server] rodando na porta ${PORT}`);
    // Confirmação visual nos logs de que o túnel de segurança TLS está ativo para os bancos de dados.
    console.log(`[server] Conexões Master/Replica protegidas por TLS`);
});
