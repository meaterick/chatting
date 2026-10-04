// PM2 설정. scripts/deploy.sh 가 배포 디렉터리(APP_DIR/current)로 복사한 뒤 사용한다.
module.exports = {
  apps: [
    {
      name: "chatting",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      // 1GB RAM 서버이므로 메모리가 새면 자동 재시작
      max_memory_restart: "300M",
      node_args: "--max-old-space-size=256",
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 3000,
        // Caddy를 통해서만 접근하도록 로컬에만 바인딩
        HOSTNAME: "127.0.0.1",
        GIT_COMMIT: process.env.GIT_COMMIT || "unknown",
        DEPLOYED_AT: process.env.DEPLOYED_AT || "",
      },
    },
  ],
};
