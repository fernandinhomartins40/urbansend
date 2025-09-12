/**
 * @ultrazend/smtp-server - SMTP Server
 * Servidor SMTP completo independente - Aceita conexões e processa emails
 */

import { SMTPServer as NodeSMTPServer } from 'smtp-server';
import { simpleParser, ParsedMail } from 'mailparser';
import bcrypt from 'bcrypt';
import { logger } from '../utils/logger';
import { generateMessageId } from '../utils/crypto';
import { MXDeliveryService } from '../delivery/MXDeliveryService';
import { DKIMManager } from '../security/DKIMManager';
import { SMTPServerConfig, SMTPSession, EmailData, User } from '../types';
import knex from 'knex';

export class UltraZendSMTPServer {
  private mxServer: NodeSMTPServer;
  private submissionServer: NodeSMTPServer;
  private config: Required<SMTPServerConfig>;
  private db: knex.Knex;
  private deliveryService: MXDeliveryService;
  private dkimManager: DKIMManager;
  private isRunning = false;

  constructor(config: SMTPServerConfig = {}) {
    this.config = {
      mxPort: config.mxPort || 25,
      submissionPort: config.submissionPort || 587,
      hostname: config.hostname || 'mail.localhost',
      maxConnections: config.maxConnections || 100,
      maxMessageSize: config.maxMessageSize || 50 * 1024 * 1024, // 50MB
      authRequired: config.authRequired !== undefined ? config.authRequired : true,
      tlsEnabled: config.tlsEnabled !== undefined ? config.tlsEnabled : false,
      certPath: config.certPath || '',
      keyPath: config.keyPath || '',
      databasePath: config.databasePath || './smtp-server.sqlite',
      logLevel: config.logLevel || 'info'
    };

    // Inicializar banco de dados
    this.initializeDatabase();

    logger.info('UltraZend SMTP Server initialized', {
      mxPort: this.config.mxPort,
      submissionPort: this.config.submissionPort,
      hostname: this.config.hostname
    });
  }

  /**
   * Inicializa banco de dados
   */
  private initializeDatabase(): void {
    this.db = knex({
      client: 'sqlite3',
      connection: {
        filename: this.config.databasePath
      },
      useNullAsDefault: true,
      migrations: {
        directory: '../migrations'
      }
    });

    // Inicializar serviços
    this.deliveryService = new MXDeliveryService(this.db, this.config.hostname);
    this.dkimManager = new DKIMManager(this.db);
  }

  /**
   * Inicializa servidores SMTP
   */
  private initializeServers(): void {
    // Servidor MX (porta 25) - recebe emails de outros servidores
    this.mxServer = new NodeSMTPServer({
      name: this.config.hostname,
      banner: `${this.config.hostname} ESMTP UltraZend Mail Server`,
      authOptional: true, // Autenticação opcional para MX
      maxClients: this.config.maxConnections,
      size: this.config.maxMessageSize,
      socketTimeout: 60000,
      closeTimeout: 30000,
      logger: false,
      
      onConnect: (session, callback) => this.handleConnect(session as SMTPSession, callback, 'mx'),
      onAuth: (auth, session, callback) => this.handleAuth(auth, session as SMTPSession, callback),
      onMailFrom: (address, session, callback) => this.handleMailFrom(address, session as SMTPSession, callback),
      onRcptTo: (address, session, callback) => this.handleRcptTo(address, session as SMTPSession, callback),
      onData: (stream, session, callback) => this.handleData(stream, session as SMTPSession, callback, 'mx')
    });

    // Servidor Submission (porta 587) - recebe emails de clientes autenticados
    this.submissionServer = new NodeSMTPServer({
      name: this.config.hostname,
      banner: `${this.config.hostname} ESMTP UltraZend Submission Server`,
      authMethods: ['PLAIN', 'LOGIN'],
      authOptional: !this.config.authRequired,
      maxClients: this.config.maxConnections,
      size: this.config.maxMessageSize,
      socketTimeout: 60000,
      closeTimeout: 30000,
      logger: false,
      
      onConnect: (session, callback) => this.handleConnect(session as SMTPSession, callback, 'submission'),
      onAuth: (auth, session, callback) => this.handleAuth(auth, session as SMTPSession, callback),
      onMailFrom: (address, session, callback) => this.handleMailFrom(address, session as SMTPSession, callback),
      onRcptTo: (address, session, callback) => this.handleRcptTo(address, session as SMTPSession, callback),
      onData: (stream, session, callback) => this.handleData(stream, session as SMTPSession, callback, 'submission')
    });

    logger.info('SMTP servers configured', {
      mxPort: this.config.mxPort,
      submissionPort: this.config.submissionPort
    });
  }

  /**
   * Manipula novas conexões
   */
  private async handleConnect(
    session: SMTPSession,
    callback: (err?: Error | null) => void,
    serverType: 'mx' | 'submission'
  ): Promise<void> {
    try {
      const remoteAddress = session.remoteAddress || 'unknown';
      
      logger.info('SMTP connection', {
        remoteAddress,
        serverType,
        sessionId: session.id
      });

      // Log da conexão
      await this.logConnection(remoteAddress, serverType, 'accepted');
      
      callback();

    } catch (error) {
      logger.error('Connection handler error', { error, serverType });
      callback(new Error('421 Temporary server error'));
    }
  }

  /**
   * Manipula autenticação
   */
  private async handleAuth(
    auth: any,
    session: SMTPSession,
    callback: (err?: Error | null, response?: any) => void
  ): Promise<void> {
    try {
      const username = auth.username;
      const password = auth.password;

      logger.info('SMTP authentication attempt', {
        username,
        method: auth.method,
        remoteAddress: session.remoteAddress
      });

      // Validar credenciais
      const user = await this.validateUserCredentials(username, password);
      if (!user) {
        await this.logAuthAttempt(username, session.remoteAddress!, false);
        return callback(new Error('535 Authentication failed'));
      }

      session.user = user;
      session.authenticated = true;
      
      await this.logAuthAttempt(username, session.remoteAddress!, true);
      
      logger.info('Authentication successful', { username, userId: user.id });
      callback(null, { user: user.id });

    } catch (error) {
      logger.error('Authentication error', { error });
      callback(new Error('421 Temporary server error'));
    }
  }

  /**
   * Manipula comando MAIL FROM
   */
  private async handleMailFrom(
    address: any,
    session: SMTPSession,
    callback: (err?: Error | null) => void
  ): Promise<void> {
    try {
      const senderEmail = address.address;
      
      logger.info('MAIL FROM', {
        sender: senderEmail,
        authenticated: session.authenticated,
        userId: session.user?.id
      });

      // Para servidor submission, verificar se usuário está autenticado
      if (!session.authenticated && this.config.authRequired) {
        return callback(new Error('530 Authentication required'));
      }

      callback();

    } catch (error) {
      logger.error('MAIL FROM error', { error });
      callback(new Error('421 Temporary server error'));
    }
  }

  /**
   * Manipula comando RCPT TO
   */
  private async handleRcptTo(
    address: any,
    session: SMTPSession,
    callback: (err?: Error | null) => void
  ): Promise<void> {
    try {
      const recipientEmail = address.address;
      
      logger.info('RCPT TO', {
        recipient: recipientEmail,
        authenticated: session.authenticated
      });

      // Para clientes autenticados, permitir qualquer destinatário
      if (session.authenticated) {
        return callback();
      }

      // Para MX, verificar se destinatário é local (implementar conforme necessário)
      callback();

    } catch (error) {
      logger.error('RCPT TO error', { error });
      callback(new Error('421 Temporary server error'));
    }
  }

  /**
   * Manipula dados do email
   */
  private async handleData(
    stream: any,
    session: SMTPSession,
    callback: (err?: Error | null) => void,
    serverType: 'mx' | 'submission'
  ): Promise<void> {
    try {
      logger.info('Processing email data', {
        serverType,
        authenticated: session.authenticated,
        userId: session.user?.id
      });

      // Parse do email
      const parsedEmail = await simpleParser(stream);
      
      if (serverType === 'submission' && session.authenticated) {
        // Email enviado por cliente autenticado - fazer entrega
        await this.processOutgoingEmail(parsedEmail, session);
      } else {
        // Email recebido via MX - processar entrada
        await this.processIncomingEmail(parsedEmail, session);
      }

      callback();

    } catch (error) {
      logger.error('Email processing error', { error, serverType });
      callback(new Error('421 Temporary server error'));
    }
  }

  /**
   * Processa email de saída (submission)
   */
  private async processOutgoingEmail(parsedEmail: ParsedMail, session: SMTPSession): Promise<void> {
    try {
      const messageId = generateMessageId(this.config.hostname);
      
      const emailData: EmailData = {
        messageId,
        from: parsedEmail.from?.text || '',
        to: parsedEmail.to?.text || '',
        subject: parsedEmail.subject || '',
        html: parsedEmail.html?.toString(),
        text: parsedEmail.text,
        headers: parsedEmail.headers as any
      };

      // Assinar com DKIM
      const signedEmail = await this.dkimManager.signEmail(emailData);
      
      // Entregar via MX
      const result = await this.deliveryService.deliverEmail(signedEmail);
      
      if (result.success) {
        logger.info('Outgoing email delivered', {
          messageId,
          to: emailData.to,
          mxServer: result.mxServer
        });
      } else {
        logger.error('Outgoing email delivery failed', {
          messageId,
          to: emailData.to,
          error: result.error
        });
      }

    } catch (error) {
      logger.error('Failed to process outgoing email', { error });
      throw error;
    }
  }

  /**
   * Processa email de entrada (MX)
   */
  private async processIncomingEmail(parsedEmail: ParsedMail, session: SMTPSession): Promise<void> {
    try {
      const messageId = parsedEmail.messageId || generateMessageId(this.config.hostname);
      
      // Registrar email recebido
      await this.db('emails').insert({
        message_id: messageId,
        from_email: parsedEmail.from?.text || '',
        to_email: parsedEmail.to?.text || '',
        subject: parsedEmail.subject || '',
        html_content: parsedEmail.html?.toString(),
        text_content: parsedEmail.text,
        status: 'delivered',
        direction: 'inbound',
        delivered_at: new Date()
      }).onConflict('message_id').ignore();

      logger.info('Incoming email received', {
        messageId,
        from: parsedEmail.from?.text,
        to: parsedEmail.to?.text,
        subject: parsedEmail.subject
      });

    } catch (error) {
      logger.error('Failed to process incoming email', { error });
      throw error;
    }
  }

  /**
   * Valida credenciais do usuário
   */
  private async validateUserCredentials(username: string, password: string): Promise<User | null> {
    try {
      const user = await this.db('users')
        .where('email', username)
        .where('is_active', true)
        .first();

      if (!user) {
        return null;
      }

      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return null;
      }

      return user;
    } catch (error) {
      logger.error('Error validating credentials', { error, username });
      return null;
    }
  }

  /**
   * Registra conexão
   */
  private async logConnection(
    remoteAddress: string,
    serverType: string,
    status: string
  ): Promise<void> {
    try {
      await this.db('smtp_connections').insert({
        remote_address: remoteAddress,
        server_type: serverType,
        status
      });
    } catch (error) {
      logger.error('Failed to log connection', { error });
    }
  }

  /**
   * Registra tentativa de autenticação
   */
  private async logAuthAttempt(
    username: string,
    remoteAddress: string,
    success: boolean
  ): Promise<void> {
    try {
      await this.db('auth_attempts').insert({
        username,
        remote_address: remoteAddress,
        success
      });
    } catch (error) {
      logger.error('Failed to log auth attempt', { error });
    }
  }

  /**
   * Inicia o servidor
   */
  async start(): Promise<void> {
    try {
      // Executar migrations
      await this.db.migrate.latest();
      logger.info('Database migrations completed');

      // Inicializar servidores
      this.initializeServers();

      // Iniciar servidor MX
      await new Promise<void>((resolve, reject) => {
        this.mxServer.listen(this.config.mxPort, (err?: Error) => {
          if (err) reject(err);
          else {
            logger.info(`MX Server listening on port ${this.config.mxPort}`);
            resolve();
          }
        });
      });

      // Iniciar servidor Submission
      await new Promise<void>((resolve, reject) => {
        this.submissionServer.listen(this.config.submissionPort, (err?: Error) => {
          if (err) reject(err);
          else {
            logger.info(`Submission Server listening on port ${this.config.submissionPort}`);
            resolve();
          }
        });
      });

      this.isRunning = true;
      
      logger.info('🚀 UltraZend SMTP Server started successfully!', {
        mxPort: this.config.mxPort,
        submissionPort: this.config.submissionPort,
        hostname: this.config.hostname,
        database: this.config.databasePath
      });

    } catch (error) {
      logger.error('Failed to start SMTP server', { error });
      throw error;
    }
  }

  /**
   * Para o servidor
   */
  async stop(): Promise<void> {
    try {
      if (this.mxServer) {
        await new Promise<void>((resolve) => {
          this.mxServer.close(() => {
            logger.info('MX Server stopped');
            resolve();
          });
        });
      }

      if (this.submissionServer) {
        await new Promise<void>((resolve) => {
          this.submissionServer.close(() => {
            logger.info('Submission Server stopped');
            resolve();
          });
        });
      }

      await this.deliveryService.close();
      await this.db.destroy();

      this.isRunning = false;
      logger.info('UltraZend SMTP Server stopped');

    } catch (error) {
      logger.error('Error stopping SMTP server', { error });
      throw error;
    }
  }

  /**
   * Obtém status do servidor
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      config: this.config,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Obtém banco de dados (para uso externo)
   */
  getDatabase(): knex.Knex {
    return this.db;
  }

  /**
   * Obtém gerenciador DKIM (para uso externo)
   */
  getDKIMManager(): DKIMManager {
    return this.dkimManager;
  }
}