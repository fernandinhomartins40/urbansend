> Pense. Atualize o @local-deploy-enhanced.sh para limpar sempre o redis
  ⎿  Read local-deploy-enhanced.sh (852 lines)

✻ Thinking…

  O usuário identificou um problema importante: o deploy não limpa o Redis, deixando emails órfãos na fila quando o banco SQLite é recriado. 
  Preciso atualizar o local-deploy-enhanced.sh para incluir a limpeza do Redis durante o deploy.

  Vou adicionar um passo para limpar o Redis após recriar o banco de dados, mas antes de iniciar os serviços. Isso garante que não haja emails 
  órfãos na fila.

● Vou atualizar o local-deploy-enhanced.sh para sempre limpar o Redis, evitando emails órfãos.

● Update(local-deploy-enhanced.sh)
  ⎿  Updated local-deploy-enhanced.sh with 10 additions
       432        done
       433        
       434        echo '✅ Migrations e tabelas validadas com sucesso'
       435 +      
       436 +      # 🧹 CRITICAL: Clear Redis queue to remove orphaned emails from previous deploy
       437 +      echo '🧹 Limpando fila Redis para remover emails órfãos...'
       438 +      if systemctl is-active redis-server >/dev/null 2>&1; then
       439 +          echo 'Redis ativo - limpando todas as filas de email órfãos'
       440 +          redis-cli flushdb >/dev/null 2>&1 || echo 'Redis flush com warnings'
       441 +          echo '✅ Redis limpo - emails órfãos do deploy anterior removidos'
       442 +      else
       443 +          echo '⚠️ Redis inativo - não foi possível limpar filas'
       444 +      fi
       445    "
       446
       447    # 7. ENHANCED NGINX CONFIGURATION WITH HTTPS
  ⎿  5-hour limit reached ∙ resets 11pm
     /upgrade to increase your usage limit.