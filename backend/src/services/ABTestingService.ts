/**
 * ABTestingService - Sistema Completo de A/B Testing
 * 
 * FUNCIONALIDADES:
 * - Criação e gestão de testes A/B
 * - Divisão automática de tráfego
 * - Análise estatística com significância
 * - Declaração automática de vencedor
 */

import db from '../config/database'
import { logger } from '../config/logger'

interface ABTestConfig {
  name: string
  description?: string
  test_type: 'subject' | 'content' | 'sender' | 'template'
  traffic_split: number
  winner_criteria: 'open_rate' | 'click_rate' | 'conversion_rate'
  confidence_level: 90 | 95 | 99
  min_sample_size: number
  test_duration_hours: number
  variant_a: any
  variant_b: any
}

interface ABTestResults {
  test_id: number
  variant_a: VariantResults
  variant_b: VariantResults
  winner: 'A' | 'B' | null
  significance: 'significant' | 'not_significant'
  p_value: number
  confidence_level: number
}

interface VariantResults {
  emails_sent: number
  opens: number
  clicks: number
  conversions: number
  open_rate: number
  click_rate: number
  conversion_rate: number
}

export class ABTestingService {
  private static instance: ABTestingService

  public static getInstance(): ABTestingService {
    if (!ABTestingService.instance) {
      ABTestingService.instance = new ABTestingService()
    }
    return ABTestingService.instance
  }

  /**
   * Criar teste A/B
   */
  async createABTest(userId: number, config: ABTestConfig) {
    try {
      return await db.transaction(async (trx) => {
        // Criar teste
        const [testId] = await trx('email_ab_tests').insert({
          user_id: userId,
          name: config.name,
          description: config.description,
          test_type: config.test_type,
          traffic_split: config.traffic_split,
          winner_criteria: config.winner_criteria,
          confidence_level: config.confidence_level,
          min_sample_size: config.min_sample_size,
          test_duration_hours: config.test_duration_hours,
          status: 'draft',
          created_at: new Date(),
          updated_at: new Date()
        })

        // Criar variantes A e B
        await trx('email_ab_variants').insert([
          {
            ab_test_id: testId,
            variant_name: 'A',
            subject: config.variant_a.subject,
            from_email: config.variant_a.from_email,
            template_id: config.variant_a.template_id,
            content_changes: JSON.stringify(config.variant_a.content_changes || {})
          },
          {
            ab_test_id: testId,
            variant_name: 'B',
            subject: config.variant_b.subject,
            from_email: config.variant_b.from_email,
            template_id: config.variant_b.template_id,
            content_changes: JSON.stringify(config.variant_b.content_changes || {})
          }
        ])

        return await this.getABTest(testId, userId)
      })

    } catch (error) {
      logger.error('Erro ao criar teste A/B:', error)
      throw new Error('Falha ao criar teste A/B')
    }
  }

  /**
   * Iniciar teste A/B
   */
  async startABTest(testId: number, userId: number) {
    try {
      const test = await this.getABTest(testId, userId)
      
      if (test.status !== 'draft') {
        throw new Error('Apenas testes em rascunho podem ser iniciados')
      }

      await db('email_ab_tests')
        .where('id', testId)
        .where('user_id', userId)
        .update({
          status: 'running',
          started_at: new Date(),
          updated_at: new Date()
        })

      // Agendar verificação automática de resultados
      setTimeout(() => this.checkTestResults(testId), test.test_duration_hours * 60 * 60 * 1000)

      logger.info('Teste A/B iniciado:', { testId, userId })

    } catch (error) {
      logger.error('Erro ao iniciar teste A/B:', error)
      throw error
    }
  }

  /**
   * Registrar resultado do teste (email enviado)
   */
  async recordEmailSent(testId: number, emailId: number, recipientEmail: string) {
    try {
      const test = await db('email_ab_tests').where('id', testId).first()
      if (!test || test.status !== 'running') return

      // Determinar variante baseada no split de tráfego
      const variant = Math.random() * 100 < test.traffic_split ? 'A' : 'B'

      await db('ab_test_results').insert({
        ab_test_id: testId,
        email_id: emailId,
        variant_name: variant,
        recipient_email: recipientEmail,
        sent_at: new Date()
      })

      // Atualizar contador de emails enviados
      await db('email_ab_variants')
        .where('ab_test_id', testId)
        .where('variant_name', variant)
        .increment('emails_sent', 1)

    } catch (error) {
      logger.error('Erro ao registrar email no teste A/B:', error)
    }
  }

  /**
   * Registrar evento de abertura
   */
  async recordOpen(emailId: number) {
    try {
      await db('ab_test_results')
        .where('email_id', emailId)
        .whereNull('opened_at')
        .update({
          opened_at: new Date()
        })
    } catch (error) {
      logger.error('Erro ao registrar abertura no A/B test:', error)
    }
  }

  /**
   * Registrar evento de clique
   */
  async recordClick(emailId: number) {
    try {
      await db('ab_test_results')
        .where('email_id', emailId)
        .whereNull('clicked_at')
        .update({
          clicked_at: new Date()
        })
    } catch (error) {
      logger.error('Erro ao registrar clique no A/B test:', error)
    }
  }

  /**
   * Analisar resultados do teste
   */
  async analyzeResults(testId: number, userId: number): Promise<ABTestResults> {
    try {
      const [test, variants] = await Promise.all([
        db('email_ab_tests').where('id', testId).where('user_id', userId).first(),
        db('email_ab_variants').where('ab_test_id', testId)
      ])

      if (!test) throw new Error('Teste não encontrado')

      const [variantA, variantB] = variants

      const results: ABTestResults = {
        test_id: testId,
        variant_a: {
          emails_sent: variantA.emails_sent,
          opens: variantA.opens,
          clicks: variantA.clicks,
          conversions: variantA.conversions,
          open_rate: variantA.open_rate,
          click_rate: variantA.click_rate,
          conversion_rate: variantA.conversion_rate
        },
        variant_b: {
          emails_sent: variantB.emails_sent,
          opens: variantB.opens,
          clicks: variantB.clicks,
          conversions: variantB.conversions,
          open_rate: variantB.open_rate,
          click_rate: variantB.click_rate,
          conversion_rate: variantB.conversion_rate
        },
        winner: test.winner_variant || null,
        significance: test.significance_achieved ? 'significant' : 'not_significant',
        p_value: test.p_value || 1.0,
        confidence_level: test.confidence_level
      }

      // Calcular significância estatística se ainda não calculada
      if (!test.significance_achieved && this.hasMinimumSampleSize(results, test.min_sample_size)) {
        const significance = this.calculateStatisticalSignificance(results, test.winner_criteria, test.confidence_level)
        
        if (significance.isSignificant) {
          await db('email_ab_tests')
            .where('id', testId)
            .update({
              winner_variant: significance.winner,
              significance_achieved: true,
              p_value: significance.pValue,
              status: 'completed',
              completed_at: new Date(),
              updated_at: new Date()
            })

          results.winner = significance.winner
          results.significance = 'significant'
          results.p_value = significance.pValue
        }
      }

      return results

    } catch (error) {
      logger.error('Erro ao analisar resultados:', error)
      throw error
    }
  }

  /**
   * Obter teste A/B
   */
  async getABTest(testId: number, userId: number) {
    try {
      const [test, variants] = await Promise.all([
        db('email_ab_tests').where('id', testId).where('user_id', userId).first(),
        db('email_ab_variants').where('ab_test_id', testId).orderBy('variant_name')
      ])

      if (!test) throw new Error('Teste não encontrado')

      return {
        ...test,
        variants
      }

    } catch (error) {
      logger.error('Erro ao buscar teste A/B:', error)
      throw error
    }
  }

  /**
   * Listar testes do usuário
   */
  async getUserABTests(userId: number, page: number = 1, limit: number = 20) {
    try {
      const offset = (page - 1) * limit

      const [tests, totalCount] = await Promise.all([
        db('email_ab_tests')
          .where('user_id', userId)
          .orderBy('created_at', 'desc')
          .limit(limit)
          .offset(offset),
        
        db('email_ab_tests')
          .where('user_id', userId)
          .count('* as total')
          .first()
      ])

      return {
        tests,
        pagination: {
          current_page: page,
          per_page: limit,
          total_count: totalCount.total,
          total_pages: Math.ceil(Number(totalCount.total) / limit),
          has_next: page < Math.ceil(Number(totalCount.total) / limit),
          has_prev: page > 1
        }
      }

    } catch (error) {
      logger.error('Erro ao listar testes A/B:', error)
      throw error
    }
  }

  /**
   * Parar teste manualmente
   */
  async stopABTest(testId: number, userId: number) {
    try {
      await db('email_ab_tests')
        .where('id', testId)
        .where('user_id', userId)
        .where('status', 'running')
        .update({
          status: 'stopped',
          completed_at: new Date(),
          updated_at: new Date()
        })

      logger.info('Teste A/B parado manualmente:', { testId, userId })

    } catch (error) {
      logger.error('Erro ao parar teste A/B:', error)
      throw error
    }
  }

  /**
   * Verificar resultados automaticamente
   */
  private async checkTestResults(testId: number) {
    try {
      const test = await db('email_ab_tests').where('id', testId).first()
      if (!test || test.status !== 'running') return

      // Verificar se deve completar por tempo
      const now = new Date()
      const startTime = new Date(test.started_at)
      const elapsedHours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60)

      if (elapsedHours >= test.test_duration_hours) {
        await this.analyzeResults(testId, test.user_id)
      }

    } catch (error) {
      logger.error('Erro na verificação automática:', error)
    }
  }

  /**
   * Calcular significância estatística
   */
  private calculateStatisticalSignificance(results: ABTestResults, criteria: string, confidenceLevel: number) {
    const variantA = results.variant_a
    const variantB = results.variant_b

    // Obter métrica baseada no critério
    const getMetric = (variant: VariantResults) => {
      switch (criteria) {
        case 'open_rate': return variant.open_rate / 100
        case 'click_rate': return variant.click_rate / 100
        case 'conversion_rate': return variant.conversion_rate / 100
        default: return variant.open_rate / 100
      }
    }

    const pA = getMetric(variantA)
    const pB = getMetric(variantB)
    const nA = variantA.emails_sent
    const nB = variantB.emails_sent

    // Teste Z para proporções
    const pooledP = ((pA * nA) + (pB * nB)) / (nA + nB)
    const standardError = Math.sqrt(pooledP * (1 - pooledP) * ((1 / nA) + (1 / nB)))
    
    const zScore = Math.abs(pA - pB) / standardError
    
    // Converter nível de confiança para z-crítico
    const zCritical = confidenceLevel === 99 ? 2.576 : 
                      confidenceLevel === 95 ? 1.96 : 1.645

    const isSignificant = zScore > zCritical
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore))) // P-value bilateral

    return {
      isSignificant,
      winner: pA > pB ? 'A' as const : 'B' as const,
      pValue,
      zScore
    }
  }

  /**
   * Função de distribuição cumulativa normal (aproximação)
   */
  private normalCDF(x: number): number {
    return 0.5 * (1 + this.erf(x / Math.sqrt(2)))
  }

  /**
   * Função erro (aproximação de Abramowitz e Stegun)
   */
  private erf(x: number): number {
    const a1 =  0.254829592
    const a2 = -0.284496736
    const a3 =  1.421413741
    const a4 = -1.453152027
    const a5 =  1.061405429
    const p  =  0.3275911

    const sign = x >= 0 ? 1 : -1
    x = Math.abs(x)

    const t = 1.0 / (1.0 + p * x)
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x)

    return sign * y
  }

  /**
   * Verificar se tem tamanho mínimo de amostra
   */
  private hasMinimumSampleSize(results: ABTestResults, minSize: number): boolean {
    return results.variant_a.emails_sent >= minSize && results.variant_b.emails_sent >= minSize
  }
}

export default ABTestingService.getInstance()