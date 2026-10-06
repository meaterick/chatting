/** @type {import('next').NextConfig} */
const nextConfig = {
  // 배포 시 node_modules 전체 대신 최소 런타임만 묶어서 메모리/디스크 사용을 줄임
  output: "standalone",
  // 사이트 본체는 public/ 의 정적 파일(index.html, style.css, script.js, images/)이다.
  async rewrites() {
    return [{ source: "/", destination: "/index.html" }];
  },
};

export default nextConfig;
