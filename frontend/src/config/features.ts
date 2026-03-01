import { api } from '../lib/api'

export interface FrontendFeatureFlags {
  USE_INTEGRATED_EMAIL_SEND: boolean
  ROLLOUT_PERCENTAGE: number
  ENABLE_MIGRATION_MONITORING: boolean
  USER_IN_ROLLOUT: boolean
  ROLLOUT_PHASE: string
}

let featureFlagsCache: FrontendFeatureFlags | null = null
let lastFlagsFetch = 0
const FLAGS_CACHE_TTL = 60_000

const fallbackFlags: FrontendFeatureFlags = {
  USE_INTEGRATED_EMAIL_SEND: true,
  ROLLOUT_PERCENTAGE: 100,
  ENABLE_MIGRATION_MONITORING: false,
  USER_IN_ROLLOUT: true,
  ROLLOUT_PHASE: 'STABLE',
}

export async function getFeatureFlags(): Promise<FrontendFeatureFlags> {
  const now = Date.now()

  if (featureFlagsCache && now - lastFlagsFetch < FLAGS_CACHE_TTL) {
    return featureFlagsCache
  }

  try {
    const response = await api.get('/feature-flags')
    featureFlagsCache = {
      ...fallbackFlags,
      ...response.data,
    }
    lastFlagsFetch = now
    return featureFlagsCache
  } catch {
    featureFlagsCache = fallbackFlags
    lastFlagsFetch = now
    return fallbackFlags
  }
}

export async function shouldUseIntegratedEmailSend(): Promise<boolean> {
  const flags = await getFeatureFlags()
  return flags.USER_IN_ROLLOUT && flags.USE_INTEGRATED_EMAIL_SEND
}

export function clearFeatureFlagsCache() {
  featureFlagsCache = null
  lastFlagsFetch = 0
}
