import 'dotenv/config';
import { DataSource } from 'typeorm';
import { resolvePostgresSsl } from '../common/utils/postgres-ssl.util';

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
  ssl: resolvePostgresSsl(process.env.DATABASE_URL, process.env.DATABASE_SSL),
});
