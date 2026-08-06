import { registerAs } from '@nestjs/config';
import { resolvePostgresSsl } from '../common/utils/postgres-ssl.util';

export default registerAs('database', () => ({
  url: process.env.DATABASE_URL,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  ssl: resolvePostgresSsl(process.env.DATABASE_URL, process.env.DATABASE_SSL),
}));
