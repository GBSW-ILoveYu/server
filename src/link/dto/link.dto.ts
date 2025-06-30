import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUrl, Length } from 'class-validator';

export class CreateLinkDto {
  @ApiProperty({ description: 'URL 링크' })
  @IsString()
  @IsNotEmpty()
  @IsUrl({}, { message: '유효한 URL 형식이 아닙니다.' })
  @Length(1, 2048, { message: 'URL은 2048자를 초과할 수 없습니다.' })
  url: string;
}

export class LinkResponseDto {
  @ApiProperty({ description: '링크 ID' })
  id: number;

  @ApiProperty({ description: 'URL 링크' })
  url: string;

  @ApiProperty({ description: '카테고리' })
  category: string;

  @ApiProperty({ description: '제목' })
  title: string;

  @ApiProperty({ description: '설명' })
  description: string;

  @ApiProperty({ description: '썸네일 이미지 URL' })
  thumbnail: string;

  @ApiProperty({ description: '생성 시간' })
  createdAt: Date;

  @ApiProperty({ description: '업데이트 시간' })
  updatedAt: Date;

  @ApiProperty({ description: '사용자 정보' })
  user: {
    id: number;
    nickName: string;
    imageUri: string;
  };
}

export class OpenedLinkCountDto {
  @ApiProperty({ description: '전체 저장한 링크 개수' })
  totalCount: number;

  @ApiProperty({ description: '열어본 링크 개수' })
  openedCount: number;
}
