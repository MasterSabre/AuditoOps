# AuditOps

Plataforma full-stack de auditoria de estoque com calendário semanal, importação de planilhas Excel, indicadores, histórico SQL/SQLite, comparação entre auditorias, exportações PDF/Excel, permissões por usuário, OTP e rotinas de backup.

> **Importante para GitHub:** o conteúdo desta pasta deve ficar diretamente na raiz do repositório. Envie `src/`, `public/`, `package.json`, `Dockerfile`, `docker-compose.yml` e os demais arquivos desta pasta. Não envie apenas o ZIP dentro do repositório.

## Executar localmente

Requer Node.js 22.12 ou mais recente.

```bash
npm install
npm run dev
```

Para verificar o projeto:

```bash
npm test
npm run build
npm run lint
npm run format:check
```

`npm test` executa o build em `pretest` para gerar a árvore de rotas antes dos testes de roteamento.

## Primeiro acesso e credencial mestre

O login mestre inicial é a matrícula `5520991`. Antes de iniciar a primeira instalação, defina `AUDITOPS_MASTER_PASSWORD` no ambiente com uma senha temporária forte de 20 ou mais caracteres (o sistema aceita entre 12 e 128). No primeiro acesso, o AuditOps exige uma troca de senha. Não grave segredos no GitHub.

Se a variável não for fornecida em uma execução local, o servidor pode gerar uma senha aleatória e mostrá-la uma única vez no terminal. Para implantação pelo Coolify, o `docker-compose.yml` exige a variável para evitar que a credencial inicial apareça nos logs.

## Implantação no Coolify + Cloudflare Tunnel

Siga **[COOLIFY_DEPLOY.md](COOLIFY_DEPLOY.md)**. O Compose deste repositório executa a aplicação e o conector Cloudflare Tunnel no mesmo projeto/rede Docker. Não publica a porta interna na rede do servidor. Crie a rota pública `auditops.tkmsys.com.br` no painel do Cloudflare Tunnel apontando para `http://auditops:3000`.

Antes do primeiro deploy, defina como variáveis secretas do Coolify:

- `AUDITOPS_MASTER_PASSWORD` — senha temporária para bootstrap do usuário mestre.
- `TUNNEL_TOKEN` — token do Cloudflare Tunnel remoto.

O app usa o volume Docker nomeado `auditops_data`, montado em `/app/data`, para persistir o SQLite, os backups e a chave de criptografia OTP. **Não apague esse volume ao atualizar o código.** Guarde backups e a chave OTP em local seguro adicional.

## Dados e segurança

- Os bancos SQLite, backups, arquivos `.env` e chaves de autenticação não devem ser versionados.
- O `.gitignore` e o `.dockerignore` excluem dados/segredos locais e arquivos ZIP.
- O domínio raiz `tkmsys.com.br` fica livre para outros serviços; o AuditOps usa `auditops.tkmsys.com.br`.
- Cloudflare Tunnel cria uma conexão de saída; não é necessário abrir portas de entrada no roteador.
