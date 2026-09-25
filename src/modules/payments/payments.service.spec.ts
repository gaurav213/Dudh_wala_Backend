import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  CashPaymentPurpose,
  PaymentMethod,
  PaymentStatus,
  SubscriptionStatus,
  UserRole,
} from '../../common/enums';
import { PaymentsService } from './payments.service';

function basePayment(overrides: Record<string, any> = {}) {
  return {
    id: 'payment-1',
    supplierId: 'farm-a-owner',
    farmId: 'farm-a',
    customerId: 'customer-1',
    billId: null,
    purpose: CashPaymentPurpose.BILL_PAYMENT,
    amount: '100.00',
    paymentMethod: PaymentMethod.CASH,
    status: PaymentStatus.PENDING_CONFIRMATION,
    paymentDate: '2026-09-03',
    notes: null,
    clientReferenceId: 'ref-1',
    version: 1,
    recordedByUserId: 'staff-a',
    confirmedByUserId: null,
    confirmedAt: null,
    rejectionNote: null,
    ...overrides,
  };
}

function makeService() {
  const paymentsRepo = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) => Promise.resolve(x)),
    createQueryBuilder: jest.fn(),
  };
  const changeLogRepo = {
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) => Promise.resolve(x)),
  };
  const manager = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((x: any) => Promise.resolve(x)),
    create: jest.fn((_entity: any, x: any) => x),
    softRemove: jest.fn(),
  };
  const dataSource = {
    manager,
    transaction: jest.fn((cb: any) => cb(manager)),
  };
  const settingsRepo = { findOne: jest.fn() };
  const membersRepo = { findOne: jest.fn(), find: jest.fn() };
  const subscriptionsRepo = { findOne: jest.fn(), find: jest.fn() };
  const customersRepo = { findOne: jest.fn(), find: jest.fn() };
  const customersService = { findOne: jest.fn() };
  const billingService = {
    recalculateBillPaidAmount: jest.fn().mockResolvedValue(undefined),
  };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };

  const service = new PaymentsService(
    paymentsRepo as any,
    changeLogRepo as any,
    dataSource as any,
    settingsRepo as any,
    membersRepo as any,
    subscriptionsRepo as any,
    customersRepo as any,
    customersService as any,
    billingService as any,
    auditService as any,
    notifications as any,
  );

  return {
    service,
    paymentsRepo,
    changeLogRepo,
    manager,
    dataSource,
    settingsRepo,
    membersRepo,
    subscriptionsRepo,
    customersRepo,
    customersService,
    billingService,
    auditService,
    notifications,
  };
}

const farmAOwner = { id: 'farm-a-owner', role: UserRole.FARM_OWNER };
const farmBOwner = { id: 'farm-b-owner', role: UserRole.FARM_OWNER };
const platformOwner = { id: 'platform-1', role: UserRole.PLATFORM_OWNER };
const staffA = { id: 'staff-a', role: UserRole.DELIVERY_STAFF };
const customerUser = { id: 'customer-user-1', role: UserRole.CUSTOMER };

describe('PaymentsService', () => {
  describe('recordCash', () => {
    it('rejects a zero or negative amount', async () => {
      const { service, customersRepo } = makeService();
      customersRepo.findOne.mockResolvedValue({
        id: 'customer-1',
        supplierId: farmAOwner.id,
        customerUserId: null,
      });

      await expect(
        service.recordCash(farmAOwner, {
          customerId: 'customer-1',
          amount: '0.00',
          purpose: CashPaymentPurpose.BILL_PAYMENT,
          paymentDate: '2026-09-03',
          clientReferenceId: 'ref-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires a farmId for delivery-staff cash collection', async () => {
      const { service } = makeService();

      await expect(
        service.recordCash(staffA, {
          customerId: 'customer-1',
          amount: '50.00',
          purpose: CashPaymentPurpose.BILL_PAYMENT,
          paymentDate: '2026-09-03',
          clientReferenceId: 'ref-1',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks delivery staff whose farm has not enabled cash collection', async () => {
      const { service, settingsRepo } = makeService();
      settingsRepo.findOne.mockResolvedValue({ canRecordCashPayment: false });

      await expect(
        service.recordCash(staffA, {
          customerId: 'customer-1',
          farmId: 'farm-a',
          amount: '50.00',
          purpose: CashPaymentPurpose.BILL_PAYMENT,
          paymentDate: '2026-09-03',
          clientReferenceId: 'ref-1',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks a farm owner from recording cash for a customer of a different farm', async () => {
      const { service, customersRepo } = makeService();
      customersRepo.findOne.mockResolvedValue({
        id: 'customer-1',
        supplierId: farmBOwner.id,
        customerUserId: null,
      });

      await expect(
        service.recordCash(farmAOwner, {
          customerId: 'customer-1',
          amount: '50.00',
          purpose: CashPaymentPurpose.BILL_PAYMENT,
          paymentDate: '2026-09-03',
          clientReferenceId: 'ref-1',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('is idempotent on clientReferenceId and does not create a duplicate payment', async () => {
      const { service, customersRepo, paymentsRepo } = makeService();
      customersRepo.findOne.mockResolvedValue({
        id: 'customer-1',
        supplierId: farmAOwner.id,
        customerUserId: null,
      });
      const existing = basePayment({ clientReferenceId: 'ref-1' });
      paymentsRepo.findOne.mockResolvedValue(existing);

      const result = await service.recordCash(farmAOwner, {
        customerId: 'customer-1',
        amount: '50.00',
        purpose: CashPaymentPurpose.BILL_PAYMENT,
        paymentDate: '2026-09-03',
        clientReferenceId: 'ref-1',
      });

      expect(result).toBe(existing);
      expect(paymentsRepo.save).not.toHaveBeenCalled();
    });

    it('records a confirmed cash payment and notifies the supplier and customer', async () => {
      const { service, customersRepo, paymentsRepo, notifications } =
        makeService();
      customersRepo.findOne.mockResolvedValue({
        id: 'customer-1',
        supplierId: farmAOwner.id,
        customerUserId: customerUser.id,
      });
      paymentsRepo.findOne.mockResolvedValue(null);

      const result = await service.recordCash(farmAOwner, {
        customerId: 'customer-1',
        amount: '150.5',
        purpose: CashPaymentPurpose.BILL_PAYMENT,
        paymentDate: '2026-09-03',
        clientReferenceId: 'ref-2',
      });

      expect(result.amount).toBe('150.50');
      expect(result.status).toBe(PaymentStatus.CONFIRMED);
      expect(result.paymentMethod).toBe(PaymentMethod.CASH);
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserIds: [farmAOwner.id, customerUser.id],
        }),
      );
    });
  });

  describe('claimCash', () => {
    it('only allows customers to claim a cash payment', async () => {
      const { service } = makeService();

      await expect(
        service.claimCash(
          farmAOwner,
          { amount: '50.00', clientReferenceId: 'ref-1' } as any,
          {} as Express.Multer.File,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a zero or negative claimed amount', async () => {
      const { service } = makeService();

      await expect(
        service.claimCash(
          customerUser,
          { amount: '-10.00', clientReferenceId: 'ref-1' } as any,
          {} as Express.Multer.File,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('confirmCash', () => {
    it('rejects confirming a payment that is not pending confirmation', async () => {
      const { service, paymentsRepo } = makeService();
      paymentsRepo.findOne.mockResolvedValue(
        basePayment({ status: PaymentStatus.CONFIRMED }),
      );

      await expect(
        service.confirmCash(platformOwner, 'payment-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('recalculates the bill balance as an exact decimal sum of confirmed payments only', async () => {
      const { service, paymentsRepo, manager, billingService, customersRepo } =
        makeService();
      paymentsRepo.findOne.mockResolvedValue(
        basePayment({
          status: PaymentStatus.PENDING_CONFIRMATION,
          billId: 'bill-1',
        }),
      );
      // Three confirmed payments that would drift under naive float addition
      // (33.33 + 33.33 + 33.34) but must sum to an exact 100.00.
      manager.find.mockResolvedValue([
        { amount: '33.33' },
        { amount: '33.33' },
        { amount: '33.34' },
      ]);
      customersRepo.findOne.mockResolvedValue(null);

      await service.confirmCash(platformOwner, 'payment-1');

      expect(manager.find).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          where: { billId: 'bill-1', status: PaymentStatus.CONFIRMED },
        }),
      );
      expect(billingService.recalculateBillPaidAmount).toHaveBeenCalledWith(
        'bill-1',
        '100.00',
        manager,
      );
    });
  });

  describe('rejectCash', () => {
    it('rejects rejecting a payment that is not pending confirmation', async () => {
      const { service, paymentsRepo } = makeService();
      paymentsRepo.findOne.mockResolvedValue(
        basePayment({ status: PaymentStatus.REJECTED }),
      );

      await expect(
        service.rejectCash(platformOwner, 'payment-1', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks a pending payment rejected with a trimmed note', async () => {
      const { service, paymentsRepo, customersRepo } = makeService();
      paymentsRepo.findOne.mockResolvedValue(
        basePayment({ status: PaymentStatus.PENDING_CONFIRMATION }),
      );
      customersRepo.findOne.mockResolvedValue(null);

      const result = await service.rejectCash(platformOwner, 'payment-1', {
        notes: '  duplicate claim  ',
      });

      expect(result.status).toBe(PaymentStatus.REJECTED);
      expect(result.rejectionNote).toBe('duplicate claim');
      expect(result.version).toBe(2);
    });
  });

  describe('findOne — view permissions', () => {
    it('blocks delivery staff with no farm membership or assignment for that customer', async () => {
      const { service, paymentsRepo, membersRepo, subscriptionsRepo } =
        makeService();
      paymentsRepo.findOne.mockResolvedValue(basePayment());
      membersRepo.findOne.mockResolvedValue(null);
      subscriptionsRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne(staffA, 'payment-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows delivery staff assigned to the customer subscription to view the payment', async () => {
      const { service, paymentsRepo, membersRepo, subscriptionsRepo } =
        makeService();
      paymentsRepo.findOne.mockResolvedValue(basePayment());
      membersRepo.findOne.mockResolvedValue(null);
      subscriptionsRepo.findOne.mockResolvedValue({
        customerId: 'customer-1',
        assignedDeliveryUserId: staffA.id,
        status: SubscriptionStatus.ACTIVE,
      });

      await expect(service.findOne(staffA, 'payment-1')).resolves.toBeDefined();
    });

    it('blocks a farm owner from viewing a payment that belongs to a different farm', async () => {
      const { service, paymentsRepo } = makeService();
      paymentsRepo.findOne.mockResolvedValue(
        basePayment({ supplierId: farmBOwner.id }),
      );

      await expect(service.findOne(farmAOwner, 'payment-1')).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
