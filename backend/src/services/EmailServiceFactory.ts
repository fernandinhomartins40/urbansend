// Temporary stub while inversify dependency issues are resolved

export const TYPES = {
  EmailService: Symbol.for('EmailService'),
  SMTPDeliveryService: Symbol.for('SMTPDeliveryService'),  
  QueueService: Symbol.for('QueueService')
};

export class EmailServiceFactory {
  public static initialize() {
    // Temporarily disabled - will be restored once inversify dependencies are resolved
    console.log('EmailServiceFactory stub initialized (temporarily disabled)');
  }
  
  public static getService<T>(serviceIdentifier: symbol): T {
    throw new Error('EmailServiceFactory temporarily disabled due to dependency issues');
  }
}