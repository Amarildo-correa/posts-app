// src/scripts/setup-replication.js
// ─────────────────────────────────────────────────────────────
// Configura a replicação entre mysql_master e mysql_replica
// Executa UMA ÚNICA VEZ — na primeira vez que o ambiente sobe
// Idempotente — pode ser executado novamente sem quebrar nada
// É o mesmo padrão de setup único que o Instagram usa
// pra configurar topologias de replicação em novos datacenters
// ─────────────────────────────────────────────────────────────

import mysql from "mysql2/promise";

async function configurarReplicacao() {
    console.log("[replicacao] iniciando configuração Master/Replica...");

    // ── Conexão no Master como root ──────────────────────────────
    // root porque precisamos criar usuário e conceder privilégios
    // operação administrativa — não usa o usuário da aplicação
    // após o setup, o usuário de replicação tem só REPLICATION SLAVE
    const master = await mysql.createConnection({
        host: process.env.DB_HOST_MASTER,
        port: process.env.DB_PORT,
        user: "root",
        password: process.env.DB_ROOT_PASSWORD,
        multipleStatements: true,
    });

    console.log("[replicacao] conectado ao Master");

    // ── Cria usuário de replicação no Master ──────────────────────
    // CREATE USER e GRANT são comandos DDL — o MySQL não aceita
    // placeholders ? nesses comandos — diferente de SELECT e INSERT
    // mysql.escape() sanitiza os valores antes de interpolar na query
    // protege contra SQL injection mesmo sem usar placeholders
    // é o mesmo padrão que o Facebook usa em scripts administrativos
    const usuarioEscapado = mysql.escape(process.env.REPLICATION_USER);
    const senhaEscapada = mysql.escape(process.env.REPLICATION_PASSWORD);

    // IF NOT EXISTS — idempotente — não quebra se já existir
    // o usuário de replicação tem o menor privilégio possível
    // REPLICATION SLAVE: só permite que a Replica leia o binary log
    // nunca tem acesso às tabelas — princípio do menor privilégio
    await master.query(`
    CREATE USER IF NOT EXISTS ${usuarioEscapado}@'%'
    IDENTIFIED BY ${senhaEscapada}
  `);

    // concede APENAS o privilégio de replicação — zero acesso a dados
    await master.query(`
    GRANT REPLICATION SLAVE ON *.* TO ${usuarioEscapado}@'%'
  `);

    // aplica os privilégios imediatamente sem reiniciar o MySQL
    await master.query(`FLUSH PRIVILEGES`);

    console.log("[replicacao] usuário de replicação criado no Master");

    // ── Lê a posição atual do binary log ──────────────────────────
    // SHOW MASTER STATUS retorna o arquivo e posição atual do binary log
    // a Replica precisa dessas informações para saber de onde começar a ler
    // é o equivalente do HEAD do Git — de qual commit a Replica começa
    const [masterStatus] = await master.query("SHOW MASTER STATUS");
    const { File: binlogFile, Position: binlogPosition } = masterStatus[0];

    console.log(`[replicacao] posição atual do Master: ${binlogFile}:${binlogPosition}`);

    await master.end();

    // ── Conexão na Replica como root ──────────────────────────────
    // configurar a Replica também requer privilégio administrativo
    const replica = await mysql.createConnection({
        host: process.env.DB_HOST_REPLICA,
        port: process.env.DB_PORT,
        user: "root",
        password: process.env.DB_ROOT_PASSWORD,
        multipleStatements: true,
    });

    console.log("[replicacao] conectado à Replica");

    // ── Verifica se a Replica já está configurada ──────────────────
    // SHOW REPLICA STATUS retorna o estado atual da replicação
    // se Slave_IO_Running = Yes, a Replica já está sincronizando
    // idempotência — não reconfigura o que já está funcionando
    const [replicaStatus] = await replica.query("SHOW REPLICA STATUS");

    if (replicaStatus.length > 0 && replicaStatus[0].Slave_IO_Running === "Yes") {
        console.log("[replicacao] Replica já está configurada e sincronizando — pulando");
        await replica.end();
        process.exit(0);
    }

    // ── Para a Replica antes de reconfigurar ──────────────────────
    // STOP REPLICA — para os threads IO e SQL antes de mudar a configuração
    // reconfigurar uma Replica em execução causa inconsistência de dados
    await replica.query("STOP REPLICA");

    // ── Aponta a Replica para o Master ────────────────────────────
    // CHANGE REPLICATION SOURCE aceita placeholders ? normalmente
    // é um comando de configuração — não DDL como CREATE USER
    // SOURCE_HOST: onde o Master está — hostname interno Docker
    // SOURCE_USER: usuário com REPLICATION SLAVE — o que criamos acima
    // SOURCE_LOG_FILE: arquivo do binary log onde começar a ler
    // SOURCE_LOG_POS: posição exata dentro do arquivo
    // a Replica vai ler todos os eventos a partir dessa posição
    // é o equivalente do git clone + checkout de um commit específico
    await replica.execute(
        `
    CHANGE REPLICATION SOURCE TO
      SOURCE_HOST     = ?,
      SOURCE_USER     = ?,
      SOURCE_PASSWORD = ?,
      SOURCE_LOG_FILE = ?,
      SOURCE_LOG_POS  = ?
  `,
        [process.env.DB_HOST_MASTER, process.env.REPLICATION_USER, process.env.REPLICATION_PASSWORD, binlogFile, binlogPosition],
    );

    // ── Inicia a replicação ────────────────────────────────────────
    // START REPLICA — inicia os threads IO e SQL
    // IO Thread: começa a baixar eventos do binary log do Master
    // SQL Thread: começa a aplicar esses eventos no banco da Replica
    // a partir daqui os dois bancos ficam sincronizados automaticamente
    await replica.query("START REPLICA");

    // ── Confirma que a replicação está funcionando ────────────────
    // aguarda 2 segundos para os threads inicializarem
    // em produção o Reddit usa um loop com retry pra essa verificação
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const [statusFinal] = await replica.query("SHOW REPLICA STATUS");

    if (statusFinal[0].Slave_IO_Running === "Yes" && statusFinal[0].Slave_SQL_Running === "Yes") {
        console.log("[replicacao] replicação funcionando — IO e SQL threads ativos");
    } else {
        console.error("[replicacao] ERRO — threads de replicação não iniciaram");
        console.error("[replicacao] IO Thread:", statusFinal[0].Slave_IO_Running);
        console.error("[replicacao] SQL Thread:", statusFinal[0].Slave_SQL_Running);
        process.exit(1);
    }

    await replica.end();

    console.log("[replicacao] configuração concluída com sucesso");
    process.exit(0);
}

configurarReplicacao().catch((erro) => {
    console.error("[replicacao] ERRO fatal:", erro.message);
    process.exit(1);
});
