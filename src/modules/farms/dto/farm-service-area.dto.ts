import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ServiceAreaStatus } from '../../../common/enums';

export class CreateFarmServiceAreaDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  areaName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  city!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  state!: string;

  @ApiPropertyOptional({ example: '411001' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: string;

  @ApiPropertyOptional({ example: '10.5' })
  @IsOptional()
  @IsNumberString()
  serviceRadiusKm?: string;

  @ApiPropertyOptional({ enum: ServiceAreaStatus })
  @IsOptional()
  @IsEnum(ServiceAreaStatus)
  status?: ServiceAreaStatus;
}

export class UpdateFarmServiceAreaDto extends PartialType(
  CreateFarmServiceAreaDto,
) {}
