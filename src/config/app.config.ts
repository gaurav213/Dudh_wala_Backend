import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: process.env.API_PREFIX || 'api',
  apiVersion: process.env.API_VERSION || '1',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata',
  logLevel: process.env.LOG_LEVEL || 'debug',
  autoApproveFarms:
    (process.env.AUTO_APPROVE_FARMS || 'false').toLowerCase() === 'true',
  deliveryEditWindowMinutes: parseInt(
    process.env.DELIVERY_EDIT_WINDOW_MINUTES || '60',
    10,
  ),
}));
