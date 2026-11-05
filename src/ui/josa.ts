/** 받침 유무에 맞는 조사를 붙인다. 예: josa('솔', '과', '와') → '솔과' */
export function josa(word: string, withBatchim: string, without: string): string {
  const last = word.charCodeAt(word.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return `${word}${without}`;
  return `${word}${(last - 0xac00) % 28 !== 0 ? withBatchim : without}`;
}
