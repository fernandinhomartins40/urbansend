> o erro persiste: # ✅ ENTERPRISE VALIDATION: Test basic services access (FIXED)
  echo "🧪 Validando serviços básicos conseguem acessar schema centralizado..."
  cd $APP_DIR/backend
  # Verify database config exists before testing services
  if [ ! -f "./dist/config/database.js" ]; then
    echo "❌ CRÍTICO: Database config não encontrado para validação de serviços"
    echo "Arquivos em dist/config:"
    ls -la ./dist/config/ || echo "dist/config não existe"
    exit 1
  fi
  # Test service database access with simple script
  echo "Testing service database access..."
  echo "const db = require(./dist/config/database.js); db.raw(SELECT: No such file or directory
  Error: Process completed with exit code 127.

● O problema persiste porque o comando echo está sendo interpretado de forma incorreta. Vou analisar e corrigir:

● O erro mostra que o comando echo está malformado:

  echo "const db = require(./dist/config/database.js); db.raw(SELECT: No such file or directory

  🔍 PROBLEMAS:
  1. Missing quotes around file path ./dist/config/database.js
  2. Missing quotes and completion of SQL statement SELECT
  3. Command being cut off mid-execution

● Read(.github\workflows\deploy-production.yml)
  ⎿  Read 15 lines (ctrl+r to expand)

● O arquivo parece correto. O problema pode estar nas aspas sendo interpretadas pelo bash dentro do SSH. Vou usar uma abordagem     
  diferente com heredoc:

● Update(.github\workflows\deploy-production.yml)
  ⎿  Updated .github\workflows\deploy-production.yml with 20 additions and 4 removals
       308              exit 1
       309            fi
       310
       311 -          # Test database connectivity with simple script
       311 +          # Test database connectivity with heredoc
       312            echo "Testing database connectivity..."
       313 -          echo "const db = require('./dist/config/database.js'); db.raw('SELECT 1').then(() => { 
           - console.log('DB_OK'); process.exit(0); }).catch(() => process.exit(1));" > /tmp/db_test.js
       313 +          cat > /tmp/db_test.js <<'EOF'
       314 +  const db = require('./dist/config/database.js');
       315 +  db.raw('SELECT 1').then(() => {
       316 +    console.log('DB_OK');
       317 +    process.exit(0);
       318 +  }).catch(() => {
       319 +    process.exit(1);
       320 +  });
       321 +  EOF
       322            if node /tmp/db_test.js 2>/dev/null | grep -q "DB_OK"; then
       323              echo "✅ Database connectivity validated"
       324            else
     ...
       399              exit 1
       400            fi
       401
       402 -          # Test service database access with simple script
       402 +          # Test service database access with heredoc
       403            echo "Testing service database access..."
       404 -          echo "const db = require('./dist/config/database.js'); db.raw('SELECT 1').then(() => { 
           - console.log('SERVICES_OK'); process.exit(0); }).catch(() => process.exit(1));" > /tmp/service_test.js
       404 +          cat > /tmp/service_test.js <<'EOF'
       405 +  const db = require('./dist/config/database.js');
       406 +  db.raw('SELECT 1').then(() => {
       407 +    console.log('SERVICES_OK');
       408 +    process.exit(0);
       409 +  }).catch(() => {
       410 +    process.exit(1);
       411 +  });
       412 +  EOF
       413            if timeout 15s node /tmp/service_test.js 2>/dev/null | grep -q "SERVICES_OK"; then
       414              echo "✅ Service database validation passed"
       415            else

● Bash(git add -A && git commit -m "fix: usar heredoc para evitar problemas de aspas em comandos echo…)
  ⎿  Error: /usr/bin/bash: eval: line 71: syntax error near unexpected token `('
     /usr/bin/bash: eval: line 71: `🤖 Generated with [Claude Code](https://claude.ai/code)'
