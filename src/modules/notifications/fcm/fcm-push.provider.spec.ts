import { ConfigService } from '@nestjs/config';

const mockSend = jest.fn();
const mockGetMessaging = jest.fn((_app?: unknown) => ({ send: mockSend }));
const mockApp = { name: 'fcm-mock-app' };
const mockInitializeApp = jest.fn((_options?: unknown) => mockApp);
const mockGetApps = jest.fn(() => [] as unknown[]);
const mockCert = jest.fn((opts: unknown) => opts);

jest.mock('firebase-admin/app', () => ({
  initializeApp: (options: unknown) => mockInitializeApp(options),
  getApps: () => mockGetApps(),
  cert: (options: unknown) => mockCert(options),
}));

jest.mock('firebase-admin/messaging', () => ({
  getMessaging: (app: unknown) => mockGetMessaging(app),
}));

import { FcmPushProvider } from './fcm-push.provider';

function configService(
  vars: Record<string, string | undefined>,
): ConfigService {
  return { get: (key: string) => vars[key] } as unknown as ConfigService;
}

const configuredVars = {
  FCM_PROJECT_ID: 'proj-1',
  FCM_CLIENT_EMAIL: 'sa@proj-1.iam.gserviceaccount.com',
  FCM_PRIVATE_KEY:
    '-----BEGIN PRIVATE KEY-----\\nabc123\\n-----END PRIVATE KEY-----\\n',
};

describe('FcmPushProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetApps.mockReturnValue([]);
  });

  it('is a no-op when FCM credentials are not configured', async () => {
    const provider = new FcmPushProvider(
      configService({ FCM_PROJECT_ID: undefined }),
    );

    expect(provider.isConfigured()).toBe(false);
    expect(mockInitializeApp).not.toHaveBeenCalled();

    const result = await provider.send({
      token: 'device-token',
      title: 'Hello',
      body: 'World',
    });

    expect(result).toEqual({
      ok: false,
      status: 'SKIPPED_NOT_CONFIGURED',
      error: 'FCM credentials not configured',
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends a push and unwraps the literal \\n escapes in the private key', async () => {
    mockSend.mockResolvedValueOnce('projects/proj-1/messages/abc');
    const provider = new FcmPushProvider(configService(configuredVars));

    expect(provider.isConfigured()).toBe(true);
    expect(mockCert).toHaveBeenCalledWith(
      expect.objectContaining({
        privateKey:
          '-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----\n',
      }),
    );

    const result = await provider.send({
      token: 'device-token',
      title: 'Hello',
      body: 'World',
      data: { route: '/orders/1' },
    });

    expect(mockSend).toHaveBeenCalledWith({
      token: 'device-token',
      notification: { title: 'Hello', body: 'World' },
      data: { route: '/orders/1' },
    });
    expect(result).toEqual({
      ok: true,
      status: 'SENT',
      messageId: 'projects/proj-1/messages/abc',
    });
  });

  it('reports INVALID_TOKEN for an unregistered device token', async () => {
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error('Requested entity was not found.'), {
        code: 'messaging/registration-token-not-registered',
      }),
    );
    const provider = new FcmPushProvider(configService(configuredVars));

    const result = await provider.send({
      token: 'dead-token',
      title: 'Hello',
      body: 'World',
    });

    expect(result.status).toBe('INVALID_TOKEN');
    expect(result.ok).toBe(false);
  });

  it('reports FAILED for other send errors', async () => {
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error('Internal server error'), {
        code: 'messaging/internal-error',
      }),
    );
    const provider = new FcmPushProvider(configService(configuredVars));

    const result = await provider.send({
      token: 'some-token',
      title: 'Hello',
      body: 'World',
    });

    expect(result).toEqual({
      ok: false,
      status: 'FAILED',
      error: 'Internal server error',
    });
  });
});
