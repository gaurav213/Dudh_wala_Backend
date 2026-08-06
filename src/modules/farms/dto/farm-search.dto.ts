import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
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
}
