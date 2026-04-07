import { LoggerService } from '@nestjs/common';

/**
 * One JSON object per line on stdout for production (Datadog, Cloud Logging, etc.).
 */
export class JsonProductionLogger implements LoggerService {
  private print(level: string, message: unknown, context?: string) {
    const msg =
      typeof message === 'string'
        ? message.slice(0, 4000)
        : message === undefined || message === null
          ? ''
          : String(message).slice(0, 4000);
    console.log(
      JSON.stringify({
        level,
        ts: new Date().toISOString(),
        context: context ?? 'Application',
        msg,
      }),
    );
  }

  log(message: any, context?: string) {
    this.print('info', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    this.print('error', message, context);
    if (trace && process.env.NODE_ENV !== 'production') {
      console.error(trace.split('\n').slice(0, 15).join('\n'));
    }
  }

  warn(message: any, context?: string) {
    this.print('warn', message, context);
  }

  debug(message: any, context?: string) {
    this.print('debug', message, context);
  }

  verbose(message: any, context?: string) {
    this.print('verbose', message, context);
  }
}
