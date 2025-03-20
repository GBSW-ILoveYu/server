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
              '당신은 콘텐츠 분류 전문가입니다. ' +
              '제공된 웹페이지의 텍스트 내용과, URL, 도메인명을 분석하여 가장 적합한 카테고리를 식별합니다. ' +
              '웹페이지 내용의 주제, 키워드, 전문 용어, 콘텐츠 유형을 분석하여 기술 및 비기술 카테고리를 구분하세요. ' +
              '기술 콘텐츠의 경우 코드 구문, 기술 용어, 프레임워크 이름, 라이브러리 참조 등을 특별히 주목하세요. ' +
              '비기술 콘텐츠의 경우 주요 키워드, 산업 용어, 주제 분야를 파악하세요. ' +
              '분석이 완료되면 반드시 정해진 카테고리 목록에서 하나만 정확히 선택하여 반환하세요. ' +
              '카테고리를 결정할 때 키워드의 발생 빈도, 텍스트에서의 강조도, 전체적인 주제 맥락을 고려하세요. ' +
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
              `다음 웹페이지 콘텐츠를 분석하여 가장 적합한 카테고리 하나만 선택하세요:\n\n` +
              `${text}\n\n` +
              `다음 카테고리 중 하나만 선택하여 정확한 이름을 반환하세요:\n` +
              // 기술 카테고리
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
              `- 네트워크: TCP/IP, OSI 모델, 라우팅, 스위칭, 프록시, VPN, 로드 밸런싱 등 관련 기술\n` +
              `- 시스템 & 운영체제: 리눅스, 윈도우, macOS, 커널, 프로세스, 스레드, 파일 시스템, 가상화 등 관련 기술\n` +
              `- 개발 도구: IDE, 터미널, Git, GitHub, VS Code, Docker Compose, NPM, Yarn, Webpack 등 관련 기술\n` +
              `- 알고리즘: 자료구조, 정렬, 검색, 그래프, 알고리즘 설계, 복잡도 분석, 알고리즘 문제 해결 등 관련 기술\n` +
              // 경제
              `- 창업 & 스타트업: 창업, 스타트업, 벤처, 사업계획, 투자유치, 시드머니, 엑셀러레이터, 인큐베이터 등 관련 주제\n` +
              `- 마케팅 & 광고: 디지털 마케팅, 브랜딩, SNS 마케팅, 콘텐츠 마케팅, 광고, SEO, 그로스 해킹 등 관련 주제\n` +
              `- 금융 & 투자: 주식, 채권, 펀드, 투자전략, 재테크, 암호화폐 투자, 주식시장, 금융상품 등 관련 주제\n` +
              `- 경영 전략: 비즈니스 모델, 기업전략, CEO, 리더십, 조직문화, 경영혁신, 기업사례 등 관련 주제\n` +
              `- 전자상거래: 이커머스, 온라인 쇼핑몰, 플랫폼 비즈니스, 옴니채널, D2C, 물류, 결제 등 관련 주제\n` +
              `- 부동산: 부동산 투자, 임대, 매매, 시장동향, 주택정책, 건설, 부동산 개발 등 관련 주제\n` +
              `- 인사 & 조직 관리: 채용, 인재관리, 조직개발, 인사제도, 기업문화, 평가보상, 노무 등 관련 주제\n` +
              // 디자인
              `- 그래픽 디자인: 포토샵, 일러스트레이터, 디자인 원칙, 타이포그래피, 로고 디자인, 브랜딩 디자인 등 관련 주제\n` +
              `- UI/UX 디자인: 사용자 경험, 인터페이스 디자인, 와이어프레임, 프로토타입, 사용성 테스트, 피그마, 스케치 등 관련 주제\n` +
              `- 사진 & 영상: 사진 촬영, 편집, 영상제작, 촬영기법, 조명, 카메라, 프리미어, 애프터이펙트 등 관련 주제\n` +
              `- 일러스트레이션: 드로잉, 디지털 아트, 캐릭터 디자인, 그림, 페인팅, 만화, 일러스트 등 관련 주제\n` +
              `- 애니메이션: 모션 그래픽, 3D 애니메이션, 스톱모션, 캐릭터 애니메이션, 애니메이팅 기법 등 관련 주제\n` +
              `- 산업 디자인: 제품 디자인, 가구 디자인, 공간 디자인, 프로토타이핑, 3D 모델링, CAD 등 관련 주제\n` +
              `- 패션 디자인: 의류 디자인, 패션 트렌드, 패턴 메이킹, 소재, 컬렉션, 스타일링 등 관련 주제\n` +
              // 교육 & 학습
              `- 온라인 강의: 이러닝, 교육 콘텐츠, 강의 플랫폼, 학습 방법론, 온라인 코스, MOOC 등 관련 주제\n` +
              `- 코딩 & 프로그래밍: 프로그래밍 교육, 코딩 입문, 알고리즘 학습, 개발자 학습경로 등 관련 주제\n` +
              `- 언어 학습: 영어, 제2외국어, 어학공부, 어휘, 회화, 문법, 발음, 언어교환 등 관련 주제\n` +
              `- 자기계발: 생산성, 습관형성, 시간관리, 마인드셋, 목표설정, 독서법, 학습법 등 관련 주제\n` +
              `- 학술 & 연구: 학술논문, 연구방법론, 학문분야, 인용, 논문작성, 연구동향, 학위과정 등 관련 주제\n` +
              `- 자격증 및 시험 준비: 공인시험, 자격증, 시험전략, 문제풀이, 수험정보, 준비방법 등 관련 주제\n` +
              // 취미
              `- 영화 & 드라마: 영화 리뷰, 드라마 분석, 감상평, 추천, 배우, 감독, 스트리밍 콘텐츠 등 관련 주제\n` +
              `- 음악 & 팟캐스트: 음악 추천, 앨범 리뷰, 아티스트, 플레이리스트, 팟캐스트 콘텐츠, 오디오 등 관련 주제\n` +
              `- 게임 리뷰: 게임 평가, 플레이 후기, 게임 추천, e스포츠, 게이밍, 콘솔, PC게임 등 관련 주제\n` +
              `- 웹툰 & 만화: 웹툰 리뷰, 만화 추천, 작가, 작품분석, 코믹스, 일본 만화, 웹툰 플랫폼 등 관련 주제\n` +
              `- 유튜브 & 스트리밍: 유튜버, 스트리머, 콘텐츠 크리에이터, 방송, 트위치, 쇼츠, 라이브 방송 등 관련 주제\n` +
              `- 이벤트 & 페스티벌: 공연, 콘서트, 축제, 전시회, 행사, 컨퍼런스, 콘벤션, 모임 등 관련 주제\n` +
              // 여가
              `- 요리 & 레시피: 요리법, 레시피, 음식, 베이킹, 쿠킹, 식재료, 주방기구, 다이닝 등 관련 주제\n` +
              `- 건강 & 피트니스: 운동, 헬스, 다이어트, 영양, 웰빙, 요가, 명상, 건강관리 등 관련 주제\n` +
              `- 패션 & 뷰티: 패션 트렌드, 스타일링, 코디, 메이크업, 스킨케어, 화장품, 헤어스타일 등 관련 주제\n` +
              `- 자동차: 자동차 리뷰, 시승기, 차량 정보, 구매 가이드, 정비, 튜닝, 오토바이 등 관련 주제\n` +
              `- 스포츠: 스포츠 뉴스, 경기 결과, 팀, 선수, 축구, 야구, 농구, 골프, 테니스 등 관련 주제\n` +
              `- 독서 & 서평: 책 리뷰, 독서 추천, 작가, 출판, 문학, 신간, 독서 모임, 서평 등 관련 주제\n` +
              `- 인테리어: 홈 인테리어, 가구, 인테리어 소품, 집꾸미기, 홈스타일링, 리모델링 등 관련 주제\n` +
              // 뉴스
              `- 국내 뉴스: 국내 시사, 보도, 이슈, 속보, 한국 뉴스, 지역 소식 등 관련 주제\n` +
              `- 국제 뉴스: 해외 소식, 국제 정세, 글로벌 이슈, 외신, 국제관계, 해외 뉴스 등 관련 주제\n` +
              `- IT/테크 뉴스: 기술 뉴스, IT 동향, 신제품, 기술 트렌드, 테크 이슈, 디지털 뉴스 등 관련 주제\n` +
              `- 정치: 정치 뉴스, 국회, 정당, 선거, 정책, 법안, 정치인, 정치 분석 등 관련 주제\n` +
              `- 사회 이슈: 사회문제, 환경, 인권, 노동, 교육, 젠더, 다양성, 사회 현상 등 관련 주제\n` +
              `- 기타: 위 카테고리에 명확히 속하지 않는 콘텐츠\n\n` +
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
