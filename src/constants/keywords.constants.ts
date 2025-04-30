export const keywordMap = {
  IT: /프론트엔드|백엔드|클라우드|DevOps|데이터베이스|데이터 분석|모바일 앱 개발|인공지능|게임 개발|블록체인|보안|네트워크|운영체제|개발 도구|알고리즘|IT|테크/i,
  경제: /창업|스타트업|마케팅|광고|금융|투자|경영|전자상거래|부동산|인사|조직 관리/i,
  디자인:
    /그래픽 디자인|UI\/UX 디자인|사진|영상|일러스트레이션|애니메이션|산업 디자인|패션 디자인/i,
  '교육 & 학습':
    /온라인 강의|코딩|프로그래밍|언어 학습|자기계발|학술|연구|자격증|시험 준비/i,
  여가: /영화|드라마|음악|팟캐스트|게임 리뷰|웹툰|만화|유튜브|스트리밍|이벤트|페스티벌|요리|레시피|건강|피트니스|패션|뷰티|자동차|스포츠|독서|서평|인테리어/i,
  뉴스: /국내 뉴스|국제 뉴스|IT\/테크 뉴스|정치|사회 이슈/i,
  기타: /기타|분류불가|잡다|혼합|다목적|복합적|일반|무분류/i,
  음식: /요리|레시피|음식|베이킹|쿠킹|식재료|다이닝/i,
  음악: /음악|팟캐스트|노래|앨범|아티스트|플레이리스트|콘서트|공연/i,
  '생활 & 건강':
    /운동|헬스|피트니스|다이어트|요가|명상|웰빙|건강 관리|생활 습관|홈케어|청소|정리정돈|라이프스타일/i,
};

export const domainKeywords = {
  IT: ['tech', 'it', 'dev', 'cloud', 'ai', 'blockchain', 'data', 'security'],
  경제: [
    'finance',
    'startup',
    'business',
    'marketing',
    'ecommerce',
    'realestate',
  ],
  디자인: [
    'design',
    'graphic',
    'ui',
    'ux',
    'illustration',
    'animation',
    'fashion',
  ],
  '교육 & 학습': ['education', 'learning', 'course', 'tutorial', 'study'],
  여가: ['movie', 'music', 'game', 'festival', 'cooking', 'fitness', 'sports'],
  뉴스: ['news', 'politics', 'society', 'world', 'technews'],
  기타: ['misc', 'general', 'uncategorized'],
  음식: ['food', 'recipe', 'cooking', 'baking', 'dining'],
  음악: ['music', 'podcast', 'concert', 'artist', 'playlist'],
  '생활 & 건강': [
    'health',
    'fitness',
    'wellness',
    'lifestyle',
    'yoga',
    'meditation',
    'homecare',
    'cleaning',
    'organizing',
  ],
};
