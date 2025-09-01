#!/bin/bash

# 📧 ULTRAZEND - Complete Email Server Setup
# Postfix + DKIM + SPF + DMARC Configuration

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
DOMAIN="ultrazend.com.br"
HOSTNAME="mail.ultrazend.com.br"
DKIM_SELECTOR="ultrazend"
ADMIN_EMAIL="admin@ultrazend.com.br"

log() { echo -e "${BLUE}[EMAIL-SETUP] $1${NC}"; }
success() { echo -e "${GREEN}[SUCCESS] $1${NC}"; }
error() { echo -e "${RED}[ERROR] $1${NC}"; exit 1; }
warning() { echo -e "${YELLOW}[WARNING] $1${NC}"; }

echo "📧 CONFIGURAÇÃO COMPLETA DO SERVIDOR DE EMAIL"
echo "=============================================="
log "Domínio: $DOMAIN"
log "Hostname: $HOSTNAME"
log "DKIM Selector: $DKIM_SELECTOR"

# 1. INSTALL PACKAGES
log "1. Instalando pacotes necessários..."

apt update
apt install -y postfix postfix-pcre opendkim opendkim-tools mailutils \
               certbot python3-certbot-nginx rsyslog logrotate \
               fail2ban ufw

success "Pacotes instalados"

# 2. CONFIGURE POSTFIX
log "2. Configurando Postfix..."

# Backup original config
cp /etc/postfix/main.cf /etc/postfix/main.cf.backup.$(date +%Y%m%d)

cat > /etc/postfix/main.cf << EOF
# Postfix configuration for UltraZend
smtpd_banner = \$myhostname ESMTP \$mail_name (Ubuntu)
biff = no
append_dot_mydomain = no

# TLS parameters
smtpd_tls_cert_file = /etc/letsencrypt/live/$HOSTNAME/fullchain.pem
smtpd_tls_key_file = /etc/letsencrypt/live/$HOSTNAME/privkey.pem
smtpd_use_tls = yes
smtpd_tls_session_cache_database = btree:\${data_directory}/smtpd_scache
smtp_tls_session_cache_database = btree:\${data_directory}/smtp_scache
smtpd_tls_security_level = may
smtp_tls_security_level = may

# Basic configuration
myhostname = $HOSTNAME
alias_maps = hash:/etc/aliases
alias_database = hash:/etc/aliases
mydomain = $DOMAIN
myorigin = \$mydomain
mydestination = \$myhostname, $HOSTNAME, $DOMAIN, localhost.localdomain, localhost
relayhost = 
mynetworks = 127.0.0.0/8 [::ffff:127.0.0.0]/104 [::1]/128
mailbox_size_limit = 0
recipient_delimiter = +
inet_interfaces = all
inet_protocols = ipv4

# Security and spam protection
smtpd_helo_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_invalid_helo_hostname, reject_non_fqdn_helo_hostname
smtpd_sender_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_non_fqdn_sender, reject_unknown_sender_domain
smtpd_recipient_restrictions = permit_mynetworks, permit_sasl_authenticated, reject_non_fqdn_recipient, reject_unknown_recipient_domain, reject_unauth_destination

# Rate limiting
smtpd_client_connection_count_limit = 50
smtpd_client_connection_rate_limit = 100
smtpd_client_message_rate_limit = 100
smtpd_client_recipient_rate_limit = 200
smtpd_client_event_limit_exceptions = 127.0.0.1

# Message size limits
message_size_limit = 25600000
mailbox_size_limit = 0

# DKIM
milter_protocol = 2
milter_default_action = accept
smtpd_milters = inet:localhost:8891
non_smtpd_milters = inet:localhost:8891

# Logging
maillog_file = /var/log/postfix/postfix.log
EOF

success "Postfix configurado"

# 3. SETUP OPENDKIM
log "3. Configurando OpenDKIM..."

# Create directories
mkdir -p /etc/opendkim/keys/$DOMAIN
chown -R opendkim:opendkim /etc/opendkim
chmod -R 755 /etc/opendkim

# Generate DKIM keys
cd /etc/opendkim/keys/$DOMAIN
opendkim-genkey -s $DKIM_SELECTOR -d $DOMAIN -b 2048
chown opendkim:opendkim *
chmod 600 $DKIM_SELECTOR.private

# Configure OpenDKIM
cat > /etc/opendkim.conf << EOF
# OpenDKIM Configuration for UltraZend
Syslog yes
SyslogSuccess yes
LogWhy yes

Canonicalization relaxed/simple
Mode sv
SubDomains yes

ExternalIgnoreList /etc/opendkim/TrustedHosts
InternalHosts /etc/opendkim/TrustedHosts
KeyTable /etc/opendkim/KeyTable
SigningTable /etc/opendkim/SigningTable

Socket inet:8891@localhost
PidFile /var/run/opendkim/opendkim.pid

UMask 022
UserID opendkim:opendkim

TemporaryDirectory /var/tmp
EOF

# Create trusted hosts
cat > /etc/opendkim/TrustedHosts << EOF
127.0.0.1
localhost
$DOMAIN
*.$DOMAIN
EOF

# Create key table
echo "$DKIM_SELECTOR._domainkey.$DOMAIN $DOMAIN:$DKIM_SELECTOR:/etc/opendkim/keys/$DOMAIN/$DKIM_SELECTOR.private" > /etc/opendkim/KeyTable

# Create signing table
echo "*@$DOMAIN $DKIM_SELECTOR._domainkey.$DOMAIN" > /etc/opendkim/SigningTable

# Set permissions
chown -R opendkim:opendkim /etc/opendkim
chmod 644 /etc/opendkim/TrustedHosts /etc/opendkim/KeyTable /etc/opendkim/SigningTable

success "OpenDKIM configurado"

# 4. SSL CERTIFICATES
log "4. Configurando certificados SSL..."

if [ ! -f "/etc/letsencrypt/live/$HOSTNAME/fullchain.pem" ]; then
    certbot certonly --standalone -d $HOSTNAME --non-interactive --agree-tos --email $ADMIN_EMAIL
    
    # Setup auto-renewal
    (crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/certbot renew --quiet && systemctl reload postfix") | crontab -
fi

success "Certificados SSL configurados"

# 5. FIREWALL CONFIGURATION
log "5. Configurando firewall..."

ufw allow 25/tcp   # SMTP
ufw allow 587/tcp  # SMTP Submission
ufw allow 465/tcp  # SMTP SSL
ufw allow 993/tcp  # IMAP SSL
ufw allow 995/tcp  # POP3 SSL

success "Firewall configurado"

# 6. FAIL2BAN CONFIGURATION
log "6. Configurando Fail2Ban..."

cat > /etc/fail2ban/jail.d/postfix.conf << EOF
[postfix]
enabled = true
port = smtp,465,submission
filter = postfix
logpath = /var/log/postfix/postfix.log
maxretry = 5
bantime = 3600
findtime = 600

[postfix-sasl]
enabled = true
port = smtp,465,submission,imap,imaps,pop3,pop3s
filter = postfix-sasl
logpath = /var/log/postfix/postfix.log
maxretry = 3
bantime = 3600
findtime = 600
EOF

systemctl enable fail2ban
systemctl start fail2ban

success "Fail2Ban configurado"

# 7. START SERVICES
log "7. Iniciando serviços..."

systemctl enable postfix opendkim
systemctl restart postfix opendkim

# Verify services
sleep 5
if systemctl is-active --quiet postfix && systemctl is-active --quiet opendkim; then
    success "Serviços iniciados com sucesso"
else
    error "Falha ao iniciar serviços"
fi

# 8. CREATE DNS RECORDS INFORMATION
log "8. Gerando informações dos registros DNS..."

DKIM_PUBLIC_KEY=$(cat /etc/opendkim/keys/$DOMAIN/$DKIM_SELECTOR.txt | grep -o 'p=[^"]*' | cut -d= -f2)

cat > /tmp/ultrazend-dns-records.txt << EOF
===========================================
REGISTROS DNS NECESSÁRIOS PARA ULTRAZEND
===========================================

1. REGISTRO MX:
Nome: @
Tipo: MX
Valor: 10 $HOSTNAME
TTL: 3600

2. REGISTRO A (para o servidor de email):
Nome: mail
Tipo: A
Valor: $(curl -s ifconfig.me)
TTL: 3600

3. REGISTRO SPF:
Nome: @
Tipo: TXT
Valor: "v=spf1 mx a:$HOSTNAME include:_spf.google.com ~all"
TTL: 3600

4. REGISTRO DKIM:
Nome: $DKIM_SELECTOR._domainkey
Tipo: TXT
Valor: $(cat /etc/opendkim/keys/$DOMAIN/$DKIM_SELECTOR.txt | tr -d '\n' | sed 's/.*p=/p=/' | sed 's/".*//')
TTL: 3600

5. REGISTRO DMARC:
Nome: _dmarc
Tipo: TXT
Valor: "v=DMARC1; p=quarantine; rua=mailto:dmarc@$DOMAIN; ruf=mailto:dmarc@$DOMAIN; sp=quarantine; adkim=r; aspf=r;"
TTL: 3600

6. REGISTRO PTR (Reverse DNS - configurar no provedor VPS):
IP: $(curl -s ifconfig.me)
Valor: $HOSTNAME

===========================================
VERIFICAÇÕES PÓS-CONFIGURAÇÃO:
===========================================

1. Verificar DKIM:
   dig TXT $DKIM_SELECTOR._domainkey.$DOMAIN

2. Verificar SPF:
   dig TXT $DOMAIN | grep spf

3. Testar envio:
   echo "Teste" | mail -s "Teste UltraZend" test@example.com

4. Verificar logs:
   tail -f /var/log/postfix/postfix.log

===========================================
EOF

success "Registros DNS gerados em /tmp/ultrazend-dns-records.txt"

# 9. CREATE EMAIL MONITORING
log "9. Configurando monitoramento de email..."

cat > /usr/local/bin/email-monitor.sh << 'EOF'
#!/bin/bash
# Email monitoring script for UltraZend

LOG_FILE="/var/log/ultrazend/email-monitor.log"
ALERT_EMAIL="admin@ultrazend.com.br"

check_postfix() {
    if ! systemctl is-active --quiet postfix; then
        echo "$(date): Postfix is down!" >> $LOG_FILE
        systemctl restart postfix
        echo "Postfix restarted" | mail -s "UltraZend: Postfix Alert" $ALERT_EMAIL
    fi
}

check_opendkim() {
    if ! systemctl is-active --quiet opendkim; then
        echo "$(date): OpenDKIM is down!" >> $LOG_FILE
        systemctl restart opendkim
        echo "OpenDKIM restarted" | mail -s "UltraZend: DKIM Alert" $ALERT_EMAIL
    fi
}

check_disk_space() {
    USAGE=$(df /var/log | tail -1 | awk '{print $5}' | sed 's/%//')
    if [ $USAGE -gt 80 ]; then
        echo "$(date): Disk space critical: ${USAGE}%" >> $LOG_FILE
        echo "Disk space is ${USAGE}% full" | mail -s "UltraZend: Disk Alert" $ALERT_EMAIL
    fi
}

# Run checks
check_postfix
check_opendkim
check_disk_space
EOF

chmod +x /usr/local/bin/email-monitor.sh

# Add to crontab
(crontab -l 2>/dev/null; echo "*/5 * * * * /usr/local/bin/email-monitor.sh") | crontab -

success "Monitoramento configurado"

# 10. FINAL SETUP
log "10. Configuração final..."

# Create log directories
mkdir -p /var/log/ultrazend
mkdir -p /var/log/postfix
touch /var/log/postfix/postfix.log
chown postfix:postfix /var/log/postfix/postfix.log

# Setup logrotate
cat > /etc/logrotate.d/ultrazend-email << EOF
/var/log/postfix/postfix.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 postfix postfix
    postrotate
        systemctl reload postfix
    endscript
}

/var/log/ultrazend/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
}
EOF

success "Configuração final concluída"

echo ""
success "🎉 SERVIDOR DE EMAIL CONFIGURADO COM SUCESSO!"
echo "=============================================="
log "Próximos passos:"
log "1. Configure os registros DNS (veja /tmp/ultrazend-dns-records.txt)"
log "2. Aguarde propagação DNS (24-48h)"
log "3. Teste o envio de emails"
log "4. Configure monitoramento adicional"
echo ""
warning "IMPORTANTE: Configure os registros DNS antes de usar o servidor!"
cat /tmp/ultrazend-dns-records.txt