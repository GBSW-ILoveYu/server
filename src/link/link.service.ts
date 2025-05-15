import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Link } from './entities/link.entity';
import { User } from '../auth/entities/user.entity';
import { CreateLinkDto } from './dto/link.dto';
import { WebCrawlerService } from '../utils/crawler.util';
import { CategoryAnalyzerService } from '../utils/category-analyzer.util';
import axios from 'axios';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class LinkService {
  private readonly logger = new Logger(LinkService.name);
  private readonly MAX_URL_LENGTH = 2048;

  constructor(
    @InjectRepository(Link)
    private linkRepository: Repository<Link>,
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

  async validateLink(url: string): Promise<boolean> {
    try {
      const response = await axios.head(url, {
        timeout: 5000,
        validateStatus: (status) => status < 400,
      });
      return response.status < 400;
    } catch (error) {
      this.logger.warn(`링크 유효성 검사 실패: ${url} - ${error.message}`);
      return false;
    }
  }

  async createLink(createLinkDto: CreateLinkDto, user: User): Promise<any> {
    const { url } = createLinkDto;

    try {
      if (url.length > this.MAX_URL_LENGTH) {
        throw new BadRequestException(
          `URL은 ${this.MAX_URL_LENGTH}자를 초과할 수 없습니다.`,
        );
      }

      const existingLink = await this.linkRepository.findOne({
        where: { url, user: { id: user.id } },
        relations: ['user'],
      });

      if (existingLink) {
        throw new BadRequestException('이미 등록된 링크입니다.');
      }

      const htmlContent = await this.webCrawlerService.crawlWebpage(url);
      const extractedText =
        this.webCrawlerService.extractTextFromHtml(htmlContent);

      const { title, description, thumbnail } =
        this.webCrawlerService.extractMetadata(htmlContent, url);

      if (!extractedText || extractedText.length < 50) {
        const link = this.linkRepository.create({
          url,
          category: '콘텐츠 부족',
          title,
          description,
          thumbnail,
          user,
        });
        const savedLink = await this.linkRepository.save(link);
        return this.formatLinkResponse(savedLink);
      }

      const category = await this.categoryAnalyzerService.analyzeCategory(
        extractedText,
        url,
      );

      const link = this.linkRepository.create({
        url,
        category,
        title,
        description,
        thumbnail,
        user,
      });

      const savedLink = await this.linkRepository.save(link);
      return this.formatLinkResponse(savedLink);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error.message === '이미 등록된 링크입니다.'
      ) {
        throw error;
      }

      throw new InternalServerErrorException(
        '링크를 저장하는 중 오류가 발생했습니다.',
      );
    }
  }

  async getAllUserLinks(user: User): Promise<any[]> {
    try {
      const links = await this.linkRepository.find({
        where: { user: { id: user.id } },
        order: { createdAt: 'DESC' },
        relations: ['user'],
      });

      return links.map((link) => this.formatLinkResponse(link));
    } catch (error) {
      throw new InternalServerErrorException(
        '링크를 조회하는 중 오류가 발생했습니다.',
      );
    }
  }

  async getLinkById(id: number, user: User): Promise<any> {
    const link = await this.linkRepository.findOne({
      where: { id, user: { id: user.id } },
      relations: ['user'],
    });

    if (!link) {
      throw new NotFoundException('링크를 찾을 수 없습니다.');
    }

    const isValid = await this.validateLink(link.url);
    if (!isValid) {
      throw new BadRequestException('링크가 만료되었습니다.');
    }

    return this.formatLinkResponse(link);
  }

  async deleteLink(id: number, user: User): Promise<void> {
    const link = await this.linkRepository.findOne({
      where: { id, user: { id: user.id } },
    });

    if (!link) {
      throw new NotFoundException('링크를 찾을 수 없습니다.');
    }

    await this.linkRepository.remove(link);
  }

  async getTotalLinkCount(user: User): Promise<{ totalCount: number }> {
    try {
      const count = await this.linkRepository.count({
        where: { user: { id: user.id } },
      });

      return { totalCount: count };
    } catch (error) {
      throw new InternalServerErrorException(
        '총 링크 개수를 조회하는 중 오류가 발생했습니다.',
      );
    }
  }

  async checkExpiredLinks(): Promise<void> {
    const links = await this.linkRepository.find();

    for (const link of links) {
      const isValid = await this.validateLink(link.url);
      if (!isValid) {
        this.logger.warn(`만료된 링크 발견: ${link.url}`);
        link.category = '만료된 링크';
        await this.linkRepository.save(link);
      }
    }
  }

  @Cron('0 0 * * *') // 매일 자정에 실행
  async handleExpiredLinks() {
    this.logger.log('만료된 링크 확인 작업 시작');
    await this.checkExpiredLinks();
    this.logger.log('만료된 링크 확인 작업 완료');
  }

  async getLinksByCategory(category: string, user: User): Promise<any[]> {
    try {
      const normalizedCategory = category.trim();

      const links = await this.linkRepository.find({
        where: { category: normalizedCategory, user: { id: user.id } },
        order: { createdAt: 'DESC' },
        relations: ['user'],
      });

      return links.map((link) => this.formatLinkResponse(link));
    } catch (error) {
      throw new InternalServerErrorException(
        '카테고리별 링크를 조회하는 중 오류가 발생했습니다.',
      );
    }
  }
}
