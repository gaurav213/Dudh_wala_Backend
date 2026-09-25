import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { BillStatus } from '../../../common/enums';

export class GenerateBillDto {
  @ApiProperty()
  @IsUUID()
  customerId!: string;

  @ApiProperty({
    example: '2026-08',
    description: 'YYYY-MM or YYYY-MM-01',
  })
  @Matches(/^\d{4}-\d{2}(-01)?$/)
  billingMonth!: string;

  @ApiPropertyOptional({ example: '0.00' })
  @IsOptional()
  @Matches(/^-?\d+(\.\d{1,2})?$/)
  discount?: string;

  @ApiPropertyOptional({ example: '0.00' })
  @IsOptional()
  @Matches(/^-?\d+(\.\d{1,2})?$/)
  adjustment?: string;
}

export class UpdateBillDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^-?\d+(\.\d{1,2})?$/)
  discount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^-?\d+(\.\d{1,2})?$/)
  adjustment?: string;
}

export class ListBillsDto extends PaginationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({ enum: BillStatus })
  @IsOptional()
  @IsEnum(BillStatus)
  status?: BillStatus;

  @ApiPropertyOptional({
    example: '2026-08',
    description: 'YYYY-MM or YYYY-MM-01',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}(-01)?$/)
  billingMonth?: string;
}

export class OutstandingBillsDto extends PaginationDto {
  @ApiPropertyOptional({
    description: 'Filter by farm owner user id (platform owners only)',
  })
  @IsOptional()
  @IsUUID()
  supplierId?: string;
}
