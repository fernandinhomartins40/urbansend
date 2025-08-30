# DNS Configuration Notes

## Registros que precisam ser atualizados:

### SPF Record - URGENTE
```
TXT    www    0    "v=spf1 ip4:31.97.162.155 ~all"    14400
```
**Status atual**: `ip4:72.60.10.112` (IP antigo)
**Deve ser**: `ip4:31.97.162.155` (IP novo)

### MX Record - VERIFICAR
```
MX    www    10    www.ultrazend.com.br    14400
```
**Verificar se**: O servidor de email está configurado na nova VPS

### Registros corretos:
- ✅ A    www    0    31.97.162.155    14400
- ✅ A    @      0    31.97.162.155    14400  
- ✅ DKIM e DMARC estão configurados

## Próximos passos:
1. Atualizar SPF record com novo IP
2. Configurar servidor SMTP na nova VPS
3. Testar envio de emails após deploy