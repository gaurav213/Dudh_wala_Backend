import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      requestId?: string;
    }>();
    const header = request.headers['x-request-id'];
    const requestId = (Array.isArray(header) ? header[0] : header) || uuidv4();
    request.requestId = requestId;
    return next.handle();
  }
}
