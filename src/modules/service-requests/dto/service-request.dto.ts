import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { DeliveryShift, ServiceRequestStatus, SubscriptionScheduleType } from '../../../common/enums';

export class CreateServiceRequestDto {
  @ApiProperty()
  @IsUUID()
  farmId!: string;

  @ApiProperty()
  @IsUUID()
  addressId!: string;

  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: '1.500' })
  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity!: string;

  @ApiProperty({ enum: DeliveryShift })
  @IsEnum(DeliveryShift)
  deliveryShift!: DeliveryShift;

  @ApiPropertyOptional({
    enum: SubscriptionScheduleType,
    description: 'EVERY_DAY | ALTERNATE_DAYS | WEEKLY (default EVERY_DAY)',
  })
  @IsOptional()
  @IsEnum(SubscriptionScheduleType)
  scheduleType?: SubscriptionScheduleType;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  preferredStartDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryInstructions?: string;
}

export class RejectServiceRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rejectionReason?: string;
}

export class AcceptServiceRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedMemberUserId?: string;
}

export class UpdateServiceRequestDto {
  @ApiPropertyOptional({ example: '1.500' })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity?: string;

  @ApiPropertyOptional({ enum: DeliveryShift })
  @IsOptional()
  @IsEnum(DeliveryShift)
  deliveryShift?: DeliveryShift;

  @ApiPropertyOptional({ enum: SubscriptionScheduleType })
  @IsOptional()
  @IsEnum(SubscriptionScheduleType)
  scheduleType?: SubscriptionScheduleType;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  preferredStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryInstructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  addressId?: string;
}

export class ListServiceRequestsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ServiceRequestStatus })
  @IsOptional()
  @IsEnum(ServiceRequestStatus)
  status?: ServiceRequestStatus;

  @ApiPropertyOptional({ description: 'Filter by farm (customer list)' })
  @IsOptional()
  @IsUUID()
  farmId?: string;
}
