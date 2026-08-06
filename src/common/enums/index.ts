export enum UserRole {
  PLATFORM_OWNER = 'PLATFORM_OWNER',
  FARM_OWNER = 'FARM_OWNER',
  DELIVERY_STAFF = 'DELIVERY_STAFF',
  CUSTOMER = 'CUSTOMER',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
}

export enum FarmStatus {
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BLOCKED = 'BLOCKED',
  REJECTED = 'REJECTED',
}

export enum FarmMemberRole {
  OWNER = 'OWNER',
  DELIVERY_STAFF = 'DELIVERY_STAFF',
}

export enum FarmMemberStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  REMOVED = 'REMOVED',
}

export enum CustomerStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  ARCHIVED = 'ARCHIVED',
}

export enum MilkType {
  COW = 'COW',
  BUFFALO = 'BUFFALO',
  MIXED = 'MIXED',
  TONED = 'TONED',
  OTHER = 'OTHER',
}

export enum DeliveryShift {
  MORNING = 'MORNING',
  EVENING = 'EVENING',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  CANCELLED = 'CANCELLED',
}

export enum DeliveryStatus {
  PENDING = 'PENDING',
  DELIVERED = 'DELIVERED',
  SKIPPED = 'SKIPPED',
  CANCELLED = 'CANCELLED',
}

export enum BillStatus {
  DRAFT = 'DRAFT',
  ISSUED = 'ISSUED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

export enum BillItemType {
  MILK_DELIVERY = 'MILK_DELIVERY',
  PREVIOUS_BALANCE = 'PREVIOUS_BALANCE',
  DISCOUNT = 'DISCOUNT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export enum PaymentMethod {
  CASH = 'CASH',
  UPI = 'UPI',
  BANK_TRANSFER = 'BANK_TRANSFER',
  OTHER = 'OTHER',
}

export enum ServiceAreaStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}
