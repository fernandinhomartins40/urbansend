import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId: string;
  correlationId: string;
  userId?: string;
  userEmail?: string;
  method?: string;
  path?: string;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const requestContextService = {
  run<T>(context: RequestContext, callback: () => T): T {
    return storage.run(context, callback);
  },

  get(): RequestContext | undefined {
    return storage.getStore();
  },

  update(patch: Partial<RequestContext>): void {
    const currentContext = storage.getStore();
    if (!currentContext) {
      return;
    }

    Object.assign(currentContext, patch);
  }
};
