/** @type {import('next').NextConfig} */
const nextConfig = {
  // 배포 시 node_modules 전체 대신 최소 런타임만 묶어서 메모리/디스크 사용을 줄임
  output: "standalone",
  // 사이트 본체는 public/ 의 정적 파일(index.html, style.css, script.js, images/)이다.
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }];
  },
  // 사진은 30일간 브라우저 캐시. 같은 파일명으로 교체해도 되도록 scripts/package.sh 가
  // 번들에 들어가는 HTML/CSS/JS 의 images/* 주소에 내용 해시(?v=...)를 붙인다.
  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=2592000" }],
      },
    ];
  },
};

export default nextConfig;
