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
import axios from 'axios';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import { CATEGORIES } from './constants/categories.constants';
import { urlPattern } from './constants/patterns.constants';
import { contentSelectors } from './constants/selectors.constants';
import { techSelectors } from './constants/selectors.constants';
import { keywordMap } from './constants/keywords.constants';
import { domainKeywords } from './constants/keywords.constants';
import { pathKeywords } from './constants/keywords.constants';

@Injectable()
export class LinkService {
  private readonly logger = new Logger(LinkService.name);
  private openai: OpenAI;

  constructor(
    @InjectRepository(Link)
    private linkRepository: Repository<Link>,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.GPT_KEY,
    });
  }

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
        const htmlContent = await this.crawlWebpage(url);
        const extractedText = this.extractTextFromHtml(htmlContent);

        if (!extractedText || extractedText.length < 50) {
          const link = this.linkRepository.create({
            url,
            category: '콘텐츠 부족',
            user,
          });
          const savedLink = await this.linkRepository.save(link);
          return this.formatLinkResponse(savedLink);
        }

        const category = await this.analyzeCategoryWithAI(extractedText, url);

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

  private async crawlWebpage(url: string): Promise<string> {
    try {
      let formattedUrl = url.trim();

      const urlMatch = formattedUrl.match(urlPattern);

      if (!urlMatch) {
        this.logger.warn(`유효하지 않은 URL 형식: ${formattedUrl}`);
        throw new BadRequestException(
          '유효하지 않은 URL 형식입니다. 올바른 웹사이트 주소를 입력해주세요.',
        );
      }

      formattedUrl = urlMatch[0];

      if (!formattedUrl.startsWith('http')) {
        formattedUrl = `https://${formattedUrl}`;
      }

      try {
        new URL(formattedUrl);
      } catch (error) {
        throw new BadRequestException(
          '유효하지 않은 URL 형식입니다. 올바른 웹사이트 주소를 입력해주세요.',
        );
      }

      const response = await axios.get(formattedUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          'Upgrade-Insecure-Requests': '1',
        },
        timeout: 10000,
        maxRedirects: 5,
        validateStatus: (status) => status < 400,
      });

      return response.data;
    } catch (error) {
      if (error instanceof BadRequestException) {
        this.logger.warn(`URL 형식 오류: ${url} - ${error.message}`);
        throw error;
      }

      this.logger.error(`웹페이지 크롤링 오류 (${url}): ${error.message}`);

      if (error.code === 'ENOTFOUND') {
        throw new BadRequestException('존재하지 않는 도메인입니다.');
      }
      if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
        throw new BadRequestException('웹페이지 로딩 시간이 초과되었습니다.');
      }
      if (error.response && error.response.status === 403) {
        throw new BadRequestException('해당 웹사이트에 접근이 거부되었습니다.');
      }

      throw new InternalServerErrorException(
        `웹페이지를 크롤링하는 중 오류가 발생했습니다: ${error.message}`,
      );
    }
  }

  private extractTextFromHtml(html: string): string {
    try {
      const $ = cheerio.load(html);

      // 불필요한 요소 제거
      $(
        'script, style, svg, iframe, nav, footer, header, aside, noscript, ' +
          '[class*="ads"], [class*="banner"], [id*="ads"], [id*="banner"], ' +
          '[class*="comment"], [id*="comment"], [class*="cookie"], [id*="cookie"], ' +
          '[class*="popup"], [id*="popup"], [aria-hidden="true"], ' +
          '[class*="sidebar"], [id*="sidebar"], [class*="footer"], [id*="footer"], ' +
          '[class*="header"], [id*="header"], [class*="nav"], [id*="nav"], ' +
          '[class*="menu"], [id*="menu"], [role="complementary"]',
      ).remove();

      const title = $('title').text().trim();
      const h1 = $('h1').first().text().trim();
      const metaDescription =
        $('meta[name="description"]').attr('content') || '';
      const metaKeywords = $('meta[name="keywords"]').attr('content') || '';
      const ogTitle = $('meta[property="og:title"]').attr('content') || '';
      const ogDescription =
        $('meta[property="og:description"]').attr('content') || '';
      const ogType = $('meta[property="og:type"]').attr('content') || '';

      let mainContent = '';

      for (const selector of techSelectors) {
        if ($(selector).length) {
          mainContent = $(selector).text();
          break;
        }
      }

      if (!mainContent) {
        for (const selector of contentSelectors) {
          if ($(selector).length) {
            mainContent = $(selector).text();
            break;
          }
        }
      }

      if (!mainContent || mainContent.length < 100) {
        let paragraphs = '';

        const headings = $('h1, h2, h3')
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((text) => text.length > 5)
          .join('\n\n');

        const paragraphTexts = $('p')
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((text) => text.length > 10)
          .join('\n\n');

        const listItems = $('li')
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((text) => text.length > 5)
          .join('\n');

        const codeBlocks = $('pre, code')
          .map((_, el) => $(el).text().trim())
          .get()
          .filter((text) => text.length > 5)
          .join('\n\n');

        paragraphs = `${headings}\n\n${paragraphTexts}\n\n${listItems}\n\n${codeBlocks}`;

        if (paragraphs.length > 100) {
          mainContent = paragraphs;
        } else {
          mainContent = $('body').text();
        }
      }

      const combinedText =
        `제목: ${title || h1 || ogTitle}\n` +
        `설명: ${metaDescription || ogDescription}\n` +
        `키워드: ${metaKeywords}\n` +
        `타입: ${ogType}\n\n` +
        `${mainContent}`;

      const cleanedText = combinedText
        .replace(/\s+/g, ' ') // 여러 공백을 하나로
        .replace(/\n\s*\n+/g, '\n\n') // 여러 줄바꿈을 두 개로
        .replace(/\t/g, ' ') // 탭을 공백으로
        .trim(); // 앞뒤 공백 제거

      return cleanedText.slice(0, 4000);
    } catch (error) {
      this.logger.error(`HTML 텍스트 추출 오류: ${error.message}`, error.stack);
      throw new Error('HTML에서 텍스트를 추출하는 중 오류가 발생했습니다.');
    }
  }

  private async analyzeCategoryWithAI(
    text: string,
    url: string,
  ): Promise<string> {
    try {
      const urlInfo = new URL(url.startsWith('http') ? url : `https://${url}`);
      const domainName = urlInfo.hostname;
      const pathname = urlInfo.pathname;

      const urlBasedCategory = this.estimateCategoryFromUrl(url);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content:
              '당신은 개발자와 기술 분야 전문가를 위한 콘텐츠 분류 전문가입니다. ' +
              '제공된 웹페이지의 텍스트 내용과, URL, 도메인명을 분석하여 가장 적합한 기술 카테고리를 식별합니다. ' +
              '코드 구문, 기술 용어, 프레임워크 이름, 라이브러리 참조 등을 특별히 주목해서 분석하세요. ' +
              '분석이 완료되면 반드시 정해진 카테고리 목록에서 하나만 정확히 선택하여 반환하세요. ' +
              '특히 카테고리를 결정할 때 키워드의 발생 빈도, 텍스트에서의 강조도, 기술적 맥락을 고려하세요. ' +
              '응답은 오직 카테고리 이름 하나만 포함해야 합니다. 설명이나 추가 텍스트 없이 정확한 카테고리명만 반환하세요.',
          },
          {
            role: 'user',
            content:
              `URL 정보:\n` +
              `전체 URL: ${url}\n` +
              `도메인: ${domainName}\n` +
              `경로: ${pathname}\n` +
              `URL 기반 예상 카테고리: ${urlBasedCategory || '알 수 없음'}\n\n` +
              `다음 웹페이지 콘텐츠를 분석하여 가장 적합한 기술 카테고리 하나만 선택하세요:\n\n` +
              `${text}\n\n` +
              `다음 카테고리 중 하나만 선택하여 정확한 이름을 반환하세요:\n` +
              `- 프론트엔드 개발: HTML, CSS, JavaScript, React, Vue, Angular, Next.js, Svelte 등 관련 기술\n` +
              `- 백엔드 개발: 서버, API, Node.js, Express, Spring, Django, NestJS, Laravel, Ruby on Rails 등 관련 기술\n` +
              `- 클라우드 & DevOps: AWS, Azure, GCP, Docker, Kubernetes, CI/CD, Jenkins, GitHub Actions, Terraform 등 관련 기술\n` +
              `- 데이터베이스: SQL, NoSQL, MySQL, PostgreSQL, MongoDB, Redis, GraphQL, ORM, 쿼리 최적화 등 관련 기술\n` +
              `- 데이터 분석: 데이터 시각화, 통계, Pandas, Tableau, Python, R, 빅데이터, 데이터 파이프라인 등 관련 기술\n` +
              `- 모바일 앱 개발: Android, iOS, Flutter, React Native, Swift, Kotlin 등 관련 기술\n` +
              `- 인공지능: AI, 머신러닝, 딥러닝, TensorFlow, PyTorch, LLM, 자연어 처리 등 관련 기술\n` +
              `- 게임 개발: Unity, Unreal Engine, 게임 엔진, 3D 렌더링, 게임 프로그래밍 등 관련 기술\n` +
              `- 블록체인: 암호화폐, Web3, Ethereum, Solidity, 스마트 컨트랙트, NFT 등 관련 기술\n` +
              `- 보안: 사이버보안, 해킹, 침투 테스트, 암호화, 인증, 권한 관리 등 관련 기술\n` +
              `- 기타: 위 카테고리에 명확히 속하지 않는 기술 콘텐츠\n\n` +
              `카테고리 이름만 정확히 반환하세요. 추가 설명이나 분석은 불필요합니다.`,
          },
        ],
        temperature: 0.1,
        max_tokens: 30,
      });

      let category = response.choices[0].message.content.trim();

      if (category.includes(':')) {
        category = category.split(':')[1].trim();
      }
      if (category.includes('.')) {
        category = category.split('.')[0].trim();
      }
      if (category.includes('"') || category.includes("'")) {
        category = category.replace(/['"]/g, '').trim();
      }

      if (!CATEGORIES.includes(category)) {
        const closestCategory = this.findClosestCategory(category);
        if (closestCategory) {
          this.logger.debug(
            `AI 응답 "${category}"를 "${closestCategory}"로 매핑합니다.`,
          );
          return closestCategory;
        }

        if (urlBasedCategory) {
          this.logger.debug(
            `URL 기반으로 "${urlBasedCategory}" 카테고리를 선택합니다.`,
          );
          return urlBasedCategory;
        }

        return '기타';
      }

      return category;
    } catch (error) {
      this.logger.error(`AI 분석 오류: ${error.message}`, error.stack);

      const urlBasedCategory = this.estimateCategoryFromUrl(url);
      if (urlBasedCategory) {
        return urlBasedCategory;
      }

      return '기타';
    }
  }

  private findClosestCategory(text: string): string | null {
    const normalizedText = text.toLowerCase().replace(/\s+/g, '');
    for (const category of CATEGORIES) {
      const normalizedCategory = category.toLowerCase().replace(/\s+/g, '');
      if (
        normalizedText.includes(normalizedCategory) ||
        normalizedCategory.includes(normalizedText)
      ) {
        return category;
      }
    }

    for (const [category, pattern] of Object.entries(keywordMap)) {
      if (pattern.test(text)) {
        return category;
      }
    }

    return null;
  }

  private estimateCategoryFromUrl(url: string): string | null {
    try {
      const urlLower = url.toLowerCase();

      try {
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        const domain = urlObj.hostname;
        const path = urlObj.pathname.toLowerCase();

        for (const [category, domains] of Object.entries(domainKeywords)) {
          if (domains.some((keyword) => domain.includes(keyword))) {
            return category;
          }
        }

        for (const [category, paths] of Object.entries(pathKeywords)) {
          if (paths.some((keyword) => path.includes(keyword))) {
            return category;
          }
        }

        for (const [category, keywords] of Object.entries(pathKeywords)) {
          if (keywords.some((keyword) => urlLower.includes(keyword))) {
            return category;
          }
        }
      } catch (urlError) {
        this.logger.debug(`URL 파싱 오류: ${urlError.message}`);
      }

      return null;
    } catch (error) {
      this.logger.debug(`URL 분석 오류: ${error.message}`);
      return null;
    }
  }
}
