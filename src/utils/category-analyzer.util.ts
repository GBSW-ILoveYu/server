import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { CATEGORIES } from '../constants/categories.constants';
import { keywordMap, domainKeywords } from '../constants/keywords.constants';

@Injectable()
export class CategoryAnalyzerService {
  private readonly logger = new Logger(CategoryAnalyzerService.name);
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.GPT_KEY,
    });
  }

  async analyzeCategory(text: string, url: string): Promise<string> {
    try {
      const urlInfo = new URL(url.startsWith('http') ? url : `https://${url}`);
      const domainName = urlInfo.hostname;
      const pathname = urlInfo.pathname;

      const urlBasedCategory = this.estimateCategoryFromUrl(url);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              '당신은 콘텐츠 분류 전문가입니다. 제공된 텍스트와 URL을 분석하여 다음 카테고리 중 하나를 반환하세요: ' +
              CATEGORIES.join(', ') +
              '. 응답은 카테고리 이름만 포함해야 합니다.',
          },
          {
            role: 'user',
            content: `URL: ${url}\n도메인: ${domainName}\n경로: ${pathname}\n\n텍스트:\n${text}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 30,
      });

      let category = response.choices[0].message.content.trim();

      if (!CATEGORIES.includes(category)) {
        const closestCategory = this.findClosestCategory(category);
        if (closestCategory) {
          return closestCategory;
        }

        if (urlBasedCategory) {
          return urlBasedCategory;
        }

        return '기타';
      }

      return category;
    } catch (error) {
      this.logger.error(`카테고리 분석 오류: ${error.message}`, error.stack);
      return '기타';
    }
  }

  private findClosestCategory(text: string): string | null {
    const normalizedText = text.toLowerCase().replace(/\s+/g, '');

    for (const category of CATEGORIES) {
      const normalizedCategory = category.toLowerCase().replace(/\s+/g, '');
      if (normalizedText.includes(normalizedCategory)) {
        return category;
      }
    }

    return null;
  }

  private estimateCategoryFromUrl(url: string): string | null {
    const urlLower = url.toLowerCase();

    for (const [category, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some((keyword) => urlLower.includes(keyword))) {
        return category;
      }
    }

    return null;
  }
}
