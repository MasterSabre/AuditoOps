# AuditOps — upload pelo site do GitHub e deploy no Coolify

## Por que este pacote é diferente

O site do GitHub pode dificultar o envio de pastas pelo botão **Add file → Upload files**. Este pacote evita isso: o código completo está dentro de `auditops-source.zip`, um arquivo que pode ser enviado normalmente. O `Dockerfile` extrai esse arquivo durante o build e compila a aplicação.

## Enviar pelo navegador do GitHub

1. Extraia `AuditOps_GitHub_WebUpload_Coolify.zip` no Windows.
2. Abra o repositório `https://github.com/MasterSabre/AuditOps` e escolha **Add file → Upload files**.
3. Selecione os arquivos da pasta extraída: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.gitignore`, `.npmrc`, `.env.example`, `COOLIFY_DEPLOY.md`, `README_UPLOAD_WEB.md` e `auditops-source.zip`.
4. Faça commit na branch `main`.
5. Apague pelo site os arquivos antigos `AuditOps_Coolify_Pronto_Cloudflare_Tunnel (1).zip` e `ACESSO_MESTRE_INICIAL.txt` para não confundir versões.

**Não envie o ZIP externo inteiro.** Envie os arquivos extraídos e inclua o arquivo interno chamado `auditops-source.zip`.

## Coolify

- Recurso: **Docker Compose**, arquivo `/docker-compose.yml`.
- Antes do primeiro Deploy, configure os segredos `AUDITOPS_MASTER_PASSWORD` (senha temporária exclusiva com pelo menos 20 caracteres) e `TUNNEL_TOKEN` (token do Cloudflare Tunnel).
- O hostname público do tunnel deverá apontar para `http://auditops:3000` na rede do Compose; use `auditops.tkmsys.com.br`.
- O volume `auditops_data` persiste o banco SQL e a chave OTP. Não apague esse volume nas atualizações.

## Segurança

Não comite senhas reais, tokens, bancos SQLite, backups ou a chave de criptografia OTP. Este pacote não contém esses segredos nem um banco operacional.

## Verificação

O pacote tem os arquivos de deployment na raiz e o arquivo fonte compactado na raiz. A configuração foi inspecionada estruturalmente; um build real do Docker ainda precisa ser confirmado no Coolify.
