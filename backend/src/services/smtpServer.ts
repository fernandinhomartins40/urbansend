import { SMTPServer } from 'smtp-server';
import { simpleParser, ParsedMail } from 'mailparser';
import bcrypt from 'bcrypt';
import { logger } from '../config/logger';
import { Env } from '../utils/env';
import db from '../config/database';

class UltraZendSMTPServer {
  private server: SMTPServer;
  private port: number;

  constructor() {
    this.port = Env.getNumber('SMTP_SERVER_PORT', 25);
    this.server = new SMTPServer({
      name: Env.get('SMTP_HOSTNAME', 'www.ultrazend.com.br'),
      banner: 'UltraZend SMTP Server Ready',
      authOptional: Env.isDevelopment, // Require auth in production
      authMethods: ['PLAIN', 'LOGIN'], // Secure auth methods only
      onAuth: this.handleAuth.bind(this),
      onConnect: this.handleConnect.bind(this),
      onData: this.handleData.bind(this),
      logger: false, // Use our own logger
      secure: false, // Don't force TLS - let client decide
      allowInsecureAuth: true, // Allow insecure auth for local emails
      maxClients: Env.getNumber('SMTP_MAX_CLIENTS', 100)
    });
  }

  private handleConnect(session: any, callback: Function) {
    logger.info('SMTP connection established', {
      remoteAddress: session.remoteAddress,
      clientHostname: session.clientHostname
    });
    return callback();
  }

  private async handleAuth(auth: any, session: any, callback: Function) {
    try {
      logger.info('SMTP auth attempt', {
        username: auth.username,
        method: auth.method,
        remoteAddress: session.remoteAddress
      });

      if (!auth.username || !auth.password) {
        logger.warn('SMTP auth failed: missing credentials', {
          remoteAddress: session.remoteAddress
        });
        return callback(new Error('Username and password required'));
      }

      // Allow internal system accounts with proper authentication
      if (await this.authenticateSystemUser(auth.username, auth.password)) {
        logger.info('SMTP system user authenticated', { username: auth.username });
        return callback(null, { user: auth.username });
      }

      // Authenticate regular users against database
      const user = await this.authenticateUser(auth.username, auth.password);
      if (user) {
        logger.info('SMTP user authenticated successfully', { 
          userId: user.id, 
          username: auth.username 
        });
        return callback(null, { user: user.id, email: user.email });
      }

      logger.warn('SMTP auth failed: invalid credentials', {
        username: auth.username,
        remoteAddress: session.remoteAddress
      });
      return callback(new Error('Invalid username or password'));

    } catch (error) {
      logger.error('SMTP auth error', { error, username: auth.username });
      return callback(new Error('Authentication failed'));
    }
  }

  private async authenticateSystemUser(username: string, password: string): Promise<boolean> {
    // Define system accounts and their hashed passwords
    const systemAccounts = {
      'system': process.env.SMTP_SYSTEM_PASSWORD,
      'noreply': process.env.SMTP_NOREPLY_PASSWORD
    };

    if (!systemAccounts[username] || !password) {
      return false;
    }

    try {
      // In production, use hashed passwords. In development, allow plain text for convenience
      if (Env.isProduction) {
        return await bcrypt.compare(password, systemAccounts[username]);
      } else {
        return password === systemAccounts[username];
      }
    } catch (error) {
      logger.error('System user auth error', { error, username });
      return false;
    }
  }

  private async authenticateUser(username: string, password: string): Promise<any | null> {
    try {
      // Look up user by email (SMTP username is typically email)
      const user = await db('users')
        .select('id', 'email', 'password_hash', 'is_verified')
        .where('email', username)
        .first();

      if (!user) {
        return null;
      }

      if (!user.is_verified) {
        logger.warn('SMTP auth failed: user not verified', { email: username });
        return null;
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      if (!isValidPassword) {
        return null;
      }

      return user;
    } catch (error) {
      logger.error('User authentication error', { error, username });
      return null;
    }
  }

  private async handleData(stream: any, session: any, callback: Function) {
    try {
      logger.info('SMTP receiving email data', {
        from: session.envelope.mailFrom?.address,
        to: session.envelope.rcptTo?.map((r: any) => r.address),
        remoteAddress: session.remoteAddress
      });

      // Parse the email
      const parsed: ParsedMail = await simpleParser(stream);
      
      // Process the email through our email service
      await this.processIncomingEmail(parsed, session);
      
      logger.info('SMTP email processed successfully', {
        messageId: parsed.messageId,
        subject: parsed.subject
      });
      
      callback();
    } catch (error) {
      logger.error('SMTP email processing failed', { error });
      callback(new Error('Failed to process email'));
    }
  }

  private async processIncomingEmail(email: ParsedMail, _session: any) {
    // This handles incoming emails to our SMTP server
    // For outbound emails, we'll use a different mechanism
    logger.info('Processing incoming email', {
      from: email.from,
      to: email.to,
      subject: email.subject,
      messageId: email.messageId
    });

    // TODO: Route incoming emails to appropriate handlers
    // For now, just log them as this is primarily an outbound server
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (err?: Error) => {
        if (err) {
          logger.error('Failed to start SMTP server', { error: err, port: this.port });
          reject(err);
        } else {
          logger.info('🚀 UltraZend SMTP Server started', {
            port: this.port,
            hostname: Env.get('SMTP_HOSTNAME', 'www.ultrazend.com.br')
          });
          resolve();
        }
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info('SMTP server stopped');
        resolve();
      });
    });
  }
}

export default UltraZendSMTPServer;