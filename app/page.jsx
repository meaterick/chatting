import Landing from "./_components/Landing";

// 배포 정보(GIT_COMMIT / DEPLOYED_AT)는 PM2 가 런타임에 주입하므로 요청마다 렌더링한다.
export const dynamic = "force-dynamic";

export default function Home() {
  const build = {
    commit: process.env.GIT_COMMIT || "local",
    deployedAt: process.env.DEPLOYED_AT || "",
  };

  return <Landing build={build} />;
}
