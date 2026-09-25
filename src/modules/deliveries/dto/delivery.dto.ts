import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { DeliveryShift, DeliveryStatus } from '../../../common/enums';

export class CreateDeliveryDto {
  @ApiProperty()
  @IsUUID()
  subscriptionId!: string;

  @ApiProperty()
  @IsDateString()
  deliveryDate!: string;

  @ApiPropertyOptional({ enum: DeliveryShift })
  @IsOptional()
  @IsEnum(DeliveryShift)
  deliveryShift?: DeliveryShift;

  @ApiPropertyOptional({ example: '1.500' })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity?: string;

  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;

  @ApiProperty()
  @IsUUID()
  clientReferenceId!: string;
}

export class UpdateDeliveryDto {
  @ApiPropertyOptional({ example: '1.500' })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity?: string;

  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;
}

export class ListDeliveriesDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subscriptionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @ApiPropertyOptional({ enum: DeliveryShift })
  @IsOptional()
  @IsEnum(DeliveryShift)
  deliveryShift?: DeliveryShift;
}

/** Query for GET /deliveries/report (admin/farm console). */
export class DeliveryReportDto extends PaginationDto {
  @ApiPropertyOptional({ description: 'Alias of dateFrom' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Alias of dateTo' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;
}

export class GenerateDailyListDto {
  @ApiProperty({ example: '2026-08-06' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({ enum: DeliveryShift })
  @IsOptional()
  @IsEnum(DeliveryShift)
  deliveryShift?: DeliveryShift;
}

export class BulkUpdateItemDto {
  @ApiProperty()
  @IsUUID()
  id!: string;

  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;
}

export class BulkUpdateDeliveriesDto {
  @ApiProperty({ type: [BulkUpdateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateItemDto)
  items!: BulkUpdateItemDto[];
}
