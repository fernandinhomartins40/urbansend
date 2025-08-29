import { Router, Request, Response } from 'express';
import DKIMService from '../services/dkimService';
import { Env } from '../utils/env';
import { logger } from '../config/logger';

const router = Router();

/**
 * @swagger
 * /dns/configuration:
 *   get:
 *     summary: Get DNS configuration for email authentication
 *     description: Returns the SPF and DKIM DNS records needed for email authentication
 *     tags: [DNS]
 *     responses:
 *       200:
 *         description: DNS configuration retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spf:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     value:
 *                       type: string
 *                     type:
 *                       type: string
 *                 dkim:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     value:
 *                       type: string
 *                     type:
 *                       type: string
 *                 domain:
 *                   type: string
 *                 serverIp:
 *                   type: string
 *       500:
 *         description: Internal server error
 */
router.get('/configuration', async (_req: Request, res: Response) => {
  try {
    const dkimService = new DKIMService();
    const domain = Env.get('SMTP_HOSTNAME', 'www.urbanmail.com.br');
    const serverIp = Env.get('SERVER_IP', '72.60.10.112');

    // Configuração SPF
    const spfRecord = {
      name: domain,
      type: 'TXT',
      value: `v=spf1 ip4:${serverIp} ~all`,
      description: 'SPF record to authorize this server to send emails'
    };

    // Configuração DKIM
    const dkimRecord = dkimService.getDNSRecord();
    const dkimConfiguration = {
      name: dkimRecord.name,
      type: 'TXT',
      value: dkimRecord.value,
      description: 'DKIM public key for email signature verification'
    };

    // DMARC record (opcional mas recomendado)
    const dmarcRecord = {
      name: `_dmarc.${domain}`,
      type: 'TXT',
      value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@' + domain,
      description: 'DMARC policy for email authentication'
    };

    logger.info('DNS configuration requested', {
      domain,
      serverIp,
      spf: spfRecord.value,
      dkim: dkimConfiguration.name
    });

    res.json({
      success: true,
      data: {
        domain,
        serverIp,
        spf: spfRecord,
        dkim: dkimConfiguration,
        dmarc: dmarcRecord,
        instructions: [
          '1. Add the SPF record to authorize this server to send emails',
          '2. Add the DKIM record to enable email signature verification',
          '3. Add the DMARC record to set email authentication policy',
          '4. Wait for DNS propagation (up to 24-48 hours)',
          '5. Test email delivery after DNS records are active'
        ]
      }
    });

  } catch (error) {
    logger.error('Failed to generate DNS configuration', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to generate DNS configuration'
    });
  }
});

/**
 * @swagger
 * /dns/verify:
 *   get:
 *     summary: Verify DNS configuration
 *     description: Check if the required DNS records are properly configured
 *     tags: [DNS]
 *     responses:
 *       200:
 *         description: DNS verification results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spf:
 *                   type: object
 *                   properties:
 *                     configured:
 *                       type: boolean
 *                     record:
 *                       type: string
 *                 dkim:
 *                   type: object
 *                   properties:
 *                     configured:
 *                       type: boolean
 *                     record:
 *                       type: string
 *       500:
 *         description: Internal server error
 */
router.get('/verify', async (_req: Request, res: Response) => {
  try {
    const dns = require('dns').promises;
    const domain = Env.get('SMTP_HOSTNAME', 'www.urbanmail.com.br');
    const dkimService = new DKIMService();
    const dkimRecord = dkimService.getDNSRecord();

    const results = {
      spf: { configured: false, record: '' },
      dkim: { configured: false, record: '' }
    };

    try {
      // Verificar SPF
      const spfRecords = await dns.resolveTxt(domain);
      for (const record of spfRecords) {
        const txtRecord = record.join('');
        if (txtRecord.includes('v=spf1')) {
          results.spf.configured = true;
          results.spf.record = txtRecord;
          break;
        }
      }
    } catch (error) {
      logger.warn('SPF record not found', { domain });
    }

    try {
      // Verificar DKIM
      const dkimRecords = await dns.resolveTxt(dkimRecord.name);
      for (const record of dkimRecords) {
        const txtRecord = record.join('');
        if (txtRecord.includes('v=DKIM1')) {
          results.dkim.configured = true;
          results.dkim.record = txtRecord;
          break;
        }
      }
    } catch (error) {
      logger.warn('DKIM record not found', { dkimRecord: dkimRecord.name });
    }

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    logger.error('Failed to verify DNS configuration', { error });
    res.status(500).json({
      success: false,
      message: 'Failed to verify DNS configuration'
    });
  }
});

export default router;