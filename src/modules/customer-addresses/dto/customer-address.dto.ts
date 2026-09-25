import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { AddressLocationSource } from '../../../common/enums';

export class CreateCustomerAddressDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  label!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  addressLine1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  addressLine2?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  area!: string;

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

  @ApiProperty({ example: '411001' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  postalCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  latitude?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  longitude?: string;

  @ApiPropertyOptional({ enum: AddressLocationSource })
  @IsOptional()
  @IsEnum(AddressLocationSource)
  locationSource?: AddressLocationSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  locationAccuracyMeters?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryInstructions?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class UpdateCustomerAddressDto extends PartialType(
  CreateCustomerAddressDto,
) {}

export class UpdateAddressLocationDto {
  @ApiProperty({ example: '18.5204000' })
  @IsLatitude()
  latitude!: string;

  @ApiProperty({ example: '73.8567000' })
  @IsLongitude()
  longitude!: string;

  @ApiPropertyOptional({ enum: AddressLocationSource })
  @IsOptional()
  @IsEnum(AddressLocationSource)
  locationSource?: AddressLocationSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumberString()
  locationAccuracyMeters?: string;

  @ApiPropertyOptional({
    description: 'When true, marks the pin as verified by the actor',
  })
  @IsOptional()
  @IsBoolean()
  markVerified?: boolean;
}
