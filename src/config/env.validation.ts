import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

function toInt(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

class EnvironmentVariables {
  @IsEnum(NodeEnv)
  @IsOptional()
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Transform(({ value }) => toInt(value, 3000))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  @IsOptional()
  PORT = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX = 'api';

  @IsString()
  @IsOptional()
  API_VERSION = '1';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  /** true | false | require | omit (auto-detect Render) */
  @IsString()
  @IsOptional()
  DATABASE_SSL?: string;

  @IsString()
  @IsNotEmpty()
  JWT_ACCESS_SECRET!: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN = '30d';

  @Transform(({ value }) => toInt(value, 12))
  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(20)
  @IsOptional()
  BCRYPT_ROUNDS = 12;

  @IsString()
  @IsOptional()
  CORS_ORIGINS = 'http://localhost:5173';

  @IsString()
  @IsOptional()
  DEFAULT_TIMEZONE = 'Asia/Kolkata';

  @IsString()
  @IsOptional()
  LOG_LEVEL = 'debug';

  @IsString()
  @IsOptional()
  AUTO_APPROVE_FARMS = 'false';
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const messages = errors
      .map((e) => Object.values(e.constraints || {}).join(', '))
      .join('; ');
    throw new Error(`Environment validation failed: ${messages}`);
  }
  return validated;
}
