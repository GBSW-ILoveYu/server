import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { LinkService } from './link.service';
import { CreateLinkDto, LinkResponseDto } from './dto/link.dto';
import { User } from '../auth/entities/user.entity';
import { GetUser } from '../@common/decorators/get-user.decorator';
import { AuthGuard } from '@nestjs/passport';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Links')
@Controller('links')
@UseGuards(AuthGuard('jwt'))
export class LinkController {
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
  @ApiOperation({ summary: '모든 링크 조회' })
  @Get()
  getAllLinks(@GetUser() user: User) {
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
  @ApiOperation({ summary: '링크 상세 조회' })
  @Get('/:id')
  getLinkById(@Param('id') id: number, @GetUser() user: User) {
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
