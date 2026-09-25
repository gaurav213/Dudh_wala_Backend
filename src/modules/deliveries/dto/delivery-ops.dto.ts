import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DeliveryEditReason, DeliveryIssueType } from '../../../common/enums';

export class EditDeliveryDto {
  @ApiPropertyOptional({
    description: 'New final delivered quantity (L)',
  })
  @IsOptional()
  @IsNumberString()
  finalDeliveredQuantity?: string;

  @ApiPropertyOptional({
    description: 'Replacement staff-added extra quantity (L)',
  })
  @IsOptional()
  @IsNumberString()
  staffExtraQuantity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryNotes?: string;

  @ApiProperty({ enum: DeliveryEditReason })
  @IsEnum(DeliveryEditReason)
  editReason!: DeliveryEditReason;

  @ApiPropertyOptional({
    description: 'Required when editReason is OTHER',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  editNote?: string;
}

export class EditReviewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class AddStaffExtraDto {
  @ApiProperty({ example: '1.000' })
  @Transform(({ value }) =>
    value === null || value === undefined
      ? value
      : String(value).trim().replace(',', '.'),
  )
  @IsNumberString()
  extraQuantity!: string;

  @ApiPropertyOptional({
    description:
      'If true, set staff extra to extraQuantity (replace). Default adds on top.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  replace?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class MarkDeliveredDto {
  @ApiPropertyOptional({
    description: 'Override final quantity; defaults to scheduled+extras',
  })
  @IsOptional()
  @IsNumberString()
  finalDeliveredQuantity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class SkipCancelFailDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class FarmSkipTodayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD (defaults to today IST)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CustomerSkipDayDto {
  @ApiProperty({ description: 'YYYY-MM-DD day to skip' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CustomerConfirmDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CustomerIssueDto {
  @ApiProperty({ enum: DeliveryIssueType })
  @IsEnum(DeliveryIssueType)
  issueType!: DeliveryIssueType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  description?: string;
}

export class CreateExtraRequestDto {
  @ApiProperty()
  @IsUUID()
  subscriptionId!: string;

  @ApiProperty({ example: '2026-08-07' })
  @IsString()
  deliveryDate!: string;

  @ApiProperty({ example: '0.500' })
  @IsNumberString()
  requestedQuantity!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReviewExtraRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateAdHocExtraDeliveryDto {
  @ApiProperty()
  @IsUUID()
  subscriptionId!: string;

  @ApiProperty({ example: '1.000' })
  @IsNumberString()
  extraQuantity!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ResolveDeliveryIssueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNotes?: string;

  @ApiPropertyOptional({
    description: 'Status to restore after resolve; defaults to DELIVERED',
    enum: ['DELIVERED', 'SKIPPED', 'CANCELLED', 'FAILED'],
  })
  @IsOptional()
  @IsString()
  restoreStatus?: 'DELIVERED' | 'SKIPPED' | 'CANCELLED' | 'FAILED';
}
