import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Link } from './entities/link.entity';
import { User } from '../auth/entities/user.entity';
import { CreateLinkDto } from './dto/link.dto';
import { WebCrawlerService } from '../utils/crawler.util';
import { CategoryAnalyzerService } from '../utils/category-analyzer.util';
import { ERROR_MESSAGES } from '../constants/message.constants';
import { CATEGORIES } from '../constants/categories.constants';

import { LinkOpenHistory } from './entities/link-open-history.entity';

@Injectable()
export class LinkService {
  private readonly logger = new Logger(LinkService.name);
  private readonly MAX_URL_LENGTH = 2048;

  constructor(
    @InjectRepository(Link)
    private linkRepository: Repository<Link>,
    @InjectRepository(LinkOpenHistory)
    private linkOpenHistoryRepository: Repository<LinkOpenHistory>,
    private readonly webCrawlerService: WebCrawlerService,
    private readonly categoryAnalyzerService: CategoryAnalyzerService,
  ) {}

  private formatLinkResponse(link: Link): any {
    return {
      id: link.id,
      url: link.url,
      category: link.category,
      title: link.title || '제목 없음',
      description: link.description || '',
      thumbnail: link.thumbnail || null,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
      user: link.user
        ? {
            id: link.user.id,
            nickName: link.user.nickName,
            imageUri: link.user.imageUri,
          }
        : null,
    };
  }

  private normalizeUrl(url: string): string {
    try {
      const parsedUrl = new URL(
        url.startsWith('http') ? url : `https://${url}`,
      );

      let normalized = parsedUrl.hostname.replace(/^www\./i, '');

      normalized += parsedUrl.pathname;

      if (
        parsedUrl.hostname.includes('youtube.com') &&
        parsedUrl.searchParams.get('v')
      ) {
        normalized += `?v=${parsedUrl.searchParams.get('v')}`;
      } else if (parsedUrl.search) {
        normalized += parsedUrl.search;
      }

      return normalized;
    } catch (error) {
      this.logger.warn(`URL 정규화 실패: ${url} - ${error.message}`);
      return url;
    }
  }

  // async validateLink(url: string): Promise<boolean> {
  //   try {
  //     const response = await axios.head(url, {
  //       timeout: 5000,
  //       validateStatus: (status) => status < 400,
  //     });
  //     return response.status < 400;
  //   } catch (error) {
  //     this.logger.warn(`링크 유효성 검사 실패: ${url} - ${error.message}`);
  //     return false;
  //   }
  // }

  async createLink(createLinkDto: CreateLinkDto, user: User): Promise<any> {
    const { url } = createLinkDto;

    if (url.length > this.MAX_URL_LENGTH) {
      throw new BadRequestException(
        ERROR_MESSAGES.URL_TOO_LONG(this.MAX_URL_LENGTH),
      );
    }

    const normalizedUrl = this.normalizeUrl(url);
    const existingLink = await this.linkRepository.findOne({
      where: { url: normalizedUrl, user: { id: user.id } },
      select: ['id'],
    });

    if (existingLink) {
      throw new BadRequestException(ERROR_MESSAGES.DUPLICATE_LINK);
    }

    // if (!(await this.validateLink(url))) {
    //   throw new BadRequestException(ERROR_MESSAGES.INVALID_LINK);
    // }

    try {
      const htmlContent = await this.webCrawlerService.crawlWebpage(url);
      const extractedText =
        this.webCrawlerService.extractTextFromHtml(htmlContent);
      const { title, description, thumbnail } =
        this.webCrawlerService.extractMetadata(htmlContent, url);

      const category =
        !extractedText || extractedText.length < 50
          ? '콘텐츠 부족'
          : await this.categoryAnalyzerService.analyzeCategory(
              extractedText,
              url,
            );

      const link = this.linkRepository.create({
        url: normalizedUrl,
        category,
        title,
        description,
        thumbnail,
        user,
      });

      const savedLink = await this.linkRepository.save(link);
      return this.formatLinkResponse(savedLink);
    } catch (error) {
      this.logger.error(
        `링크 저장 실패: ${url}, 사용자 ID: ${user.id}, 오류: ${error.message}`,
      );
      throw new InternalServerErrorException(ERROR_MESSAGES.LINK_SAVE_FAILED);
    }
  }

  async getRecentLinks(user: User, limit = 5): Promise<any[]> {
    try {
      const links = await this.linkRepository.find({
        where: { user: { id: user.id } },
        order: { createdAt: 'DESC' },
        take: limit,
        select: [
          'id',
          'url',
          'category',
          'title',
          'description',
          'thumbnail',
          'createdAt',
          'updatedAt',
        ],
        relations: ['user'],
      });
      return links.map((link) => this.formatLinkResponse(link));
    } catch (error) {
      this.logger.error(
        `최근 링크 조회 실패, 사용자 ID: ${user.id}, 오류: ${error.message}`,
      );
      throw new InternalServerErrorException('최근 링크 조회에 실패했습니다.');
    }
  }

  async getAllUserLinks(user: User): Promise<any[]> {
    try {
      const links = await this.linkRepository.find({
        where: { user: { id: user.id } },
        order: { createdAt: 'DESC' },
        select: [
          'id',
          'url',
          'category',
          'title',
          'description',
          'thumbnail',
          'createdAt',
          'updatedAt',
        ],
        relations: ['user'],
      });
      return links.map((link) => this.formatLinkResponse(link));
    } catch (error) {
      this.logger.error(
        `링크 조회 실패, 사용자 ID: ${user.id}, 오류: ${error.message}`,
      );
      throw new InternalServerErrorException(ERROR_MESSAGES.LINKS_FETCH_FAILED);
    }
  }

  // 열람 기록 저장
  async recordLinkOpen(link: Link, user: User): Promise<void> {
    try {
      // 같은 사용자가 같은 링크를 1분 이내에 다시 열람하는 경우 중복 기록 방지
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      const recentHistory = await this.linkOpenHistoryRepository.findOne({
        where: {
          user: { id: user.id },
          link: { id: link.id },
          openedAt: MoreThan(oneMinuteAgo),
        },
      });

      if (!recentHistory) {
        const history = this.linkOpenHistoryRepository.create({
          user,
          link,
        });
        await this.linkOpenHistoryRepository.save(history);
        this.logger.debug(
          `링크 열람 기록 저장: 사용자 ${user.id}, 링크 ${link.id}`,
        );
      }
    } catch (error) {
      this.logger.error(`링크 열람 기록 저장 실패: ${error.message}`);
    }
  }

  // 최근 열어본 링크 조회
  async getRecentlyOpenedLinks(user: User, limit = 5): Promise<any[]> {
    try {
      const histories = await this.linkOpenHistoryRepository
        .createQueryBuilder('history')
        .leftJoinAndSelect('history.link', 'link')
        .leftJoinAndSelect('link.user', 'linkUser')
        .where('history.user.id = :userId', { userId: user.id })
        .orderBy('history.openedAt', 'DESC')
        .limit(limit * 2) // 중복 제거를 위해 여유분 확보
        .getMany();

      // 중복 링크 제거 (가장 최근 열람만 유지)
      const uniqueLinks = [];
      const linkIds = new Set<number>();

      for (const history of histories) {
        if (history.link && !linkIds.has(history.link.id)) {
          uniqueLinks.push(history.link);
          linkIds.add(history.link.id);
        }
        if (uniqueLinks.length >= limit) break;
      }

      return uniqueLinks.map((link) => this.formatLinkResponse(link));
    } catch (error) {
      this.logger.error(
        `최근 열어본 링크 조회 실패, 사용자 ID: ${user.id}, 오류: ${error.message}`,
      );
      throw new InternalServerErrorException(
        '최근 열어본 링크 조회에 실패했습니다.',
      );
    }
  }

  async getLinkById(id: number, user: User): Promise<any> {
    const link = await this.linkRepository.findOne({
      where: { id, user: { id: user.id } },
      select: [
        'id',
        'url',
        'category',
        'title',
        'description',
        'thumbnail',
        'createdAt',
        'updatedAt',
      ],
      relations: ['user'],
    });

    if (!link) {
      throw new NotFoundException(ERROR_MESSAGES.LINK_NOT_FOUND);
    }

    this.recordLinkOpen(link, user).catch((error) => {
      this.logger.error(`열람 기록 저장 중 오류: ${error.message}`);
    });

    return this.formatLinkResponse(link);
  }

  async deleteLink(id: number, user: User): Promise<void> {
    const link = await this.linkRepository.findOne({
      where: { id, user: { id: user.id } },
      select: ['id'],
    });

    if (!link) {
      throw new NotFoundException(ERROR_MESSAGES.LINK_NOT_FOUND);
    }

    // 링크와 연관된 열람 기록 먼저 삭제
    await this.linkOpenHistoryRepository.delete({
      link: { id: link.id },
    });

    // 그 다음 링크 삭제
    await this.linkRepository.remove(link);
  }

  async getTotalLinkCount(user: User): Promise<{ totalCount: number }> {
    try {
      const totalCount = await this.linkRepository.count({
        where: { user: { id: user.id } },
      });
      return { totalCount };
    } catch (error) {
      this.logger.error(
        `총 링크 개수 조회 실패, 사용자 ID: ${user.id}, 오류: ${error.message}`,
      );
      throw new InternalServerErrorException(ERROR_MESSAGES.COUNT_FETCH_FAILED);
    }
  }

  async getOpenedLinkCount(
    user: User,
  ): Promise<{ totalCount: number; openedCount: number }> {
    try {
      // 전체 링크 개수
      const totalCount = await this.linkRepository.count({
        where: { user: { id: user.id } },
      });

      // 열어본 링크 개수 (중복 제거)
      const openedCount = await this.linkOpenHistoryRepository
        .createQueryBuilder('history')
        .leftJoin('history.link', 'link')
        .where('history.user.id = :userId', { userId: user.id })
        .andWhere('link.user.id = :userId', { userId: user.id }) // 자신이 저장한 링크만
        .select('DISTINCT link.id')
        .getCount();

      return { totalCount, openedCount };
    } catch (error) {
      this.logger.error(
        `열어본 링크 개수 조회 실패, 사용자 ID: ${user.id}, 오류: ${error.message}`,
      );
      throw new InternalServerErrorException(
        '열어본 링크 개수 조회에 실패했습니다.',
      );
    }
  }

  // async checkExpiredLinks(): Promise<void> {
  //   const links = await this.linkRepository.find({
  //     select: ['id', 'url', 'category'],
  //   });

  //   for (const link of links) {
  //     if (!(await this.validateLink(link.url))) {
  //       this.logger.warn(`만료된 링크 발견: ${link.url}`);
  //       link.category = '만료된 링크';
  //       await this.linkRepository.save(link);
  //     }
  //   }
  // }

  // @Cron('0 0 * * *') // 매일 자정에 실행
  // async handleExpiredLinks() {
  //   this.logger.log('만료된 링크 확인 작업 시작');
  //   await this.checkExpiredLinks();
  //   this.logger.log('만료된 링크 확인 작업 완료');
  // }

  async getLinksByCategory(category: string, user: User): Promise<any[]> {
    try {
      const normalizedCategory = category.trim();

      if (normalizedCategory === '전체') {
        return this.getAllUserLinks(user);
      }

      if (!CATEGORIES.includes(normalizedCategory)) {
        throw new BadRequestException(
          `유효하지 않은 카테고리: ${normalizedCategory}`,
        );
      }

      const links = await this.linkRepository.find({
        where: { category: normalizedCategory, user: { id: user.id } },
        order: { createdAt: 'DESC' },
        select: [
          'id',
          'url',
          'category',
          'title',
          'description',
          'thumbnail',
          'createdAt',
          'updatedAt',
        ],
        relations: ['user'],
      });
      return links.map((link) => this.formatLinkResponse(link));
    } catch (error) {
      this.logger.error(
        `카테고리별 링크 조회 실패, 사용자 ID: ${user.id}, 카테고리: ${category}, 오류: ${error.message}`,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        ERROR_MESSAGES.CATEGORY_FETCH_FAILED,
      );
    }
  }
}
