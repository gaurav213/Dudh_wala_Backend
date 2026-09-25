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

  /** Minutes after deliveredAt during which delivery staff may edit. */
  @Transform(({ value }) => toInt(value, 60))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10080)
  @IsOptional()
  DELIVERY_EDIT_WINDOW_MINUTES = 60;

  /** Firebase Cloud Messaging — optional; push skipped when unset */
  @IsString()
  @IsOptional()
  FCM_PROJECT_ID?: string;

  @IsString()
  @IsOptional()
  FCM_CLIENT_EMAIL?: string;

  /** PEM private key; use \n escapes in .env */
  @IsString()
  @IsOptional()
  FCM_PRIVATE_KEY?: string;
}

const WEAK_SECRET = /change_me|replace_with|replace_me|secret|password|example/i;

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

  if (validated.NODE_ENV === NodeEnv.Production) {
    const blockers: string[] = [];
    if (!config.CORS_ORIGINS || String(config.CORS_ORIGINS).trim() === '') {
      blockers.push(
        'CORS_ORIGINS must be set explicitly in production (comma-separated https origins)',
      );
    } else if (/localhost|127\.0\.0\.1/i.test(validated.CORS_ORIGINS)) {
      blockers.push(
        'CORS_ORIGINS must not include localhost in production',
      );
    }
    for (const [name, value] of [
      ['JWT_ACCESS_SECRET', validated.JWT_ACCESS_SECRET],
      ['JWT_REFRESH_SECRET', validated.JWT_REFRESH_SECRET],
    ] as const) {
      if (value.length < 32) {
        blockers.push(`${name} must be at least 32 characters`);
      }
      if (WEAK_SECRET.test(value)) {
        blockers.push(`${name} looks like a placeholder — generate a real secret`);
      }
    }
    if (!config.LOG_LEVEL) {
      validated.LOG_LEVEL = 'info';
    }
    if (blockers.length > 0) {
      throw new Error(
        `Environment validation failed (production): ${blockers.join('; ')}`,
      );
    }
  }

  return validated;
}
