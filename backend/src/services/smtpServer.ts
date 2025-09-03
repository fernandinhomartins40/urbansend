import { SMTPServer, SMTPServerSession } from 'smtp-server';
import { simpleParser, ParsedMail } from 'mailparser';
import bcrypt from 'bcrypt';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import { SecurityManager } from './securityManager';
import { RateLimiter } from './rateLimiter';
import { ReputationManager } from './reputationManager';
import { DKIMManager } from './dkimManager';
import { EmailProcessor } from './emailProcessor';
import db from '../config/database';

export interface SMTPServerConfig {
  mxPort: number;
  submissionPort: number;
  hostname: string;
  maxConnections: number;
  maxMessageSize: number;
  authRequired: boolean;
  tlsEnabled: boolean;
  certPath?: string;
  keyPath?: string;
}

export interface SMTPSession extends SMTPServerSession {
  user?: any;
  authenticated?: boolean;
  rateLimitChecked?: boolean;
  securityValidated?: boolean;
}

class UltraZendSMTPServer {
  private mxServer: SMTPServer;
  private submissionServer: SMTPServer;
  private config: SMTPServerConfig;
  private securityManager: SecurityManager;
  private rateLimiter: RateLimiter;
  private reputationManager: ReputationManager;
  private dkimManager: DKIMManager;
  private emailProcessor: EmailProcessor;
  private isRunning = false;

  constructor(config: Partial<SMTPServerConfig> = {}) {
    this.config = {
      mxPort: Env.getNumber('SMTP_MX_PORT', 25),
      submissionPort: Env.getNumber('SMTP_SUBMISSION_PORT', 587),
      hostname: Env.get('SMTP_HOSTNAME', 'mail.ultrazend.com'),
      maxConnections: Env.getNumber('SMTP_MAX_CLIENTS', 100),
      maxMessageSize: 50 * 1024 * 1024, // 50MB
      authRequired: !Env.isDevelopment,
      tlsEnabled: true,
      ...config
    };

    // Inicializar serviços
    this.securityManager = new SecurityManager();
    this.rateLimiter = new RateLimiter();
    this.reputationManager = new ReputationManager();
    this.dkimManager = new DKIMManager();
    this.emailProcessor = new EmailProcessor();

    this.initializeServers();
  }

  private initializeServers(): void {
    // MX Server (porta 25) - recebe emails de outros servidores
    this.mxServer = new SMTPServer({
      name: this.config.hostname,
      banner: `${this.config.hostname} ESMTP UltraZend Mail Server`,
      authOptional: true, // Autenticação opcional para MX
      maxClients: this.config.maxConnections,
      socketTimeout: 60000,
      closeTimeout: 30000,
      logger: false, // Usar nosso logger customizado
      
      // Validação de conexão
      onConnect: (session, callback) => this.handleConnect(session as SMTPSession, callback, 'mx'),
      
      // Validação de AUTH (opcional para MX)
      onAuth: (auth, session, callback) => this.handleAuth(auth, session as SMTPSession, callback),
      
      // Validação de MAIL FROM
      onMailFrom: (address, session, callback) => this.handleMailFrom(address, session as SMTPSession, callback),
      
      // Validação de RCPT TO
      onRcptTo: (address, session, callback) => this.handleRcptTo(address, session as SMTPSession, callback),
      
      // Processamento da mensagem
      onData: (stream, session, callback) => this.handleData(stream, session as SMTPSession, callback, 'mx')
    });

    // Submission Server (porta 587) - recebe emails de clientes autenticados
    this.submissionServer = new SMTPServer({
      name: this.config.hostname,
      banner: `${this.config.hostname} ESMTP UltraZend Submission Server`,
      authMethods: ['PLAIN', 'LOGIN', 'CRAM-MD5'],
      authOptional: false, // Autenticação obrigatória para Submission
      maxClients: this.config.maxConnections,
      socketTimeout: 60000,
      closeTimeout: 30000,
      logger: false,
      
      // Validação de conexão
      onConnect: (session, callback) => this.handleConnect(session as SMTPSession, callback, 'submission'),
      
      // Validação de AUTH (obrigatória para Submission)
      onAuth: (auth, session, callback) => this.handleAuth(auth, session as SMTPSession, callback),
      
      // Validação de MAIL FROM
      onMailFrom: (address, session, callback) => this.handleMailFrom(address, session as SMTPSession, callback),
      
      // Validação de RCPT TO
      onRcptTo: (address, session, callback) => this.handleRcptTo(address, session as SMTPSession, callback),
      
      // Processamento da mensagem
      onData: (stream, session, callback) => this.handleData(stream, session as SMTPSession, callback, 'submission')
    });

    logger.info('SMTP servers initialized', {
      mxPort: this.config.mxPort,
      submissionPort: this.config.submissionPort,
      hostname: this.config.hostname
    });
  }

  private async handleConnect(
    session: SMTPSession, 
    callback: (err?: Error | null) => void,
    serverType: 'mx' | 'submission'
  ): Promise<void> {
    try {
      const remoteAddress = session.remoteAddress || 'unknown';
      const hostname = session.hostNameAppearsAs || 'unknown';

      logger.info('SMTP connection attempt', {
        remoteAddress,
        hostname,
        serverType,
        sessionId: session.id
      });

      // Verificar rate limiting
      const rateLimitResult = await this.rateLimiter.checkConnection(remoteAddress);
      if (!rateLimitResult.allowed) {
        logger.warn('Connection blocked by rate limiter', {
          remoteAddress,
          reason: rateLimitResult.reason,
          serverType
        });
        return callback(new Error(`421 ${rateLimitResult.reason}`));
      }

      // Verificar segurança (apenas para MX, Submission confia nos clientes autenticados)
      if (serverType === 'mx') {
        const securityResult = await this.securityManager.validateMXConnection(remoteAddress, hostname);
        if (!securityResult.allowed) {
          logger.warn('Connection blocked by security manager', {
            remoteAddress,
            reason: securityResult.reason,
            serverType
          });
          return callback(new Error(`554 ${securityResult.reason}`));
        }
        session.securityValidated = true;
      }

      session.rateLimitChecked = true;
      
      // Registrar conexão bem-sucedida
      await this.logConnection(remoteAddress, hostname, serverType, 'accepted');
      
      callback();

    } catch (error) {
      logger.error('Error in connection handler', {
        error,
        remoteAddress: session.remoteAddress,
        serverType
      });
      callback(new Error('421 Temporary server error'));
    }
  }

  private async handleAuth(
    auth: any,
    session: SMTPSession,
    callback: (err?: Error | null, response?: any) => void
  ): Promise<void> {
    try {
      const remoteAddress = session.remoteAddress || 'unknown';
      const username = auth.username;

      logger.info('SMTP authentication attempt', {
        username,
        remoteAddress,
        method: auth.method
      });

      // Verificar rate limiting para autenticação
      const rateLimitResult = await this.rateLimiter.checkAuth(remoteAddress, username);
      if (!rateLimitResult.allowed) {
        logger.warn('Authentication blocked by rate limiter', {
          username,
          remoteAddress,
          reason: rateLimitResult.reason
        });
        return callback(new Error(`421 ${rateLimitResult.reason}`));
      }

      // Validar credenciais no banco de dados
      const user = await this.validateUserCredentials(username, auth.password);
      if (!user) {
        logger.warn('Authentication failed - invalid credentials', {
          username,
          remoteAddress
        });
        
        // Registrar tentativa de autenticação falhada
        await this.logAuthAttempt(username, remoteAddress, false);
        
        return callback(new Error('535 Authentication failed'));
      }

      // Verificar se usuário está ativo
      if (!user.is_active) {
        logger.warn('Authentication failed - user inactive', {
          username,
          remoteAddress
        });
        return callback(new Error('535 Account disabled'));
      }

      session.user = user;
      session.authenticated = true;
      
      // Registrar autenticação bem-sucedida
      await this.logAuthAttempt(username, remoteAddress, true);
      
      logger.info('SMTP authentication successful', {
        username,
        remoteAddress,
        userId: user.id
      });

      callback(null, { user: user.id });

    } catch (error) {
      logger.error('Error in authentication handler', {
        error,
        username: auth.username,
        remoteAddress: session.remoteAddress
      });
      callback(new Error('421 Temporary server error'));
    }
  }

  private async handleMailFrom(
    address: any,
    session: SMTPSession,
    callback: (err?: Error | null) => void
  ): Promise<void> {
    try {
      const senderEmail = address.address;
      const remoteAddress = session.remoteAddress || 'unknown';

      logger.info('SMTP MAIL FROM command', {
        sender: senderEmail,
        remoteAddress,
        authenticated: session.authenticated,
        userId: session.user?.id
      });

      // Validar sender
      const senderValidation = await this.emailProcessor.validateSender(
        senderEmail,
        session.user,
        remoteAddress
      );

      if (!senderValidation.valid) {
        logger.warn('MAIL FROM rejected', {
          sender: senderEmail,
          reason: senderValidation.reason,
          remoteAddress
        });
        return callback(new Error(`550 ${senderValidation.reason}`));
      }

      callback();

    } catch (error) {
      logger.error('Error in MAIL FROM handler', {
        error,
        sender: address.address,
        remoteAddress: session.remoteAddress
      });
      callback(new Error('421 Temporary server error'));
    }
  }

  private async handleRcptTo(
    address: any,
    session: SMTPSession,
    callback: (err?: Error | null) => void
  ): Promise<void> {
    try {
      const recipientEmail = address.address;
      const remoteAddress = session.remoteAddress || 'unknown';

      logger.info('SMTP RCPT TO command', {
        recipient: recipientEmail,
        remoteAddress,
        authenticated: session.authenticated,
        userId: session.user?.id
      });

      // Para Submission Server, permitir qualquer destinatário (cliente autenticado)
      if (session.authenticated && session.user) {
        callback();
        return;
      }

      // Para MX Server, validar se o destinatário é local
      const recipientValidation = await this.emailProcessor.validateLocalRecipient(recipientEmail);
      if (!recipientValidation.valid) {
        logger.warn('RCPT TO rejected', {
          recipient: recipientEmail,
          reason: recipientValidation.reason,
          remoteAddress
        });
        return callback(new Error(`550 ${recipientValidation.reason}`));
      }

      callback();

    } catch (error) {
      logger.error('Error in RCPT TO handler', {
        error,
        recipient: address.address,
        remoteAddress: session.remoteAddress
      });
      callback(new Error('421 Temporary server error'));
    }
  }

  private async validateUserCredentials(username: string, password: string): Promise<any> {
    try {
      // Buscar usuário no banco de dados
      const user = await db('users')
        .select('id', 'email', 'password', 'is_verified')
        .where('email', username)
          .first();

      if (!user) {
        return null;
      }

      if (!user.is_verified) {
        logger.warn('SMTP auth failed: user not verified', { email: username });
        return null;
      }

      // Verificar senha (assumindo que está hasheada)
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        return null;
      }

      return user;
    } catch (error) {
      logger.error('Error validating user credentials', { error, username });
      return null;
    }
  }

  private async handleData(
    stream: any,
    session: SMTPSession,
    callback: (err?: Error | null) => void,
    serverType: 'mx' | 'submission'
  ): Promise<void> {
    try {
      const remoteAddress = session.remoteAddress || 'unknown';
      
      logger.info('SMTP DATA command started', {
        remoteAddress,
        serverType,
        authenticated: session.authenticated,
        userId: session.user?.id
      });

      // Parse do email
      const parsedEmail = await simpleParser(stream);
      
      let processingResult;
      
      if (serverType === 'mx') {
        // Email recebido de servidor externo
        processingResult = await this.emailProcessor.processIncomingEmail(parsedEmail, session);
      } else {
        // Email enviado por cliente autenticado
        processingResult = await this.emailProcessor.processOutgoingEmail(parsedEmail, session);
      }

      if (!processingResult.success) {
        logger.warn('Email processing failed', {
          reason: processingResult.reason,
          action: processingResult.action,
          remoteAddress,
          serverType
        });

        // Determinar código de erro apropriado
        const errorCode = processingResult.action === 'quarantine' ? '451' : '550';
        return callback(new Error(`${errorCode} ${processingResult.reason}`));
      }

      logger.info('Email processed successfully', {
        messageId: processingResult.messageId,
        action: processingResult.action,
        remoteAddress,
        serverType
      });

      callback();

    } catch (error) {
      logger.error('Error in DATA handler', {
        error,
        remoteAddress: session.remoteAddress,
        serverType
      });
      callback(new Error('421 Temporary server error'));
    }
  }

  private async logConnection(
    remoteAddress: string,
    hostname: string,
    serverType: string,
    status: string
  ): Promise<void> {
    try {
      await db('smtp_connections').insert({
        remote_address: remoteAddress,
        hostname,
        server_type: serverType,
        status,
        created_at: new Date()
      });
    } catch (error) {
      logger.error('Failed to log connection', { error });
    }
  }

  private async logAuthAttempt(
    username: string,
    remoteAddress: string,
    success: boolean
  ): Promise<void> {
    try {
      await db('auth_attempts').insert({
        username,
        remote_address: remoteAddress,
        success,
        created_at: new Date()
      });
    } catch (error) {
      logger.error('Failed to log auth attempt', { error });
    }
  }

  public async start(): Promise<void> {
    try {
      // Criar tabelas necessárias
      await this.createSMTPTables();

      // Iniciar MX Server
      await new Promise<void>((resolve, reject) => {
        this.mxServer.listen(this.config.mxPort, (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            logger.info(`MX Server listening on port ${this.config.mxPort}`);
            resolve();
          }
        });
      });

      // Iniciar Submission Server
      await new Promise<void>((resolve, reject) => {
        this.submissionServer.listen(this.config.submissionPort, (err?: Error) => {
          if (err) {
            reject(err);
          } else {
            logger.info(`Submission Server listening on port ${this.config.submissionPort}`);
            resolve();
          }
        });
      });

      this.isRunning = true;
      
      logger.info('UltraZend SMTP Server started successfully', {
        mxPort: this.config.mxPort,
        submissionPort: this.config.submissionPort,
        hostname: this.config.hostname
      });

    } catch (error) {
      logger.error('Failed to start SMTP server', { error });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      await Promise.all([
        new Promise<void>((resolve) => {
          this.mxServer.close(() => {
            logger.info('MX Server stopped');
            resolve();
          });
        }),
        new Promise<void>((resolve) => {
          this.submissionServer.close(() => {
            logger.info('Submission Server stopped');
            resolve();
          });
        })
      ]);

      this.isRunning = false;
      logger.info('UltraZend SMTP Server stopped');

    } catch (error) {
      logger.error('Error stopping SMTP server', { error });
      throw error;
    }
  }

  private async createSMTPTables(): Promise<void> {
    try {
      // Tabela para logs de conexões SMTP
      const hasSMTPConnectionsTable = await db.schema.hasTable('smtp_connections');
      if (!hasSMTPConnectionsTable) {
        await db.schema.createTable('smtp_connections', (table) => {
          table.increments('id').primary();
          table.string('remote_address', 45).notNullable();
          table.string('hostname', 255);
          table.string('server_type', 20).notNullable(); // 'mx' ou 'submission'
          table.string('status', 20).notNullable(); // 'accepted', 'rejected'
          table.timestamps(true, true);
          
          table.index(['remote_address', 'server_type']);
          table.index('created_at');
        });
      }

      // Tabela para tentativas de autenticação
      const hasAuthAttemptsTable = await db.schema.hasTable('auth_attempts');
      if (!hasAuthAttemptsTable) {
        await db.schema.createTable('auth_attempts', (table) => {
          table.increments('id').primary();
          table.string('username', 255).notNullable();
          table.string('remote_address', 45).notNullable();
          table.boolean('success').notNullable();
          table.timestamps(true, true);
          
          table.index(['username', 'success']);
          table.index(['remote_address', 'success']);
          table.index('created_at');
        });
      }

      logger.info('SMTP tables verified/created');
    } catch (error) {
      logger.error('Failed to create SMTP tables', { error });
    }
  }

  public getStatus(): any {
    return {
      isRunning: this.isRunning,
      config: this.config,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  public async getStats(): Promise<any> {
    try {
      const now = new Date();
      const hour = new Date(now.getTime() - 3600000);

      const [connectionStats, authStats, rateLimitStats] = await Promise.all([
        db('smtp_connections')
          .where('created_at', '>=', hour)
          .groupBy('server_type', 'status')
          .count('* as count')
          .select('server_type', 'status'),
        db('auth_attempts')
          .where('created_at', '>=', hour)
          .groupBy('success')
          .count('* as count')
          .select('success'),
        this.rateLimiter.getRateLimitStats()
      ]);

      return {
        connections: connectionStats,
        authentication: authStats,
        rateLimits: rateLimitStats,
        timestamp: now.toISOString()
      };
    } catch (error) {
      logger.error('Failed to get SMTP stats', { error });
      return {
        connections: [],
        authentication: [],
        rateLimits: {},
        timestamp: new Date().toISOString()
      };
    }
  }
}

export const smtpServer = new UltraZendSMTPServer();
export default UltraZendSMTPServer;