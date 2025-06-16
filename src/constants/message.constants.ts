export const ERROR_MESSAGES = {
  URL_TOO_LONG: (max: number) => `URL은 ${max}자를 초과할 수 없습니다.`,
  DUPLICATE_LINK: '이미 등록된 링크입니다.',
  INVALID_LINK: '유효하지 않은 링크입니다.',
  LINK_NOT_FOUND: '링크를 찾을 수 없습니다.',
  LINK_SAVE_FAILED: '링크를 저장하는 중 오류가 발생했습니다.',
  LINKS_FETCH_FAILED: '링크를 조회하는 중 오류가 발생했습니다.',
  CATEGORY_FETCH_FAILED: '카테고리별 링크를 조회하는 중 오류가 발생했습니다.',
  COUNT_FETCH_FAILED: '총 링크 개수를 조회하는 중 오류가 발생했습니다.',
  LINK_EXPIRED: '링크가 만료되었습니다.',
};
