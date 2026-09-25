import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface FcmPushPayload {
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface FcmPushResult {
  ok: boolean;
  status: 'SENT' | 'SKIPPED_NOT_CONFIGURED' | 'FAILED' | 'INVALID_TOKEN';
  error?: string;
  messageId?: string;
}

/** FCM error codes that mean the token itself is dead and should be dropped. */
const INVALID_TOKEN_ERROR_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * FCM adapter. When Firebase credentials are missing, reports
 * SKIPPED_NOT_CONFIGURED without pretending push was delivered.
 */
@Injectable()
export class FcmPushProvider {
  private readonly logger = new Logger(FcmPushProvider.name);
  private readonly app: App | null;

  constructor(private readonly config: ConfigService) {
    this.app = this.initializeApp();
  }

  private initializeApp(): App | null {
    const projectId = this.config.get<string>('FCM_PROJECT_ID');
    const clientEmail = this.config.get<string>('FCM_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FCM_PRIVATE_KEY');
    if (!projectId || !clientEmail || !privateKey) {
      this.logger.warn('FCM not configured, push disabled');
      return null;
    }
    try {
      const existing = getApps();
      if (existing.length) {
        return existing[0];
      }
      return initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          // .env values carry literal "\n" escapes instead of real newlines.
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to initialize Firebase Admin app: ${message}`);
      return null;
    }
  }

  isConfigured(): boolean {
    return this.app !== null;
  }

  async send(payload: FcmPushPayload): Promise<FcmPushResult> {
    if (!this.app) {
      this.logger.debug(
        `FCM not configured — skipping push for token …${payload.token.slice(-8)}`,
      );
      return {
        ok: false,
        status: 'SKIPPED_NOT_CONFIGURED',
        error: 'FCM credentials not configured',
      };
    }

    try {
      const messageId = await getMessaging(this.app).send({
        token: payload.token,
        notification: { title: payload.title, body: payload.body },
        data: payload.data,
      });
      return { ok: true, status: 'SENT', messageId };
    } catch (err) {
      const code = (err as { code?: string } | undefined)?.code;
      const message = err instanceof Error ? err.message : String(err);
      if (code && INVALID_TOKEN_ERROR_CODES.has(code)) {
        return { ok: false, status: 'INVALID_TOKEN', error: message };
      }
      return { ok: false, status: 'FAILED', error: message };
    }
  }
}
