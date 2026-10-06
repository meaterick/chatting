import localFont from "next/font/local";
import "./globals.css";

// Sora (SIL OFL) — UI 와 3D 타이틀(public/fonts/sora-extrabold.typeface.json)에 같은 글꼴을 쓴다.
// 가변 폰트 한 파일(latin)로 100~800 굵기를 모두 커버한다.
const sora = localFont({
  src: "./fonts/sora-latin-wght.woff2",
  weight: "100 800",
  display: "swap",
  variable: "--font-sora",
});

export const metadata = {
  title: "TECHBODY — Future Interfaces.",
  description:
    "Spatial visor and chrome smart band. Scroll through an interactive three.js showcase of the next wearable interface.",
};

export const viewport = {
  themeColor: "#060917",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko" className={sora.variable}>
      <body>{children}</body>
    </html>
  );
}
