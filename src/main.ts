import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Render's edge proxy sits in front of us; trust exactly that one hop so
  // @nestjs/throttler sees real client IPs instead of the proxy's IP.
  app.set('trust proxy', 1);
  const config = app.get(ConfigService);

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  const configuredOrigins = config.get<string[]>('app.corsOrigins') ?? [];
  const isDev = config.get<string>('app.nodeEnv') !== 'production';
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Non-browser clients (curl, mobile native) send no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (configuredOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      // Flutter web / Vite pick ephemeral localhost ports in development.
      if (
        isDev &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
      ) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });

  const prefix = config.get<string>('app.apiPrefix') || 'api';
  const version = config.get<string>('app.apiVersion') || '1';
  app.setGlobalPrefix(`${prefix}/v${version}`);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Doodh Wala API')
      .setDescription('Milk delivery ledger API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('app.port') || 3000;
  // Bind all interfaces so phones on the LAN / hotspot can reach the API.
  await app.listen(port, '0.0.0.0');

  console.log(`Doodh Wala API listening on http://0.0.0.0:${port}`);
}

void bootstrap();
