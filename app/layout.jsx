export const metadata = {
  title: "chatting",
  description: "Next.js 자동 배포 테스트 페이지",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>
        {children}
      </body>
    </html>
  );
}
