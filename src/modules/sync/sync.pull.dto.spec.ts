import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SyncPullQueryDto } from './dto/sync.dto';

describe('SyncPullQueryDto', () => {
  it('accepts cursor only', async () => {
    const dto = plainToInstance(SyncPullQueryDto, { cursor: 12 });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.cursor).toBe(12);
  });

  it('accepts legacy since alongside cursor (mobile compat)', async () => {
    const dto = plainToInstance(SyncPullQueryDto, {
      cursor: 0,
      since: '2026-08-07T00:00:00.000Z',
    });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.since).toBe('2026-08-07T00:00:00.000Z');
  });

  it('rejects unknown query keys when used with forbidNonWhitelisted', async () => {
    const dto = plainToInstance(SyncPullQueryDto, { foo: 'bar' });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.length).toBeGreaterThan(0);
  });
});
