# GitHub Actions Workflows

Este diretório contém os workflows para deploy automático da aplicação UrbanSend.

## 📁 Arquivos

- **`deploy.yml`**: Workflow principal com todos os passos inline
- **`deploy-v2.yml`**: Workflow otimizado que usa script externo
- **`README.md`**: Este arquivo

## 🔧 Como Usar

### Automatic Deploy (Recomendado)

O deploy acontece automaticamente quando você:
1. Faz push para branch `main` ou `master`
2. Executa manualmente via GitHub Actions UI

### Manual Trigger

1. Vá para **Actions** no GitHub
2. Selecione "Deploy to VPS" ou "Deploy to VPS v2"  
3. Clique em "Run workflow"
4. Selecione a branch
5. Clique em "Run workflow"

## ⚠️ Requisitos

- Secret `VPS_PASSWORD` deve estar configurado no repositório
- VPS deve estar acessível em `72.60.10.112`
- Usuário `root` deve ter permissões adequadas

## 🚀 O que o Deploy faz

1. **Build & Test**:
   - Instala dependências
   - Executa TypeScript typecheck
   - Build do frontend e backend

2. **Deploy**:
   - Conecta na VPS via SSH
   - Copia arquivos compilados
   - Instala Docker se necessário
   - Configura ambiente de produção
   - Inicia aplicação com Docker Compose
   - Executa migrações do banco

3. **Verification**:
   - Verifica se containers estão rodando
   - Testa endpoint de health check

## 🔍 Status

Após o deploy, a aplicação estará disponível em:
- Frontend: http://72.60.10.112:3011
- Backend: http://72.60.10.112:3010
- Redis UI: http://72.60.10.112:8082

## 🔧 Troubleshooting

Se o deploy falhar:
1. Verifique os logs no GitHub Actions
2. Confirme se o secret `VPS_PASSWORD` está correto
3. Teste conexão SSH manualmente
4. Verifique se as portas estão liberadas na VPS