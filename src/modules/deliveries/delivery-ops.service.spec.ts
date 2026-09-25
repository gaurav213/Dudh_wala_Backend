import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  DeliveryConfirmationStatus,
  DeliveryEditReason,
  DeliveryEditReviewStatus,
  DeliveryStatus,
  FarmMemberRole,
  FarmMemberStatus,
  UserRole,
} from '../../common/enums';
import { DeliveryOpsService } from './delivery-ops.service';

function baseDelivery(overrides: Record<string, any> = {}) {
  return {
    id: 'delivery-1',
    supplierId: 'farm-a-owner',
    farmId: 'farm-a',
    customerId: 'customer-1',
    customerUserId: 'customer-user-1',
    subscriptionId: 'sub-1',
    subscription: null,
    assignedUserId: 'staff-a',
    deliveredByUserId: null,
    deliveryDate: '2026-09-03',
    deliveryShift: 'MORNING',
    scheduledQuantity: '1.000',
    customerExtraQuantity: '0.000',
    staffExtraQuantity: '0.000',
    finalDeliveredQuantity: null,
    quantity: '1.000',
    ratePerLitre: '60.00',
    amount: '60.00',
    status: DeliveryStatus.PENDING,
    confirmationStatus: DeliveryConfirmationStatus.NOT_CONFIRMED,
    version: 1,
    isEdited: false,
    editReviewStatus: DeliveryEditReviewStatus.NOT_REQUIRED,
    deliveryNotes: null,
    lastEditedAt: null,
    lastEditedByUserId: null,
    deliveredAt: null,
    customer: null,
    ...overrides,
  };
}

function makeService() {
  const billItemsQb = {
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(0),
  };
  const deliveriesRepo = {
    findOne: jest.fn(),
    save: jest.fn((d: any) => Promise.resolve(d)),
    manager: { findOne: jest.fn() },
  };
  const eventsRepo = {
    find: jest.fn().mockResolvedValue([]),
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) => Promise.resolve(x)),
  };
  const issuesRepo = {
    findOne: jest.fn(),
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) => Promise.resolve(x)),
  };
  const editHistoryRepo = {
    create: jest.fn((x: any) => x),
    save: jest.fn((x: any) => Promise.resolve({ id: 'hist-1', ...x })),
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
  };
  const farmsRepo = { findOne: jest.fn() };
  const membersRepo = { findOne: jest.fn() };
  const subsRepo = { findOne: jest.fn() };
  const assignmentsRepo = { findOne: jest.fn() };
  const billItemsRepo = { createQueryBuilder: jest.fn(() => billItemsQb) };
  const usersRepo = { findOne: jest.fn() };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const auditService = { log: jest.fn().mockResolvedValue(undefined) };
  const config = { get: jest.fn() };

  const service = new DeliveryOpsService(
    deliveriesRepo as any,
    eventsRepo as any,
    issuesRepo as any,
    editHistoryRepo as any,
    farmsRepo as any,
    membersRepo as any,
    subsRepo as any,
    assignmentsRepo as any,
    billItemsRepo as any,
    usersRepo as any,
    notifications as any,
    auditService as any,
    config as any,
  );

  return {
    service,
    deliveriesRepo,
    eventsRepo,
    issuesRepo,
    editHistoryRepo,
    farmsRepo,
    membersRepo,
    subsRepo,
    assignmentsRepo,
    billItemsRepo,
    billItemsQb,
    usersRepo,
    notifications,
    auditService,
    config,
  };
}

const platformOwner = { id: 'platform-1', role: UserRole.PLATFORM_OWNER };
const farmAOwner = { id: 'farm-a-owner', role: UserRole.FARM_OWNER };
const farmBOwner = { id: 'farm-b-owner', role: UserRole.FARM_OWNER };
const staffA = { id: 'staff-a', role: UserRole.DELIVERY_STAFF };
const staffB = { id: 'staff-b', role: UserRole.DELIVERY_STAFF };

describe('DeliveryOpsService', () => {
  describe('status transitions', () => {
    it('moves a PENDING delivery to OUT_FOR_DELIVERY', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({ status: DeliveryStatus.PENDING });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      const result = await service.outForDelivery(platformOwner, delivery.id);

      expect(result.status).toBe(DeliveryStatus.OUT_FOR_DELIVERY);
      expect(result.version).toBe(2);
    });

    it('rejects an OUT_FOR_DELIVERY transition from a terminal status', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({ status: DeliveryStatus.DELIVERED });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(
        service.outForDelivery(platformOwner, delivery.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks a PENDING delivery delivered and computes amount = rate x quantity', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({
        status: DeliveryStatus.PENDING,
        scheduledQuantity: '1.500',
        ratePerLitre: '60.00',
        customerUserId: null,
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      const result = await service.markDelivered(
        platformOwner,
        delivery.id,
        {},
      );

      expect(result.status).toBe(DeliveryStatus.DELIVERED);
      expect(result.finalDeliveredQuantity).toBe('1.500');
      expect(result.amount).toBe('90.00');
    });

    it('rejects marking delivered a delivery that is already DELIVERED', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({ status: DeliveryStatus.DELIVERED });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(
        service.markDelivered(platformOwner, delivery.id, {}),
      ).rejects.toThrow(BadRequestException);
    });

    it('reopens DELIVERED when staff extra is added so Diya can confirm again', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({
        status: DeliveryStatus.DELIVERED,
        confirmationStatus: DeliveryConfirmationStatus.FARM_MARKED_DELIVERED,
        scheduledQuantity: '1.000',
        staffExtraQuantity: '0.000',
        finalDeliveredQuantity: '1.000',
        quantity: '1.000',
        amount: '60.00',
        deliveredAt: new Date(),
        deliveredByUserId: 'staff-a',
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      const result = await service.addStaffExtra(platformOwner, delivery.id, {
        extraQuantity: '0.5',
        replace: true,
      } as any);

      expect(result.status).toBe(DeliveryStatus.PENDING);
      expect(result.confirmationStatus).toBe(
        DeliveryConfirmationStatus.NOT_CONFIRMED,
      );
      expect(result.finalDeliveredQuantity).toBeNull();
      expect(result.deliveredAt).toBeNull();
      expect(result.staffExtraQuantity).toBe('0.500');
      expect(result.quantity).toBe('1.500');
    });

    it('rejects a mark-delivered override of zero quantity', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({ status: DeliveryStatus.PENDING });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(
        service.markDelivered(platformOwner, delivery.id, {
          finalDeliveredQuantity: '0',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('skips a PENDING delivery and zeroes out quantity/amount', async () => {
      const { service, deliveriesRepo, notifications } = makeService();
      const delivery = baseDelivery({
        status: DeliveryStatus.PENDING,
        customerUserId: 'customer-user-1',
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      const result = await service.skip(farmAOwner, delivery.id, {});

      expect(result.status).toBe(DeliveryStatus.SKIPPED);
      expect(result.amount).toBe('0.00');
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FARM_NO_DELIVERY_TODAY',
          recipientUserIds: ['customer-user-1'],
        }),
      );
    });

    it('rejects skip once a delivery is already closed', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({ status: DeliveryStatus.CANCELLED });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(service.skip(farmAOwner, delivery.id, {})).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('assertCanAccess ownership', () => {
    it('lets the owning farm act on its own delivery', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({ supplierId: farmAOwner.id });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(
        service.outForDelivery(farmAOwner, delivery.id),
      ).resolves.toBeDefined();
    });

    it('blocks a different farm owner from acting on the delivery', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({ supplierId: farmAOwner.id });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(
        service.outForDelivery(farmBOwner, delivery.id),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets delivery staff assigned directly to the delivery act on it', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({ assignedUserId: staffA.id });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(
        service.outForDelivery(staffA, delivery.id),
      ).resolves.toBeDefined();
    });

    it('lets delivery staff assigned via the subscription act on it', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({
        assignedUserId: null,
        subscription: { assignedDeliveryUserId: staffA.id },
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(
        service.outForDelivery(staffA, delivery.id),
      ).resolves.toBeDefined();
    });

    it('blocks delivery staff from a different farm/subscription (Farm A staff cannot act on Farm B delivery)', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({
        assignedUserId: staffA.id,
        subscription: { assignedDeliveryUserId: staffA.id },
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(service.outForDelivery(staffB, delivery.id)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('editDelivery — permission and validation', () => {
    it('rejects an edit with nothing to change', async () => {
      const { service } = makeService();

      await expect(
        service.editDelivery(farmAOwner, 'delivery-1', {} as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires an editNote when the reason is OTHER', async () => {
      const { service } = makeService();

      await expect(
        service.editDelivery(farmAOwner, 'delivery-1', {
          finalDeliveredQuantity: '2.000',
          editReason: DeliveryEditReason.OTHER,
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects editing a delivery that has not been marked delivered', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({ status: DeliveryStatus.PENDING });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(
        service.editDelivery(farmAOwner, delivery.id, {
          finalDeliveredQuantity: '2.000',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('blocks staff with no active farm membership from editing', async () => {
      const { service, deliveriesRepo, membersRepo } = makeService();
      const delivery = baseDelivery({
        status: DeliveryStatus.DELIVERED,
        assignedUserId: staffA.id,
        deliveredAt: new Date(),
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);
      membersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.editDelivery(staffA, delivery.id, {
          finalDeliveredQuantity: '2.000',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks staff from editing a delivery assigned to someone else', async () => {
      const { service, deliveriesRepo, membersRepo } = makeService();
      const delivery = baseDelivery({
        status: DeliveryStatus.DELIVERED,
        assignedUserId: staffB.id,
        deliveredAt: new Date(),
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);
      membersRepo.findOne.mockResolvedValue({
        farmId: delivery.farmId,
        userId: staffA.id,
        memberRole: FarmMemberRole.DELIVERY_STAFF,
        status: FarmMemberStatus.ACTIVE,
      });

      await expect(
        service.editDelivery(staffA, delivery.id, {
          finalDeliveredQuantity: '2.000',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks staff from editing outside the configured edit window', async () => {
      const { service, deliveriesRepo, membersRepo, config } = makeService();
      const deliveredAt = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2h ago
      const delivery = baseDelivery({
        status: DeliveryStatus.DELIVERED,
        assignedUserId: staffA.id,
        deliveredAt,
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);
      membersRepo.findOne.mockResolvedValue({
        farmId: delivery.farmId,
        userId: staffA.id,
        memberRole: FarmMemberRole.DELIVERY_STAFF,
        status: FarmMemberStatus.ACTIVE,
      });
      config.get.mockReturnValue(60); // 60-minute edit window

      await expect(
        service.editDelivery(staffA, delivery.id, {
          finalDeliveredQuantity: '2.000',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a negative staff-extra edit', async () => {
      const { service, deliveriesRepo } = makeService();
      const delivery = baseDelivery({ status: DeliveryStatus.DELIVERED });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      await expect(
        service.editDelivery(farmAOwner, delivery.id, {
          staffExtraQuantity: '-1.000',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows the farm owner to edit within window, recomputing amount and history', async () => {
      const { service, deliveriesRepo, editHistoryRepo, notifications } =
        makeService();
      const delivery = baseDelivery({
        status: DeliveryStatus.DELIVERED,
        scheduledQuantity: '1.000',
        finalDeliveredQuantity: '1.000',
        quantity: '1.000',
        ratePerLitre: '60.00',
        amount: '60.00',
        staffExtraQuantity: '0.000',
        deliveredAt: new Date(),
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      const { delivery: saved, history } = await service.editDelivery(
        farmAOwner,
        delivery.id,
        {
          finalDeliveredQuantity: '2.000',
          editReason: DeliveryEditReason.ENTERED_WRONG_QUANTITY,
        },
      );

      expect(saved.finalDeliveredQuantity).toBe('2.000');
      expect(saved.amount).toBe('120.00');
      expect(saved.staffExtraQuantity).toBe('1.000');
      expect(editHistoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          previousQuantity: '1.000',
          newQuantity: '2.000',
          previousAmount: '60.00',
          newAmount: '120.00',
        }),
      );
      expect(history.id).toBe('hist-1');
      expect(notifications.notify).toHaveBeenCalled();
    });

    it('blocks editing a delivery already on a finalized bill', async () => {
      const { service, deliveriesRepo, billItemsQb } = makeService();
      const delivery = baseDelivery({
        status: DeliveryStatus.DELIVERED,
        deliveredAt: new Date(),
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);
      billItemsQb.getCount.mockResolvedValue(1);

      await expect(
        service.editDelivery(farmAOwner, delivery.id, {
          finalDeliveredQuantity: '2.000',
        } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('customerSkipToday', () => {
    const customerUser = { id: 'customer-user-1', role: UserRole.CUSTOMER };

    it('skips PENDING delivery, zeroes qty, and notifies farm', async () => {
      const { service, deliveriesRepo, notifications } = makeService();
      const delivery = baseDelivery({
        status: DeliveryStatus.PENDING,
        customer: { name: 'Riya' },
      });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      const result = await service.customerSkipToday(customerUser, delivery.id, {});

      expect(result.status).toBe(DeliveryStatus.SKIPPED);
      expect(result.quantity).toBe('0.000');
      expect(result.amount).toBe('0.00');
      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CUSTOMER_NO_MILK_TODAY',
          title: 'No milk for a day',
          recipientUserIds: expect.arrayContaining(['farm-a-owner']),
        }),
      );
    });

    it('is idempotent when already SKIPPED', async () => {
      const { service, deliveriesRepo, notifications } = makeService();
      const delivery = baseDelivery({ status: DeliveryStatus.SKIPPED });
      deliveriesRepo.findOne.mockResolvedValue(delivery);

      const result = await service.customerSkipToday(customerUser, delivery.id, {});
      expect(result.status).toBe(DeliveryStatus.SKIPPED);
      expect(notifications.notify).not.toHaveBeenCalled();
    });

    it('rejects when delivery is already DELIVERED', async () => {
      const { service, deliveriesRepo } = makeService();
      deliveriesRepo.findOne.mockResolvedValue(
        baseDelivery({ status: DeliveryStatus.DELIVERED }),
      );

      await expect(
        service.customerSkipToday(customerUser, 'delivery-1', {}),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
