import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  DeliveryShift,
  MilkType,
  SubscriptionScheduleType,
} from '../../../common/enums';

export class CreateManagedCustomerDto {
  @ApiProperty({ example: 'Ramesh Patil' })
  @IsString()
  @MaxLength(150)
  name!: string;

  @ApiPropertyOptional({ example: '9876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  mobileNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ enum: MilkType })
  @IsEnum(MilkType)
  milkType!: MilkType;

  @ApiProperty({ example: '1.500' })
  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity!: string;

  @ApiProperty({ example: '60.00' })
  @Matches(/^\d+(\.\d{1,2})?$/)
  ratePerLitre!: string;

  @ApiProperty({ enum: DeliveryShift })
  @IsEnum(DeliveryShift)
  deliveryShift!: DeliveryShift;

  @ApiProperty({ example: '2026-09-06' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({ enum: SubscriptionScheduleType })
  @IsOptional()
  @IsEnum(SubscriptionScheduleType)
  scheduleType?: SubscriptionScheduleType;
}
