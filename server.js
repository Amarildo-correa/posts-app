// ── IMPORTS — sempre no topo em ES Modules ───────────────────
// o Node.js processa todos os imports antes de qualquer linha executável
// espalhar imports pelo arquivo é anti-padrão em qualquer codebase de escala
import express from "express";
import { engine } from "express-handlebars"; // importação que estava faltando
import path from "path";
import { fileURLToPath } from "url";
import { poolEscrita, poolLeitura } from "./src/config/database.js";

// ── RECONSTRUÇÃO DO __dirname — logo após os imports ─────────
// __dirname não existe em ES Modules — precisa ser reconstruído
// feito aqui no topo porque express.static() depende dele
// se ficar no meio do arquivo, o leitor não sabe onde __dirname foi definido
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── INICIALIZAÇÃO DO APP ──────────────────────────────────────
// express() cria a instância da aplicação
// PORT vem do Docker via variável de ambiente — sem dotenv
// o mesmo container roda em dev (3000) e produção (3000) sem alterar código
const app = express();
const PORT = process.env.PORT || 3000;

// ── 1. CONFIGURAÇÃO DA VIEW ENGINE ───────────────────────────
// registrado antes de qualquer rota — o Express precisa saber
// qual engine usar antes de receber qualquer res.render()
// se registrar depois de uma rota que chama res.render(), a engine
// ainda não existia quando a rota foi declarada — bug silencioso
app.engine(
    "hbs",
    engine({
        // extensão dos templates — padrão do projeto
        extname: ".hbs",

        // layout padrão — shell HTML que envolve todas as páginas
        // o Reddit usa o mesmo padrão — estrutura fixa, conteúdo variável
        defaultLayout: "main",

        // pasta dos layouts — Express procura aqui primeiro
        layoutsDir: "views/layouts/",

        // partials são componentes reutilizáveis — header, post-card, footer
        // é o equivalente ao sistema de componentes do Instagram e do Facebook
        partialsDir: "views/partials/",
    }),
);

// define hbs como engine padrão — sem isso res.render() não sabe o que usar
app.set("view engine", "hbs");

// define onde o Express procura os arquivos de view
// convenção universal — mesma estrutura do Medium e do Substack
app.set("views", "views");

// ── 2. ARQUIVOS ESTÁTICOS ─────────────────────────────────────
// registrado antes dos parsers e antes das rotas
// se uma requisição bate em /css/style.css, o Express retorna o arquivo
// e abandona o pipeline — os parsers abaixo nunca executam
// em produção o Nginx assume essa responsabilidade — o Express nunca chega
// a ver requisições de CSS, JS ou imagens
app.use(express.static(path.join(__dirname, "public")));

// ── 3. PARSERS DE REQUISIÇÃO ──────────────────────────────────
// registrados ANTES de qualquer rota — essa ordem é obrigatória
// o Express executa middlewares na sequência de registro
// se uma rota for declarada antes do parser, req.body chega undefined
// esse bug é silencioso — não lança erro, só quebra o comportamento

// interpreta application/x-www-form-urlencoded
// formulários HTML de cadastro e login chegam nesse formato
app.use(express.urlencoded({ extended: true }));

// interpreta application/json
// Fetch API do frontend envia JSON — curtidas, comentários, interações
app.use(express.json());

// ── 4. ROTAS ──────────────────────────────────────────────────
// somente após view engine, static e parsers estarem configurados
// qualquer rota declarada antes dos parsers não consegue ler req.body
// qualquer rota que chame res.render() antes da engine está em terreno instável

// rota de health check — Docker e monitoramento externo usam essa rota
// para saber se o container está operacional antes de rotear tráfego
// o mesmo padrão que o Facebook usa nos seus load balancers internos
app.get("/health", async (req, res) => {
    try {
        // query ultra leve — valida conectividade sem impacto no banco
        // SELECT 1 não lê nenhuma tabela real — só testa o pool de conexões
        await poolEscrita.execute("SELECT 1");
        await poolLeitura.execute("SELECT 1");

        // status 200 — container está saudável e pronto para receber tráfego
        res.json({
            status: "ok",
            master: "conectado (SSL)",
            replica: "conectado (SSL)",
        });
    } catch (erro) {
        // status 500 — Docker Compose marca o container como unhealthy
        // o orquestrador pode reiniciar automaticamente via restart: unless-stopped
        res.status(500).json({ status: "erro", mensagem: erro.message });
    }
});

// rota raiz — será substituída pelo feed SSR do Comentaaê
app.get("/", (req, res) => {
    res.send("Comentaaê rodando em rede segura (Zero Trust)!");
});

// ── 5. INICIALIZAÇÃO DO SERVIDOR ──────────────────────────────
// sempre a última linha — só sobe o servidor depois que toda a
// configuração acima foi registrada
// se o app.listen() viesse antes das rotas, o servidor aceitaria
// requisições antes de estar completamente configurado
app.listen(PORT, () => {
    console.log(`[server] rodando na porta ${PORT}`);
    console.log(`[server] Conexões Master/Replica protegidas por TLS`);
});
