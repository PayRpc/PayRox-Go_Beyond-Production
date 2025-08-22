// src/utils/errors.ts
export class NetworkError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
  }
}

export function logInfo(msg: string, ...rest: any[]) {
  console.log(msg, ...rest);
}

export function logSuccess(msg: string, ...rest: any[]) {
  console.log(msg, ...rest);
}

export function logWarning(msg: string, ...rest: any[]) {
  console.warn(msg, ...rest);
}

export function logError(err: unknown, context?: string) {
  const msg = err instanceof Error ? err.message : String(err);
  if (context) {
    console.error(`[${context}]`, msg);
  } else {
    console.error(msg);
  }
}
