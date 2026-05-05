import type { WeightedEdge } from './routing/graph';

/** 구간별 짧은 안내 문장 (노드 vertex[i]→vertex[i+1] 구간 = 인덱스 i) */
export function buildTurnSegments(
  pathKeys: string[],
  edgeTo: Map<string, WeightedEdge>,
): string[] {
  const out: string[] = [];
  for (let i = 1; i < pathKeys.length; i++) {
    const e = edgeTo.get(pathKeys[i]!);
    if (!e) {
      out.push(`${i}번째 구간으로 이동하세요.`);
      continue;
    }
    const grade = e.meta.slope_grade;
    const warn =
      grade === 'hard'
        ? '급경사 구간입니다. '
        : grade === 'caution'
          ? '경사에 유의하세요. '
          : '';
    const m = Math.round(e.meta.length_m);
    out.push(`${warn}약 ${m}미터 직진하세요.`);
  }
  return out;
}

/** 한 줄만 재생 (구간 통과 시 안내). 큐에 쌓지 않습니다. */
export function speakOnce(text: string): void {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 1;
  synth.speak(u);
}

/** 경로 노드열과 edgeTo 맵으로 한국어 안내 문장 생성 */
export function buildVoiceScript(
  pathKeys: string[],
  edgeTo: Map<string, WeightedEdge>,
): string[] {
  if (pathKeys.length < 2) return ['경로가 너무 짧습니다.'];

  const out: string[] = [];
  let totalM = 0;
  const stage: string[] = [];
  let segAccum = 0;

  for (let i = 1; i < pathKeys.length; i++) {
    const e = edgeTo.get(pathKeys[i]!);
    if (!e) continue;
    totalM += e.meta.length_m;
    segAccum += e.meta.length_m;
    const grade = e.meta.slope_grade;
    const warn =
      grade === 'hard'
        ? '급경사 구간입니다. '
        : grade === 'caution'
          ? '경사에 유의하세요. '
          : '';

    if (segAccum >= 45 || i === pathKeys.length - 1) {
      stage.push(`${warn}약 ${Math.round(segAccum)}미터 이동합니다.`);
      segAccum = 0;
    }
  }

  const minutes = Math.max(1, Math.round(totalM / 70));
  out.push(`경로 안내를 시작합니다. 예상 거리 ${Math.round(totalM)}미터, 도보 약 ${minutes}분입니다.`);
  out.push(...stage);
  out.push('목적지 근처입니다. 안내를 종료합니다.');
  return out;
}

export function speakLines(lines: string[]): void {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  let i = 0;
  const next = () => {
    if (i >= lines.length) return;
    const u = new SpeechSynthesisUtterance(lines[i]!);
    u.lang = 'ko-KR';
    u.rate = 1;
    u.onend = () => {
      i += 1;
      next();
    };
    synth.speak(u);
  };
  next();
}

export function stopSpeaking(): void {
  window.speechSynthesis?.cancel();
}
