import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { DeliveryShift, MilkType } from '../../../common/enums';

export class SearchFarmsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  area?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: MilkType })
  @IsOptional()
  @IsEnum(MilkType)
  milkType?: MilkType;

  @ApiPropertyOptional({ enum: DeliveryShift })
  @IsOptional()
  @IsEnum(DeliveryShift)
  deliveryShift?: DeliveryShift;

  @ApiPropertyOptional({
    description:
      'Saved customer address id to search from. Requires authentication ' +
      'and ownership of the address; supplies postalCode/area/city defaults.',
  })
  @IsOptional()
  @IsUUID()
  addressId?: string;

  @ApiPropertyOptional({
    description:
      'When true and the caller is an authenticated customer, includes ' +
      'aggregate diagnostics explaining why results may be limited.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  includeDiagnostics?: boolean;
}
