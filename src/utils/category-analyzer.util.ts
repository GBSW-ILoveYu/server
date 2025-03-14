import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { CATEGORIES } from '../constants/categories.constants';
import {
  keywordMap,
  domainKeywords,
  pathKeywords,
} from '../constants/keywords.constants';

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

      category = this.cleanCategory(category);

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

  private cleanCategory(category: string): string {
    if (category.includes(':')) {
      category = category.split(':')[1].trim();
    }
    if (category.includes('.')) {
      category = category.split('.')[0].trim();
    }
    if (category.includes('"') || category.includes("'")) {
      category = category.replace(/['"]/g, '').trim();
    }

    return category;
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
