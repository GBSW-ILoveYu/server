import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreateLinkDto {
  @ApiProperty({ description: 'URL 링크' })
  @IsString()
  @IsNotEmpty()
  @IsUrl({}, { message: '유효한 URL 형식이 아닙니다.' })
  url: string;
}

export class LinkResponseDto {
  @ApiProperty({ description: '링크 ID' })
  id: number;

  @ApiProperty({ description: 'URL 링크' })
  url: string;

  @ApiProperty({ description: '카테고리' })
  category: string;

  @ApiProperty({ description: '생성 시간' })
  createdAt: Date;

  @ApiProperty({ description: '업데이트 시간' })
  updatedAt: Date;

  @ApiProperty({ description: '사용자 ID' })
  userId: number;
}
