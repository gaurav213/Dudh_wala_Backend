import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ requestId?: string }>();
    return next.handle().pipe(
      map((body) => {
        if (
          body &&
          typeof body === 'object' &&
          'data' in (body as object) &&
          'meta' in (body as object)
        ) {
          const wrapped = body as {
            data: unknown;
            meta: Record<string, unknown>;
          };
          return {
            data: wrapped.data,
            meta: {
              ...wrapped.meta,
              requestId: wrapped.meta.requestId || request.requestId,
            },
          };
        }
        return {
          data: body,
          meta: { requestId: request.requestId },
        };
      }),
    );
  }
}
