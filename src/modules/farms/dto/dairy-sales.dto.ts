import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const day = /^\d{4}-\d{2}-\d{2}$/;
const money = /^\d+(\.\d{1,2})?$/;
const qty = /^\d+(\.\d{1,3})?$/;

export class CreateDairySlipDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  dairyName!: string;

  @ApiProperty({ example: '2026-10-11' })
  @Matches(day)
  slipDate!: string;

  @ApiProperty({ example: '12.5' })
  @Matches(qty)
  litres!: string;

  @ApiProperty({ example: '48' })
  @Matches(money)
  rate!: string;

  @ApiPropertyOptional({ description: 'Overrides litres × rate' })
  @IsOptional()
  @Matches(money)
  amount?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(money)
  fatPercent?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  rawNumbers?: string[];
}

export class CreateDairyPaymentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(150)
  dairyName!: string;

  @ApiProperty({ example: '500' })
  @Matches(money)
  amount!: string;

  @ApiProperty({ example: '2026-10-11' })
  @Matches(day)
  paidOn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
