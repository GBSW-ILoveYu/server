import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Link } from './entities/link.entity';
import { User } from '../auth/entities/user.entity';
import { CreateLinkDto } from './dto/link.dto';
import { WebCrawlerService } from '../utils/crawler.util';
import { CategoryAnalyzerService } from '../utils/category-analyzer.util';

@Injectable()
export class LinkService {
  private readonly logger = new Logger(LinkService.name);

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

  async createLink(createLinkDto: CreateLinkDto, user: User): Promise<any> {
    const { url } = createLinkDto;

    try {
      const existingLink = await this.linkRepository.findOne({
        where: { url, user: { id: user.id } },
        relations: ['user'],
      });

      if (existingLink) {
        return this.formatLinkResponse(existingLink);
      }

      try {
        const htmlContent = await this.webCrawlerService.crawlWebpage(url);
        const extractedText =
          this.webCrawlerService.extractTextFromHtml(htmlContent);

        if (!extractedText || extractedText.length < 50) {
          const link = this.linkRepository.create({
            url,
            category: '콘텐츠 부족',
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
          user,
        });

        const savedLink = await this.linkRepository.save(link);
        return this.formatLinkResponse(savedLink);
      } catch (processingError) {
        this.logger.error(
          `분석 오류: ${processingError.message}`,
          processingError.stack,
        );
        const link = this.linkRepository.create({
          url,
          category: '분석 실패',
          user,
        });
        const savedLink = await this.linkRepository.save(link);
        return this.formatLinkResponse(savedLink);
      }
    } catch (error) {
      this.logger.error(`링크 저장 오류: ${error.message}`, error.stack);
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
      this.logger.error(`링크 조회 오류: ${error.message}`, error.stack);
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

  async getTotalLinkCount(user: User): Promise<number> {
    try {
      const count = await this.linkRepository.count({
        where: { user: { id: user.id } },
      });

      return count;
    } catch (error) {
      this.logger.error(
        `총 링크 개수 조회 오류: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        '총 링크 개수를 조회하는 중 오류가 발생했습니다.',
      );
    }
  }
}
