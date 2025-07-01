import {
  Injectable,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { urlPattern } from '../constants/patterns.constants';
import {
  contentSelectors,
  techSelectors,
} from '../constants/selectors.constants';

@Injectable()
export class WebCrawlerService {
  private readonly logger = new Logger(WebCrawlerService.name);

  async crawlWebpage(url: string): Promise<string> {
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
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8',
          Referer: 'https://www.google.com/',
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

  extractTextFromHtml(html: string): string {
    try {
      const $ = cheerio.load(html);

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

      const mainContent = this.extractMainContent($);

      const combinedText =
        `제목: ${title || h1 || ogTitle}\n` +
        `설명: ${metaDescription || ogDescription}\n` +
        `키워드: ${metaKeywords}\n` +
        `타입: ${ogType}\n\n` +
        `${mainContent}`;

      const cleanedText = combinedText
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n+/g, '\n\n')
        .replace(/\t/g, ' ')
        .trim();

      return cleanedText.slice(0, 4000);
    } catch (error) {
      this.logger.error(`HTML 텍스트 추출 오류: ${error.message}`, error.stack);
      throw new Error('HTML에서 텍스트를 추출하는 중 오류가 발생했습니다.');
    }
  }

  private extractMainContent($: cheerio.CheerioAPI): string {
    for (const selector of techSelectors) {
      if ($(selector).length) {
        return $(selector).text();
      }
    }

    for (const selector of contentSelectors) {
      if ($(selector).length) {
        return $(selector).text();
      }
    }

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

    const paragraphs = `${headings}\n\n${paragraphTexts}\n\n${listItems}\n\n${codeBlocks}`;

    if (paragraphs.length > 100) {
      return paragraphs;
    }

    return $('body').text();
  }

  extractMetadata(
    html: string,
    url: string,
  ): { title: string; description: string; thumbnail: string } {
    try {
      const $ = cheerio.load(html);

      let title =
        $('meta[property="og:title"]').attr('content') ||
        $('title').text().trim() ||
        $('h1').first().text().trim() ||
        '제목 없음';

      title = this.trimToCompleteSentence(title, 50);

      let description =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        $('p').first().text().trim() ||
        '';

      description = this.trimToCompleteSentence(description, 100);

      let thumbnail =
        $('meta[property="og:image"]').attr('content') ||
        $('meta[name="twitter:image"]').attr('content');

      if (!thumbnail) {
        $('img').each((_, el) => {
          const img = $(el);
          const src = img.attr('src');
          const width = parseInt(img.attr('width') || '0', 10);
          const height = parseInt(img.attr('height') || '0', 10);

          if (src && (width > 100 || height > 100)) {
            if (src.startsWith('/')) {
              const urlObj = new URL(url);
              thumbnail = `${urlObj.protocol}//${urlObj.host}${src}`;
            } else if (!src.startsWith('http')) {
              const urlObj = new URL(url);
              thumbnail = `${urlObj.protocol}//${urlObj.host}/${src}`;
            } else {
              thumbnail = src;
            }
            return false;
          }
        });
      }

      const defaultThumbnail =
        'https://afrojaxx.co.za/wp/wp-content/themes/supermart-ecommerce-pro/images/default.png';

      return { title, description, thumbnail: thumbnail || defaultThumbnail };
    } catch (error) {
      this.logger.error(`메타데이터 추출 오류: ${error.message}`, error.stack);
      return { title: '제목 추출 실패', description: '', thumbnail: null };
    }
  }

  private trimToCompleteSentence(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    const truncated = text.slice(0, maxLength);
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('.'),
      truncated.lastIndexOf('!'),
      truncated.lastIndexOf('?'),
    );

    if (lastSentenceEnd === -1) {
      return truncated + '...';
    }

    return truncated.slice(0, lastSentenceEnd + 1);
  }
}
