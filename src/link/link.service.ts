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

@Injectable()
export class LinkService {
  private readonly logger = new Logger(LinkService.name);
  private openai: OpenAI;
  private readonly categories = [
    '프론트엔드 개발',
    '백엔드 개발',
    '클라우드 & DevOps',
    '데이터베이스',
    '데이터 분석',
    '모바일 앱 개발',
    '인공지능',
    '게임 개발',
    '블록체인',
    '보안',
    '기타',
  ];

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

      const urlPattern =
        /^(https?:\/\/|www\.)[a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]{0,256}\.[a-z]{2,63}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/i;
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

      const contentSelectors = [
        'article',
        'main',
        '[role="main"]',
        '#content',
        '.content',
        '[class*="content-main"]',
        '[class*="main-content"]',
        '.post',
        '.entry',
        '[class*="article"]',
        '[id*="article"]',
        '[class*="post"]',
        '[id*="post"]',
        '[class*="blog-post"]',
        '[class*="content-body"]',
        '.documentation',
        '.markdown-body',
        '.readme',
        '.wiki-content',
        '.prose',
      ];

      const techSelectors = [
        '.documentation',
        '.markdown-body',
        '.readme',
        '.wiki-content',
        '[class*="docs"]',
        '[id*="docs"]',
        '[class*="api"]',
        '[id*="api"]',
        '[class*="tech"]',
        '[id*="tech"]',
        '.code-example',
        '[class*="tutorial"]',
      ];

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

      if (!this.categories.includes(category)) {
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
    for (const category of this.categories) {
      const normalizedCategory = category.toLowerCase().replace(/\s+/g, '');
      if (
        normalizedText.includes(normalizedCategory) ||
        normalizedCategory.includes(normalizedText)
      ) {
        return category;
      }
    }

    const keywordMap = {
      '프론트엔드 개발':
        /프론트엔드|frontend|프론트|front-end|html|css|javascript|js|react|vue|angular|svelte|웹개발|web\s?development|ui|ux|사용자\s?인터페이스|nextjs|gatsby/i,
      '백엔드 개발':
        /백엔드|backend|서버|back-end|server|api|node|express|spring|django|nestjs|laravel|php|ruby|rails|python|java|서버\s?개발|fastapi|go|golang|rest|restful/i,
      '클라우드 & DevOps':
        /클라우드|cloud|devops|aws|azure|gcp|도커|docker|kubernetes|k8s|ci\/cd|배포|infrastructure|인프라|terraform|ansible|jenkins|github\s?actions|배포|deployment|서버리스|serverless/i,
      데이터베이스:
        /데이터베이스|db|database|sql|nosql|mysql|postgresql|mongodb|oracle|redis|supabase|firebase|firestore|dynamodb|mariadb|데이터\s?모델링|쿼리|query|orm|인덱싱|indexing/i,
      '데이터 분석':
        /데이터\s?분석|data\s?analysis|데이터|빅데이터|bigdata|통계|statistics|pandas|tableau|분석|analysis|시각화|visualization|대시보드|dashboard|데이터\s?마이닝|data\s?mining|etl|power\s?bi|looker|metabase|차트|chart/i,
      '모바일 앱 개발':
        /모바일|mobile|앱|app|android|안드로이드|ios|아이폰|flutter|react\s?native|swift|kotlin|objective-c|xamarin|앱\s?개발|app\s?development|모바일\s?앱|mobile\s?app/i,
      인공지능:
        /인공지능|ai|머신러닝|machine\s?learning|ml|딥러닝|deep\s?learning|dl|tensorflow|pytorch|인공|artificial|gpt|nlp|자연어|natural\s?language|computer\s?vision|컴퓨터\s?비전|chatgpt|openai|huggingface|llm|large\s?language\s?model/i,
      '게임 개발':
        /게임|game|유니티|unity|언리얼|unreal|gaming|게임엔진|game\s?engine|게임\s?개발|game\s?development|게임\s?프로그래밍|3d|렌더링|rendering|게임\s?디자인|godot/i,
      블록체인:
        /블록체인|blockchain|암호화폐|crypto|web3|ethereum|nft|솔리디티|solidity|비트코인|이더리움|스마트\s?컨트랙트|smart\s?contract|토큰|token|dapp|wallet|지갑|코인|coin|분산|decentralized/i,
      보안: /보안|security|해킹|hacking|사이버|cyber|침투|penetration|취약점|vulnerability|암호화|encryption|인증|authentication|권한|authorization|firewall|방화벽|ssl|tls|owasp|보안\s?감사|audit/i,
    };

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

      const domainKeywords = {
        '프론트엔드 개발': [
          'reactjs.org',
          'vuejs.org',
          'angular.io',
          'css-tricks',
          'smashingmagazine',
          'frontendmasters',
          'cssinjs',
          'styled-components',
          'tailwindcss',
          'javascript.info',
          'nextjs',
          'svelte',
          'webpack',
          'frontendex',
          'ui',
          'ux',
          'design',
          'webdev',
        ],
        '백엔드 개발': [
          'nodejs.org',
          'expressjs.com',
          'spring.io',
          'djangoproject.com',
          'nestjs.com',
          'rubyonrails.org',
          'laravel.com',
          'fastapi',
          'flask',
          'php.net',
          'webserver',
          'api',
          'rest',
          'graphql',
          'microservice',
          'serverless',
        ],
        '클라우드 & DevOps': [
          'aws.amazon',
          'azure.microsoft',
          'cloud.google',
          'docker.com',
          'kubernetes.io',
          'terraform.io',
          'jenkins',
          'github.com/actions',
          'gitlab.com/ci',
          'circleci',
          'heroku',
          'netlify',
          'vercel',
          'digitalocean',
          'cloudflare',
          'nginx',
          'devop',
        ],
        데이터베이스: [
          'mysql.com',
          'postgresql.org',
          'mongodb.com',
          'redis.io',
          'mariadb',
          'supabase',
          'firebase',
          'dynamodb',
          'cosmosdb',
          'cassandra',
          'couchdb',
          'elasticsearch',
          'prisma.io',
          'sequelize',
          'typeorm',
          'indexing',
          'query',
        ],
        '데이터 분석': [
          'kaggle.com',
          'tableau.com',
          'powerbi',
          'analytics',
          'pandas.pydata',
          'numpy.org',
          'datacamp',
          'databricks',
          'jupyter',
          'colab',
          'matplotlib',
          'seaborn',
          'plotly',
          'dash',
          'metabase',
          'superset',
          'looker',
          'bigquery',
        ],
        '모바일 앱 개발': [
          'developer.android',
          'developer.apple',
          'flutter.dev',
          'reactnative',
          'ionicframework',
          'xamarin',
          'kotlinlang',
          'swift',
          'objective-c',
          'androidstudio',
          'xcode',
          'mobiledev',
          'appdev',
        ],
        인공지능: [
          'tensorflow.org',
          'pytorch.org',
          'huggingface.co',
          'openai',
          'deepmind',
          'kaggle',
          'machinelearning',
          'deeplearning',
          'neuralnetwork',
          'llm',
          'nlp',
          'transformers',
          'gpt',
          'langchain',
          'opencv',
        ],
        '게임 개발': [
          'unity.com',
          'unrealengine.com',
          'gamedev',
          'gamasutra',
          'godotengine',
          'gamejolt',
          'itch.io',
          'playcanvas',
          'roblox',
          'gamemaker',
          '3dengine',
        ],
        블록체인: [
          'ethereum.org',
          'blockchain',
          'web3',
          'solidity',
          'crypto',
          'bitcoin',
          'metamask',
          'opensea',
          'nft',
          'defi',
          'smartcontract',
          'coinmarketcap',
          'binance',
          'polkadot',
          'cardano',
          'tokenomics',
          'wallet',
        ],
        보안: [
          'hackerone',
          'bugcrowd',
          'owasp.org',
          'security',
          'cyber',
          'pentesting',
          'snyk',
          'veracode',
          'nessus',
          'burpsuite',
          'metasploit',
          'kali',
          'cryptography',
          'infosec',
          'encryption',
          'firewall',
          'authentication',
          'authorization',
        ],
      };

      try {
        const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
        const domain = urlObj.hostname;
        const path = urlObj.pathname.toLowerCase();

        for (const [category, domains] of Object.entries(domainKeywords)) {
          if (domains.some((keyword) => domain.includes(keyword))) {
            return category;
          }
        }

        const pathKeywords = {
          '프론트엔드 개발': [
            'frontend',
            'html',
            'css',
            'javascript',
            'react',
            'vue',
            'angular',
            'webdesign',
            'ui',
            'ux',
            'responsive',
            'web-app',
            'spa',
            'pwa',
            'tailwind',
            'sass',
            'less',
            'dom',
            'typescript',
            'nextjs',
            'svelte',
          ],
          '백엔드 개발': [
            'backend',
            'server',
            'api',
            'node',
            'express',
            'spring',
            'django',
            'laravel',
            'php',
            'ruby',
            'rails',
            'fastapi',
            'dotnet',
            'java',
            'python',
            'serverless',
            'microservice',
            'restful',
            'graphql',
            'nestjs',
          ],
          '클라우드 & DevOps': [
            'cloud',
            'devops',
            'aws',
            'azure',
            'docker',
            'kubernetes',
            'cicd',
            'jenkins',
            'gitlab',
            'github-actions',
            'terraform',
            'infrastructure',
            'deployment',
            'monitoring',
            'logging',
            'prometheus',
            'grafana',
            'nginx',
            'serverless',
            'lambda',
            'elasticbean',
          ],
          데이터베이스: [
            'database',
            'sql',
            'nosql',
            'mysql',
            'postgresql',
            'mongodb',
            'redis',
            'firebase',
            'orm',
            'query',
            'indexing',
            'sharding',
            'replication',
            'prisma',
            'typeorm',
            'sequelize',
            'normalization',
            'transactions',
            'acid',
            'migration',
            'schema',
            'supabase',
          ],
          '데이터 분석': [
            'data-analysis',
            'analytics',
            'statistics',
            'pandas',
            'tableau',
            'visualization',
            'dashboard',
            'data-science',
            'jupyter',
            'bigdata',
            'etl',
            'powerbi',
            'excel',
            'spreadsheet',
            'pivot',
            'regression',
            'forecasting',
            'bi',
            'business-intelligence',
            'matplotlib',
            'seaborn',
          ],
          '모바일 앱 개발': [
            'mobile',
            'android',
            'ios',
            'flutter',
            'react-native',
            'swift',
            'kotlin',
            'xamarin',
            'ionic',
            'objective-c',
            'app-development',
            'mobile-app',
            'responsive',
            'appstore',
            'playstore',
            'progressive-web-app',
            'cordova',
            'capacitor',
          ],
          인공지능: [
            'ai',
            'machine-learning',
            'deep-learning',
            'tensorflow',
            'pytorch',
            'neural-network',
            'natural-language-processing',
            'nlp',
            'computer-vision',
            'image-recognition',
            'reinforcement-learning',
            'model',
            'training',
            'dataset',
            'prediction',
            'classifier',
            'regression',
            'gpt',
            'llm',
            'ml',
          ],
          '게임 개발': [
            'game',
            'unity',
            'unreal',
            'gaming',
            '3d',
            'rendering',
            'game-engine',
            'shader',
            'animation',
            'character-design',
            'level-design',
            'game-mechanics',
            'player-experience',
            'multiplayer',
            'gamedev',
            'indies',
            'puzzle-game',
          ],
          블록체인: [
            'blockchain',
            'crypto',
            'web3',
            'ethereum',
            'solidity',
            'smart-contract',
            'token',
            'wallet',
            'defi',
            'nft',
            'bitcoin',
            'altcoin',
            'mining',
            'consensus',
            'dao',
            'decentralized',
            'chain',
            'ledger',
            'transaction',
          ],
          보안: [
            'security',
            'hacking',
            'cybersecurity',
            'pentest',
            'vulnerability',
            'exploit',
            'encryption',
            'authentication',
            'authorization',
            'firewall',
            'mitigation',
            'protection',
            'risk',
            'threat',
            'assessment',
            'compliance',
            'privacy',
          ],
        };

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
