import { SMTPServer } from 'smtp-server';
import { simpleParser, ParsedMail } from 'mailparser';
import { logger } from '../config/logger';
import { Env } from '../utils/env';

class UrbanSendSMTPServer {
  private server: SMTPServer;
  private port: number;

  constructor() {
    this.port = Env.getNumber('SMTP_SERVER_PORT', 25);
    this.server = new SMTPServer({
      name: Env.get('SMTP_HOSTNAME', 'www.urbanmail.com.br'),
      banner: 'UrbanMail SMTP Server Ready',
      authOptional: true, // Allow unauthenticated emails for internal use
      onAuth: this.handleAuth.bind(this),
      onConnect: this.handleConnect.bind(this),
      onData: this.handleData.bind(this),
      logger: false, // Use our own logger
      secure: false, // Start with plain, upgrade to TLS if needed
      allowInsecureAuth: true,
    });
  }

  private handleConnect(session: any, callback: Function) {
    logger.info('SMTP connection established', {
      remoteAddress: session.remoteAddress,
      clientHostname: session.clientHostname
    });
    return callback();
  }

  private handleAuth(auth: any, _session: any, callback: Function) {
    // For now, accept any authentication for internal system
    logger.info('SMTP auth attempt', {
      username: auth.username,
      method: auth.method
    });
    
    // Accept internal system emails without authentication
    if (auth.username === 'system' || auth.username === 'noreply') {
      return callback(null, { user: auth.username });
    }
    
    // TODO: Implement proper authentication against users table
    return callback(null, { user: auth.username });
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
          logger.info('🚀 UrbanMail SMTP Server started', {
            port: this.port,
            hostname: Env.get('SMTP_HOSTNAME', 'www.urbanmail.com.br')
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

export default UrbanSendSMTPServer;