// 3D 타이틀용 글꼴 변환기: 일반 글꼴(woff/ttf) → three.js FontLoader 가 읽는 typeface JSON (글리프 서브셋).
// 결과물(public/fonts/sora-extrabold.typeface.json)은 저장소에 커밋되어 있으므로 평소엔 실행할 필요가 없다.
// 글꼴을 바꾸고 싶을 때만 아래처럼 임시 설치 후 실행한다.
//
//   npm i --no-save opentype.js@1.3.4 @fontsource/sora
//   node scripts/build-title-font.cjs node_modules/@fontsource/sora/files/sora-latin-800-normal.woff public/fonts/sora-extrabold.typeface.json
//
// Sora (c) The Sora Project Authors, SIL Open Font License 1.1 — public/fonts/OFL.txt 참고.
const fs = require("fs");
const path = require("path");
const opentype = require("opentype.js");

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error("사용법: node scripts/build-title-font.cjs <입력.woff|ttf> <출력.typeface.json>");
  process.exit(1);
}

// 타이틀/숫자/기호만 쓰므로 서브셋으로 줄여 용량을 아낀다
const CHARSET = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:;!?&+-–—/%$#@*'\"()";
const RESOLUTION = 1000;

const buf = fs.readFileSync(path.resolve(input));
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const scale = RESOLUTION / font.unitsPerEm;
const r = (n) => Math.round(n * scale);

const glyphs = {};
for (const ch of CHARSET) {
  const g = font.charToGlyph(ch);
  if (!g || g.index === 0) continue;
  let o = "";
  for (const c of g.path.commands) {
    switch (c.type) {
      case "M": o += `m ${r(c.x)} ${r(c.y)} `; break;
      case "L": o += `l ${r(c.x)} ${r(c.y)} `; break;
      // three.js typeface 형식: 끝점 먼저, 그 다음 제어점
      case "Q": o += `q ${r(c.x)} ${r(c.y)} ${r(c.x1)} ${r(c.y1)} `; break;
      case "C": o += `b ${r(c.x)} ${r(c.y)} ${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} `; break;
      default: break; // Z
    }
  }
  glyphs[ch] = {
    ha: r(g.advanceWidth),
    x_min: r(g.xMin || 0),
    x_max: r(g.xMax || 0),
    o: o.trim(),
  };
}

// 글자쌍 커닝 (0이 아닌 쌍만)
const kerning = {};
const chars = [...CHARSET].filter((c) => glyphs[c] && c !== " ");
for (const a of chars) {
  for (const b of chars) {
    const k = font.getKerningValue(font.charToGlyph(a), font.charToGlyph(b));
    if (k) kerning[a + b] = r(k);
  }
}

const os2 = font.tables.os2 || {};
const out = {
  glyphs,
  kerning,
  familyName: font.names.fullName ? font.names.fullName.en : "Sora ExtraBold",
  ascender: r(font.ascender),
  descender: r(font.descender),
  capHeight: r(os2.sCapHeight || 0.7 * font.unitsPerEm),
  underlinePosition: -100,
  underlineThickness: 50,
  boundingBox: {
    yMin: r(font.tables.head.yMin),
    xMin: r(font.tables.head.xMin),
    yMax: r(font.tables.head.yMax),
    xMax: r(font.tables.head.xMax),
  },
  resolution: RESOLUTION,
  original_font_information: {},
};

fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true });
fs.writeFileSync(path.resolve(output), JSON.stringify(out));
console.log(
  `${Object.keys(glyphs).length}개 글리프, 커닝 ${Object.keys(kerning).length}쌍 → ${output} (${(fs.statSync(output).size / 1024).toFixed(1)} KB)`
);
