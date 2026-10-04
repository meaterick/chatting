// 요청마다 렌더링해서 서버가 살아있는지 확인할 수 있게 함
export const dynamic = "force-dynamic";

export default function Home() {
  const commit = process.env.GIT_COMMIT || "local";
  const deployedAt = process.env.DEPLOYED_AT || "-";

  return (
    <main style={{ maxWidth: 640, margin: "80px auto", padding: "0 16px" }}>
      <h1>chatting 테스트 페이지</h1>
      <p>Next.js 앱이 정상적으로 동작하고 있습니다.</p>
      <ul>
        <li>커밋: <code>{commit}</code></li>
        <li>배포 시각: {deployedAt}</li>
        <li>서버 렌더링 시각: {new Date().toISOString()}</li>
      </ul>
    </main>
  );
}
