# chatting

three.js 로 만든 3D 인터랙티브 메인 페이지(**TECHBODY — Future Interfaces.**) + `main` 브랜치 자동 배포
(GitHub Actions self-hosted runner + PM2).

## 로컬 개발

```bash
npm install
npm run dev   # http://localhost:3000
```

## 메인 페이지 (3D)

레퍼런스 이미지의 구도(네온 글로우 타이틀 · 유리 바이저 · 크롬 스마트 밴드 · 코드가 빛나는 유리 큐브 ·
떠 있는 아이콘 타일)를 코드로 재현했습니다. 이미지·모델 파일 없이 **지오메트리·재질·텍스처를 전부 코드로 생성**합니다.

| 섹션 (네비게이션) | 스크롤 연출 |
| --- | --- |
| **Home** | 타이틀 글자가 날아와 자리 잡는다. 마우스를 따라 시차/기울기, 타일은 호버 시 발광·클릭 시 해당 섹션으로 이동 |
| **About** | 타이틀이 사방으로 흩어지고, 고글이 한 바퀴 돌며 클로즈업. 큐브들이 고글 뒤에서 궤도를 돈다 |
| **Our Science** | 고글이 빠지고 스마트 밴드가 한 바퀴 돌며 등장 (화면의 링이 스크롤에 맞춰 차오른다) |
| **Pricing** | 두 기기가 위쪽에 나란히, 아래는 유리 가격 카드 |
| **Contact** | 두 기기가 글 양옆에서 천천히 회전 |

- **스크롤 → 3D**: 섹션마다 포즈(카메라·기기·클러스터)를 하나씩 두고 그 사이를 보간합니다. (`scene/layout.js`)
- **관성 스핀**: 빨리 스크롤하면 기기가 휙 돌고(+색수차·FOV 확장), 멈추면 가까운 정위치로 부드럽게 돌아옵니다.
- **반응형**: 가로(레퍼런스 구도)와 세로(모바일) 포즈를 화면비에 따라 섞습니다.
- **접근성/폴백**: `prefers-reduced-motion` 에서는 진입 연출·관성·시차를 끄고, WebGL 을 못 쓰면 CSS 그라디언트 배경 +
  텍스트 타이틀로 대체됩니다. 3D 타일 대신 쓸 수 있는 일반 네비게이션이 항상 있습니다.
- **성능**: three.js 는 하이드레이션 이후 별도 청크로 로드하고, 프레임이 느리면 해상도(DPR)를 단계적으로 낮춥니다.
  `?dpr=1.5` 처럼 URL 로 해상도를 고정해 볼 수도 있습니다.

### 코드 구조

```
app/
  page.jsx                 서버 컴포넌트 — GIT_COMMIT / DEPLOYED_AT 을 푸터에 표시 (배포 확인용)
  layout.jsx               메타데이터 + Sora 폰트(next/font/local)
  globals.css              디자인 토큰, 네비게이션, 섹션/카드, 로더, 반응형
  _components/
    Landing.jsx            HTML 오버레이(네비·섹션·가격·푸터) + 3D 씬 마운트
    scene/
      index.js             렌더러·루프·스크롤/포인터 처리 (진입점)
      layout.js            섹션별 포즈 키프레임, 가로/세로 레이아웃
      environment.js       반사용 스튜디오 환경맵(PMREM)
      backdrop.js          셰이더 배경 + 월드 공간 보케/먼지
      goggles.js           유리 바이저 (surfaces.js 의 "베개형" 곡면 생성기 사용)
      watch.js             크롬 스마트 밴드 + 화면 UI
      title.js             글자별 3D 타이틀 (진입/흩어짐/포인터 물결)
      cubes.js, tiles.js   유리 큐브 / 아이콘 타일
      postfx.js            블룸 + 톤매핑 + FXAA + 색수차/비네팅/그레인
      textures.js          canvas 로 그리는 텍스처(코드, 아이콘, 워치 UI, 회로 패턴)
public/fonts/              3D 타이틀용 typeface JSON (+ OFL 라이선스)
scripts/build-title-font.cjs  글꼴 → typeface JSON 변환기 (글꼴을 바꿀 때만 사용)
```

카피(문구)는 `Landing.jsx`, 색/분위기는 `scene/backdrop.js` 의 `PALETTE`, 섹션별 연출은 `scene/layout.js` 에서 바꿉니다.

> 글꼴: [Sora](https://github.com/sora-xor/sora-font) (SIL OFL 1.1). 라이선스 전문은 `public/fonts/OFL.txt`.

## 자동 배포 흐름

`main`에 push(PR 병합 포함)되면 `.github/workflows/deploy.yml`이 실행됩니다.
서버 RAM이 1GB라서 **빌드는 GitHub 호스티드 러너에서** 하고, 서버는 결과물을 받아 실행만 합니다.

1. **build** (`ubuntu-latest`): `npm ci` → `npm run build` → `scripts/package.sh`로 standalone 결과물을 `bundle.tar.gz`로 묶어 artifact 업로드
2. **deploy** (`self-hosted`): artifact 다운로드·압축 해제 → `deploy.sh`가 `~/apps/chatting/current`로 교체 (직전 버전은 `~/apps/chatting/previous`)
3. PM2로 `chatting` 프로세스 재시작 후 `pm2 save`
4. `http://127.0.0.1:3000/api/health` 헬스 체크, 실패 시 워크플로 실패 처리

Actions 탭에서 `Deploy` 워크플로를 수동 실행(`workflow_dispatch`)할 수도 있습니다.

> 빌드는 x86_64 Linux에서 되므로 서버도 x86_64(E2.1.Micro 등)여야 합니다. ARM(Ampere A1)이면 `build` 잡을 `ubuntu-24.04-arm`으로 바꾸세요.

## 서버 설정

서버 설정 요약은
[docs/SERVER_SETUP.md](docs/SERVER_SETUP.md)를 참고하세요.
