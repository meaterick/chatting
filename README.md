# chatting

Next.js 테스트 페이지 + `main` 브랜치 자동 배포 (GitHub Actions self-hosted runner + PM2).

## 로컬 개발

```bash
npm install
npm run dev   # http://localhost:3000
```

## 자동 배포 흐름

`main`에 push(PR 병합 포함)되면 `.github/workflows/deploy.yml`이 실행됩니다.
서버 RAM이 1GB라서 **빌드는 GitHub 호스티드 러너에서** 하고, 서버는 결과물을 받아 실행만 합니다.

1. **build** (`ubuntu-latest`): `npm ci` → `npm run build` → `scripts/package.sh`로 standalone 결과물을 `bundle.tar.gz`로 묶어 artifact 업로드
2. **deploy** (`self-hosted`): artifact 다운로드·압축 해제 → `deploy.sh`가 `~/apps/chatting/current`로 교체 (직전 버전은 `~/apps/chatting/previous`)
3. PM2로 `chatting` 프로세스 재시작 후 `pm2 save`
4. `http://127.0.0.1:3000/api/health` 헬스 체크, 실패 시 워크플로 실패 처리

Actions 탭에서 `Deploy` 워크플로를 수동 실행(`workflow_dispatch`)할 수도 있습니다.

> 빌드는 x86_64 Linux에서 되므로 서버도 x86_64(E2.1.Micro 등)여야 합니다. ARM(Ampere A1)이면 `build` 잡을 `ubuntu-24.04-arm`으로 바꾸세요.

## 서버 1회 설정 (OCI, 1 vCPU / 1GB RAM)

**스왑 추가 (권장)** — 빌드는 서버에서 하지 않지만, 1GB RAM에서 러너·PM2·Node가 함께 돌 때 여유를 위해 추가합니다.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**재부팅 시 PM2 자동 시작**

```bash
pm2 startup   # 출력되는 sudo 명령을 그대로 실행
```

**러너를 서비스로 등록** (러너 디렉터리에서)

```bash
sudo ./svc.sh install && sudo ./svc.sh start
```

> 러너 서비스와 PM2는 같은 사용자로 실행되어야 같은 PM2 데몬을 사용합니다.

**방화벽 3000 포트 열기**

- OCI 콘솔: VCN → Security List → Ingress Rule에 TCP 3000 추가
- 서버 내부 (Ubuntu 이미지 기준):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3000 -j ACCEPT
sudo netfilter-persistent save
```

이후 `http://<서버 공인 IP>:3000` 으로 접속합니다.

## 롤백

```bash
cd ~/apps/chatting
mv current broken && mv previous current
pm2 delete chatting && pm2 start current/ecosystem.config.js && pm2 save
```
