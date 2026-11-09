import { ForbiddenException } from '@nestjs/common';
import { DairySalesService } from './dairy-sales.service';

describe('DairySalesService farm wall', () => {
  it('does not read slips when the caller is not on that farm', async () => {
    const slips = { find: jest.fn(), create: jest.fn(), save: jest.fn() };
    const payments = { find: jest.fn(), create: jest.fn(), save: jest.fn() };
    const farmsService = {
      getFarm: jest.fn().mockRejectedValue(new ForbiddenException()),
      assertActiveOwner: jest.fn(),
    };
    const service = new DairySalesService(
      farmsService as never,
      slips as never,
      payments as never,
    );
    await expect(
      service.summary(
        { id: 'user-b', role: 'FARM_OWNER' as never },
        'farm-a',
        '2026-10',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(slips.find).not.toHaveBeenCalled();
    expect(payments.find).not.toHaveBeenCalled();
  });
});
