import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { DeliveryShift, MilkType } from '../../../common/enums';

export class CreateFarmProductDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @ApiProperty({ enum: MilkType })
  @IsEnum(MilkType)
  milkType!: MilkType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '60.00' })
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/)
  currentRatePerLitre!: string;

  @ApiProperty({ example: '0.500' })
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,3})?$/)
  minimumQuantity!: string;

  @ApiPropertyOptional({ example: '5.000' })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,3})?$/)
  maximumQuantity?: string;

  @ApiProperty({ enum: DeliveryShift, isArray: true })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(DeliveryShift, { each: true })
  availableShifts!: DeliveryShift[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

/**
 * Rate changes go through the dedicated change-rate endpoint, so this
 * intentionally omits currentRatePerLitre rather than extending
 * CreateFarmProductDto via PartialType.
 */
export class UpdateFarmProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @ApiPropertyOptional({ enum: MilkType })
  @IsOptional()
  @IsEnum(MilkType)
  milkType?: MilkType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '0.500' })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,3})?$/)
  minimumQuantity?: string;

  @ApiPropertyOptional({ example: '5.000' })
  @IsOptional()
  @Matches(/^\d+(\.\d{1,3})?$/)
  maximumQuantity?: string;

  @ApiPropertyOptional({ enum: DeliveryShift, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(DeliveryShift, { each: true })
  availableShifts?: DeliveryShift[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}

export class ChangeRateDto {
  @ApiProperty({ example: '65.00' })
  @IsNotEmpty()
  @Matches(/^\d+(\.\d{1,2})?$/)
  ratePerLitre!: string;

  @ApiPropertyOptional({ example: '2026-09-01' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
