# Dockerfile
# imagem base oficial do Node.js com Alpine Linux
# Alpine = distribuição Linux mínima — ~5MB em vez de ~180MB do Ubuntu
# node:24-alpine = Node.js versão 24 LTS — versão estável de produção
# suporte garantido até abril de 2028 — seguro para o Comentaaê escalar
# é o mesmo padrão que o Reddit e o Instagram usam pra servir Node.js
FROM node:24-alpine

# define a pasta de trabalho dentro do container
# todos os comandos seguintes executam a partir dessa pasta
# /app é a convenção universal — o mesmo que o GitHub Actions usa
WORKDIR /app

# copia APENAS o package.json antes do restante do código
# estratégia de cache de layer — a mais importante do Dockerfile
# se o package.json não mudou, o Docker reutiliza a layer do npm install
# sem reconstruir 300MB de node_modules a cada deploy
# o Instagram usa exatamente essa estratégia pra manter deploys rápidos
COPY package.json ./

# RUN com BuildKit cache mount — o mais importante do Dockerfile
# --mount=type=cache: cria um volume de cache persistente no disco do host
# target=/root/.npm: aponta pro diretório de cache do npm dentro do container
# quando package.json muda e você rebuilda:
#   SEM cache mount: npm baixa todos os pacotes do zero — ~40 segundos
#   COM cache mount: npm encontra pacotes anteriores no cache — ~5 segundos
#   só os pacotes novos ou atualizados são baixados da internet
# é o mesmo princípio que o Facebook usa no Buck — cachear o máximo possível
# entre builds pra que deploys sejam cirúrgicos e rápidos
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev

# copia o restante do código DEPOIS do npm install
# ordem estratégica — mudança no código não invalida a layer do npm install
# só invalida essas layer e as seguintes — as anteriores vêm do cache
# deploy típico: layer do npm install em cache = build em segundos
COPY . .

# documenta que o container usa a porta 3000
# EXPOSE não abre a porta pra internet — é só documentação interna
# quem abre a porta é o docker-compose.yml com ports:
EXPOSE 3000

# executa migrations ANTES de subir o servidor
# && garante que o servidor só sobe se todas as migrations passarem
# se migrate.js encerrar com código 1 (falha) → node server.js não executa
CMD ["sh", "-c", "node src/scripts/migrate.js && node server.js"]


