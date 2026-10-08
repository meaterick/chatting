// public/ 의 HTML/CSS/JS 가 참조하는 images/* 주소 뒤에 파일 내용 해시(?v=...)를 붙인다.
// /images 는 30일 캐시되므로, 같은 파일명으로 사진을 교체해도 주소가 바뀌어야 브라우저가 새 사진을 받는다.
// 사용법: node scripts/version-assets.mjs <public 디렉터리>
// 소스(public/)는 건드리지 않도록 scripts/package.sh 가 번들용 복사본에만 적용한다.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("사용법: node scripts/version-assets.mjs <public 디렉터리>");
  process.exit(1);
}

const TEXT_FILES = ["index.html", "style.css", "script.js"];
// images/photo01.webp 처럼 확장자로 끝나고, 이미 ?query 가 붙지 않은 참조만 대상
const REF = /images\/[\w.\-\/]+\.(?:webp|jpe?g|png|gif|svg|avif)(?![\w.?])/g;

const hashes = new Map();
const hashOf = (rel) => {
  if (!hashes.has(rel)) {
    const file = join(dir, rel);
    hashes.set(
      rel,
      existsSync(file)
        ? createHash("sha1").update(readFileSync(file)).digest("hex").slice(0, 10)
        : null
    );
  }
  return hashes.get(rel);
};

let count = 0;
for (const name of TEXT_FILES) {
  const file = join(dir, name);
  if (!existsSync(file)) continue;
  const before = readFileSync(file, "utf8");
  const after = before.replace(REF, (ref) => {
    const hash = hashOf(ref);
    if (!hash) return ref; // 파일이 없으면 그대로 둔다 (script.js 가 안내 상자를 보여줌)
    count++;
    return `${ref}?v=${hash}`;
  });
  if (after !== before) writeFileSync(file, after);
}
console.log(`이미지 주소 ${count}곳에 버전 해시를 붙였습니다.`);
