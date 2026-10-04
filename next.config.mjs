/** @type {import('next').NextConfig} */
const nextConfig = {
  // 배포 시 node_modules 전체 대신 최소 런타임만 묶어서 메모리/디스크 사용을 줄임
  output: "standalone",
};

export default nextConfig;
