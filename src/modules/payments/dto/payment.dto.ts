import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import {
  CashPaymentPurpose,
  PaymentMethod,
  PaymentStatus,
} from '../../../common/enums';

export class CreatePaymentDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  billId?: string;

  @ApiProperty({ example: '500.00' })
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @ApiProperty()
  @IsDateString()
  paymentDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  referenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;

  @ApiProperty()
  @IsUUID()
  clientReferenceId!: string;
}

export class RecordCashPaymentDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  billId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiProperty({ example: '500.00' })
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  @ApiProperty({ enum: CashPaymentPurpose })
  @IsEnum(CashPaymentPurpose)
  purpose!: CashPaymentPurpose;

  @ApiProperty()
  @IsDateString()
  paymentDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;

  @ApiProperty()
  @IsUUID()
  clientReferenceId!: string;
}

export class UpdatePaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  referenceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  billId?: string | null;
}

export class ClaimCashPaymentDto {
  @ApiProperty({ example: '500.00' })
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  farmId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  paymentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;

  @ApiProperty()
  @IsUUID()
  clientReferenceId!: string;
}

export class RejectCashPaymentDto {
  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;
}

export class ListPaymentsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  billId?: string;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
