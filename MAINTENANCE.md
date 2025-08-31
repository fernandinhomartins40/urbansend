# UltraZend - Procedimentos de Manutenção

## Visão Geral

Este documento descreve os procedimentos de manutenção para o servidor UltraZend em produção. Todos os scripts estão localizados no diretório `/var/www/urbansend/scripts/`.

## Scripts Disponíveis

### 1. server-control.sh - Controle do Servidor
Script principal para gerenciamento seguro do servidor.

**Localização:** `/var/www/urbansend/scripts/server-control.sh`

**Comandos:**
```bash
# Iniciar aplicação
./server-control.sh start

# Parar aplicação com segurança
./server-control.sh stop

# Reiniciar aplicação
./server-control.sh restart

# Ver status da aplicação e portas
./server-control.sh status

# Verificação de saúde
./server-control.sh health

# Limpeza de portas
./server-control.sh cleanup

# Limpeza completa (para + limpa + inicia)
./server-control.sh full-cleanup
```

### 2. port-monitor.sh - Monitoramento de Portas
Monitora as portas críticas (25, 80, 443, 3001) e detecta conflitos.

**Localização:** `/var/www/urbansend/scripts/port-monitor.sh`

**Comandos:**
```bash
# Verificação única das portas
./port-monitor.sh monitor

# Limpar processos conflitantes
./port-monitor.sh cleanup

# Monitoramento contínuo (a cada 60s)
./port-monitor.sh continuous

# Relatório detalhado
./port-monitor.sh report
```

### 3. cleanup-automation.sh - Limpeza Automatizada
Realiza manutenção preventiva do sistema.

**Localização:** `/var/www/urbansend/scripts/cleanup-automation.sh`

**Comandos:**
```bash
# Limpeza completa
./cleanup-automation.sh full

# Limpeza rápida
./cleanup-automation.sh quick

# Limpeza apenas de logs
./cleanup-automation.sh logs

# Backup e otimização do banco
./cleanup-automation.sh database

# Relatório do sistema
./cleanup-automation.sh report

# Monitoramento de saúde
./cleanup-automation.sh monitor
```

## Procedimentos Rotineiros

### Manutenção Diária
```bash
# 1. Verificar status geral
cd /var/www/urbansend/scripts
./server-control.sh status
./port-monitor.sh monitor

# 2. Limpeza rápida
./cleanup-automation.sh quick
```

### Manutenção Semanal
```bash
# 1. Parada segura para manutenção
./server-control.sh stop

# 2. Limpeza completa
./cleanup-automation.sh full

# 3. Verificar conflitos de porta
./port-monitor.sh cleanup

# 4. Reiniciar aplicação
./server-control.sh start

# 5. Verificação de saúde
./server-control.sh health
```

### Manutenção Mensal
```bash
# 1. Backup do banco de dados
./cleanup-automation.sh database

# 2. Relatório completo do sistema
./cleanup-automation.sh report
./port-monitor.sh report

# 3. Verificar logs de erro
tail -100 /var/www/urbansend/logs/error.log

# 4. Verificar uso de disco
df -h /var/www/urbansend
```

## Resolução de Problemas

### Problema: Aplicação não inicia
```bash
# 1. Verificar conflitos de porta
./port-monitor.sh monitor

# 2. Limpar processos conflitantes
./port-monitor.sh cleanup

# 3. Limpeza completa
./server-control.sh full-cleanup

# 4. Verificar logs
tail -50 /var/www/urbansend/logs/error.log
pm2 logs urbansend --lines 50
```

### Problema: Alto uso de memória
```bash
# 1. Verificar status da aplicação
./cleanup-automation.sh monitor

# 2. Reiniciar se necessário
./server-control.sh restart

# 3. Verificar logs para vazamentos
pm2 logs urbansend --lines 100 | grep -i "memory\|leak"
```

### Problema: Disco cheio
```bash
# 1. Limpeza de emergência
./cleanup-automation.sh logs

# 2. Verificar espaço
df -h

# 3. Limpeza completa se necessário
./cleanup-automation.sh full
```

### Problema: SMTP não funciona
```bash
# 1. Verificar se porta 25 está livre
./port-monitor.sh monitor

# 2. Verificar processo SMTP
ps aux | grep smtpServer

# 3. Reiniciar aplicação
./server-control.sh restart

# 4. Testar endpoint
curl http://localhost:3001/api/health
```

## Configuração de Cron Jobs

Para automatizar a manutenção, adicione as seguintes entradas ao crontab:

```bash
# Editar crontab
crontab -e

# Adicionar as linhas:
# Limpeza rápida diária às 2h
0 2 * * * /var/www/urbansend/scripts/cleanup-automation.sh quick > /var/www/urbansend/logs/cron-cleanup.log 2>&1

# Monitoramento de portas a cada 30 minutos
*/30 * * * * /var/www/urbansend/scripts/port-monitor.sh monitor > /var/www/urbansend/logs/cron-monitor.log 2>&1

# Backup do banco semanal (domingo às 3h)
0 3 * * 0 /var/www/urbansend/scripts/cleanup-automation.sh database > /var/www/urbansend/logs/cron-backup.log 2>&1

# Limpeza completa mensal (primeiro dia do mês às 4h)
0 4 1 * * /var/www/urbansend/scripts/cleanup-automation.sh full > /var/www/urbansend/logs/cron-full-cleanup.log 2>&1
```

## Arquivos de Log

### Logs da Aplicação
- **Aplicação principal:** `/var/www/urbansend/logs/app.log`
- **Saída padrão:** `/var/www/urbansend/logs/out.log`
- **Erros:** `/var/www/urbansend/logs/error.log`

### Logs de Manutenção
- **Monitoramento:** `/var/www/urbansend/logs/port-monitor.log`
- **Limpeza:** `/var/www/urbansend/logs/cleanup.log`
- **Cron jobs:** `/var/www/urbansend/logs/cron-*.log`

### Configuração de Rotação
Os logs são automaticamente rotacionados pelo PM2 conforme configurado em `ecosystem.config.js`:
- **Tamanho máximo:** 10MB por arquivo
- **Retenção:** 5 arquivos rotacionados
- **Compressão:** Habilitada

## Monitoramento Contínuo

### Status dos Serviços
```bash
# PM2
pm2 status

# Portas críticas
netstat -tlnp | grep -E ':(25|80|443|3001)'

# Uso do sistema
htop
df -h
free -h
```

### Endpoints de Saúde
- **API Health:** `http://localhost:3001/api/health`
- **Sistema:** `curl -I http://localhost:3001`

## Backup e Recovery

### Backup Automático
O script `cleanup-automation.sh database` realiza:
1. Backup completo do SQLite
2. Compressão com gzip
3. Retenção de 14 dias
4. Otimização do banco (VACUUM + ANALYZE)

### Recovery Manual
```bash
# 1. Parar aplicação
./server-control.sh stop

# 2. Restaurar backup (substitua YYYYMMDD_HHMMSS)
gunzip /var/www/urbansend/backups/database_YYYYMMDD_HHMMSS.sqlite.gz
cp /var/www/urbansend/backups/database_YYYYMMDD_HHMMSS.sqlite /var/www/urbansend/data/database.sqlite

# 3. Reiniciar aplicação
./server-control.sh start
```

## Contatos de Emergência

Em caso de problemas críticos:
1. Verificar este documento
2. Executar procedimentos de resolução
3. Consultar logs detalhados
4. Contactar suporte técnico se necessário

## Histórico de Versões

- **v1.0** - Implementação inicial dos scripts de manutenção
- Configuração de rotação de logs PM2
- Procedimentos de shutdown/restart seguros
- Monitoramento automatizado de portas
- Scripts de limpeza preventiva