# Deploy AuditOps no Coolify

Use Docker Compose da raiz do repositório. Este pacote guarda o código em `auditops-source.zip` porque o envio pela interface web do GitHub pode não aceitar pastas. Durante o build, o Dockerfile extrai e compila o código.

Defina `AUDITOPS_MASTER_PASSWORD` e `TUNNEL_TOKEN` como segredos no Coolify antes de fazer Deploy. O Cloudflare Tunnel deve encaminhar `auditops.tkmsys.com.br` para `http://auditops:3000`. O volume `auditops_data` conserva SQLite, backups e a chave OTP. Não o remova ao atualizar.

O build precisa de rede para instalar dependências npm e baixar o pacote SheetJS de `cdn.sheetjs.com`.
