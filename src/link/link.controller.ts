import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
  Logger,
} from '@nestjs/common';
import { LinkService } from './link.service';
import { CreateLinkDto, LinkResponseDto } from './dto/link.dto';
import { User } from '../auth/entities/user.entity';
import { GetUser } from '../@common/decorators/get-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiResponse, ApiTags, ApiQuery } from '@nestjs/swagger';

@ApiTags('Links')
@Controller('links')
@UseGuards(AuthGuard('jwt'))
export class LinkController {
  private readonly logger = new Logger(LinkController.name);

  constructor(private linkService: LinkService) {}

  @ApiResponse({
    status: 201,
    description: '성공',
    type: LinkResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: '잘못된 요청',
  })
  @ApiOperation({ summary: '링크 추가' })
  @Post()
  createLink(
    @Body(ValidationPipe) createLinkDto: CreateLinkDto,
    @GetUser() user: User,
  ) {
    return this.linkService.createLink(createLinkDto, user);
  }

  @ApiResponse({
    status: 200,
    description: '성공',
    type: [LinkResponseDto],
  })
  @ApiOperation({ summary: '최근에 추가한 링크 N개 조회' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '가져올 링크 개수(기본값 5)',
  })
  @Get('/recent')
  getRecentLinks(@Query('limit') limit: number, @GetUser() user: User) {
    const take = limit && !isNaN(Number(limit)) ? Number(limit) : 5;
    return this.linkService.getRecentLinks(user, take);
  }

  // 🔥 이 라우트를 /:id 보다 위로 이동
  @ApiOperation({ summary: '최근 열어본 링크 N개 조회' })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: '가져올 링크 개수(기본값 5)',
  })
  @ApiResponse({
    status: 200,
    description: '성공',
    type: [LinkResponseDto],
  })
  @Get('/recently-opened')
  getRecentlyOpenedLinks(@Query('limit') limit: number, @GetUser() user: User) {
    const take = limit && !isNaN(Number(limit)) ? Number(limit) : 5;
    return this.linkService.getRecentlyOpenedLinks(user, take);
  }

  @ApiResponse({
    status: 200,
    description: '성공',
  })
  @ApiOperation({ summary: '사용자의 총 링크 개수 조회' })
  @Get('/count/total')
  getTotalLinkCount(@GetUser() user: User) {
    return this.linkService.getTotalLinkCount(user);
  }

  @ApiResponse({
    status: 200,
    description: '성공',
    type: [LinkResponseDto],
  })
  @ApiOperation({ summary: '모든 링크 조회 또는 카테고리별 링크 조회' })
  @ApiQuery({
    name: 'category',
    required: false,
    description: '필터링할 카테고리',
  })
  @Get()
  getLinks(@Query('category') category: string, @GetUser() user: User) {
    this.logger.log(`카테고리 조회 요청: ${category || '전체'}`);
    if (category) {
      return this.linkService.getLinksByCategory(category, user);
    }
    return this.linkService.getAllUserLinks(user);
  }

  @ApiResponse({
    status: 200,
    description: '성공',
    type: LinkResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: '링크를 찾을 수 없음',
  })
  @ApiOperation({ summary: '링크 상세 조회 및 열람 기록 저장' })
  @Get('/:id')
  async getLinkById(@Param('id') id: number, @GetUser() user: User) {
    return this.linkService.getLinkById(id, user);
  }

  @ApiResponse({
    status: 200,
    description: '성공',
  })
  @ApiResponse({
    status: 404,
    description: '링크를 찾을 수 없음',
  })
  @ApiOperation({ summary: '링크 삭제' })
  @Delete('/:id')
  deleteLink(@Param('id') id: number, @GetUser() user: User) {
    return this.linkService.deleteLink(id, user);
  }
}
