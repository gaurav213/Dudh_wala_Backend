import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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
  DeliveryShift,
  MilkType,
  SubscriptionStatus,
} from '../../../common/enums';

export class CreateSubscriptionDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiProperty({ enum: MilkType })
  @IsEnum(MilkType)
  milkType!: MilkType;

  @ApiProperty({ example: '1.500' })
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,3})?$/)
  defaultQuantity!: string;

  @ApiProperty({ example: '60.00' })
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/)
  ratePerLitre!: string;

  @ApiProperty({ enum: DeliveryShift })
  @IsEnum(DeliveryShift)
  deliveryShift!: DeliveryShift;

  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class UpdateSubscriptionDto extends PartialType(CreateSubscriptionDto) {}

export class ListSubscriptionsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ enum: SubscriptionStatus })
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;
}
