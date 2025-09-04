# 🚀 UltraZend - Deploy Guide

## 📋 Deploy Architecture - NATIVE ONLY

**UltraZend now uses native PM2 + Nginx deployment (Docker completely removed)**

### 📁 Deploy Files

```
├── deploy.sh                           # 🎯 Main deploy script (PM2 + Nginx)
├── setup-server.sh                     # 🏗️ Server initial setup  
├── .github/workflows/deploy-production.yml # 🤖 CI/CD Pipeline
└── configs/
    ├── nginx-http.conf                  # 🌐 Nginx HTTP config
    └── nginx-ssl.conf                   # 🔒 Nginx HTTPS config
```

## 🚀 How to Deploy

### **Option 1: Automatic Deploy (GitHub Actions)**
```bash
# Automatic on push to main branch
git push origin main
```

### **Option 2: Manual Deploy**
```bash
# Standard deploy
./deploy.sh

# Quick deploy (no confirmations)
./deploy.sh --quick

# Just restart services
./deploy.sh --restart
```

### **Option 3: Fresh Server Setup**
```bash
# First time server setup + deploy
./deploy.sh --setup
```

## 📊 Native Architecture

### 🚀 **PM2 + Nginx (Current)**
- ✅ **Native performance** - No containers overhead
- ✅ **Simpler debugging** - Direct process access  
- ✅ **Lower resource usage** - Ideal for VPS
- ✅ **Faster deployment** - No image building
- ✅ **Better monitoring** - PM2 built-in tools

```bash
./deploy.sh
```

## 🔧 Deployment Process

### **1. Frontend Build (Local)**
- React/Vite build executed locally
- Static files generated in `frontend/dist/`
- Assets optimized and bundled

### **2. File Transfer**
- Source code + frontend build transferred via rsync
- Excludes unnecessary files (node_modules, .git, etc)
- Preserves permissions and structure

### **3. Backend Setup (Server)**
- Dependencies installed with `npm ci --production`
- TypeScript build with `npm run build`
- Database migrations executed
- Environment variables configured

### **4. Service Management**
- PM2 starts backend process
- Nginx serves frontend static files
- Reverse proxy configured for API calls
- Health checks performed

## 📋 Prerequisites

### **Local Development**
- Node.js 20+
- npm 10+
- Git
- SSH access to server
- rsync

### **Production Server**
- Ubuntu 22.04+ or Debian 11+
- SSH root access
- Ports 80, 443 open for web traffic
- Ports 25, 587 open for SMTP (email)

## 🎯 Useful Commands

### **Status and Monitoring**
```bash
# PM2 status
ssh root@31.97.162.155 'pm2 status'
ssh root@31.97.162.155 'pm2 logs ultrazend-backend'
ssh root@31.97.162.155 'pm2 monit'

# System status
ssh root@31.97.162.155 'systemctl status nginx'
ssh root@31.97.162.155 'free -h && df -h'
```

### **Troubleshooting**
```bash
# Health check
curl -f https://www.ultrazend.com.br/health

# Application logs
ssh root@31.97.162.155 'pm2 logs ultrazend-backend --lines 50'

# Nginx logs
ssh root@31.97.162.155 'tail -f /var/log/nginx/error.log'

# Quick restart
./deploy.sh --restart
```

### **PM2 Management**
```bash
# Connect to server
ssh root@31.97.162.155

# PM2 commands
pm2 status                    # Show all processes
pm2 logs ultrazend-backend    # View logs
pm2 restart ultrazend-backend # Restart app
pm2 reload ultrazend-backend  # Zero-downtime reload
pm2 stop ultrazend-backend    # Stop app
pm2 delete ultrazend-backend  # Remove from PM2
```

## ⚙️ Configuration

### **Environment Variables**
- `configs/.env.production` - Main configuration file
- Automatically copied to `backend/.env` during deployment
- Contains database, SMTP, and application settings

### **Nginx Configuration**
- Frontend static files served from `/var/www/ultrazend-static`
- API requests proxied to `localhost:3001`
- WebSocket support for real-time features
- Security headers and caching configured

### **Production URLs**
- Website: https://www.ultrazend.com.br
- API: https://www.ultrazend.com.br/api
- Health Check: https://www.ultrazend.com.br/health
- Admin Panel: https://www.ultrazend.com.br/admin

## 🔒 SSL/HTTPS Setup

SSL certificates are automatically managed during deployment:

```bash
# Manual SSL setup (if needed)
ssh root@31.97.162.155
certbot --nginx -d ultrazend.com.br -d www.ultrazend.com.br \
  --email admin@ultrazend.com.br --agree-tos --non-interactive
```

## 🆘 Emergency Procedures

### **Quick Recovery**
```bash
# Restart services only
./deploy.sh --restart

# Quick redeploy
./deploy.sh --quick
```

### **Full Recovery**
```bash
# Reset server and redeploy
./deploy.sh --setup
```

### **Manual Recovery**
```bash
# Connect to server
ssh root@31.97.162.155

# Restart PM2 process
pm2 restart ultrazend-backend

# Restart Nginx
systemctl restart nginx

# Check status
pm2 status
systemctl status nginx
```

## 📊 Performance Benefits

### **Why Native over Docker?**

| Aspect | Native PM2 | Docker |
|--------|------------|--------|
| **Memory Usage** | ~200MB | ~400MB+ |
| **Deploy Time** | ~2-3 min | ~5-10 min |
| **Debugging** | Direct access | Through containers |
| **Monitoring** | PM2 built-in | Additional tools needed |
| **Resource Overhead** | Minimal | Container layer |
| **VPS Efficiency** | Optimal | Good |

## ✅ Recent Improvements

### **Architecture Simplification**
- ✅ **Removed Docker complexity** - Native PM2 + Nginx only
- ✅ **Faster deployments** - No image building required
- ✅ **Better resource utilization** - No container overhead
- ✅ **Simplified debugging** - Direct process access

### **Deployment Reliability**
- ✅ **Frontend build verification** - Ensures static files exist
- ✅ **Health checks** - Automatic service validation
- ✅ **Zero-downtime deploys** - PM2 graceful reloads
- ✅ **Rollback capabilities** - Quick recovery options

### **Developer Experience**
- ✅ **Single command deploy** - `./deploy.sh`
- ✅ **Automatic CI/CD** - GitHub Actions integration
- ✅ **Clear monitoring** - PM2 built-in tools
- ✅ **Easy troubleshooting** - Native logs and processes

---

**🎉 UltraZend now runs efficiently with native PM2 + Nginx deployment!**