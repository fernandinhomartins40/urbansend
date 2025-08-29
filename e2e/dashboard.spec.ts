import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login before each test
    await page.goto('/login')
    await page.fill('[data-testid="email-input"]', 'test@example.com')
    await page.fill('[data-testid="password-input"]', 'password123')
    await page.click('[data-testid="login-button"]')
    await expect(page).toHaveURL('/app')
  })

  test('should display dashboard stats', async ({ page }) => {
    // Check for main dashboard elements
    await expect(page.locator('h1')).toContainText('Dashboard')
    
    // Check for stats cards
    await expect(page.locator('[data-testid="total-emails-card"]')).toBeVisible()
    await expect(page.locator('[data-testid="delivery-rate-card"]')).toBeVisible()
    await expect(page.locator('[data-testid="open-rate-card"]')).toBeVisible()
    await expect(page.locator('[data-testid="bounce-rate-card"]')).toBeVisible()
  })

  test('should display recent activity', async ({ page }) => {
    // Check for recent activity section
    await expect(page.locator('[data-testid="recent-activity"]')).toBeVisible()
    
    // Should have activity items or empty state
    const activityItems = page.locator('[data-testid="activity-item"]')
    const emptyState = page.locator('[data-testid="no-activity"]')
    
    const hasActivity = await activityItems.count() > 0
    const hasEmptyState = await emptyState.isVisible()
    
    expect(hasActivity || hasEmptyState).toBeTruthy()
  })

  test('should refresh data when refresh button is clicked', async ({ page }) => {
    // Wait for initial load
    await page.waitForLoadState('networkidle')
    
    // Click refresh button
    await page.click('[data-testid="refresh-button"]')
    
    // Should show loading state briefly
    await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible()
    await page.waitForLoadState('networkidle')
  })

  test('should show error boundary on component errors', async ({ page }) => {
    // Simulate a component error by navigating to a broken state
    await page.evaluate(() => {
      // Force an error in React component
      throw new Error('Simulated component error')
    })
    
    // Error boundary should catch it
    await expect(page.locator('text=Oops! Algo deu errado')).toBeVisible()
    await expect(page.locator('text=Tentar Novamente')).toBeVisible()
  })

  test('should handle polling updates', async ({ page }) => {
    // Mock network responses to simulate data updates
    await page.route('/api/analytics/overview', route => {
      route.fulfill({
        json: {
          data: {
            stats: {
              totalEmails: 1500, // Different value
              deliveryRate: 96.2,
              openRate: 25.1,
              bounceRate: 1.8,
              emailsChange: 15.5,
              deliveryChange: 3.1,
              openChange: 0.8,
              bounceChange: -0.3
            }
          }
        }
      })
    })
    
    // Wait for polling to trigger
    await page.waitForTimeout(32000) // Wait for polling interval
    
    // Should update with new data
    await expect(page.locator('[data-testid="total-emails-value"]')).toContainText('1500')
  })
})