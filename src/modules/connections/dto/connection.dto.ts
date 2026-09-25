import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ConnectionStatus } from '../../../common/enums';

export class ListConnectionsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ConnectionStatus })
  @IsOptional()
  @IsEnum(ConnectionStatus)
  status?: ConnectionStatus;
}
