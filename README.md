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

**HTTPS (Caddy)** — `https://meaterickchat.kro.kr` → Caddy(80/443) → Next.js(`127.0.0.1:3000`)

1. DNS(내도메인.한국)에서 `meaterickchat.kro.kr`의 A 레코드를 서버 공인 IP로 설정
2. 80, 443 포트 열기 (OCI Security List + 서버 iptables)

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

3. Caddy 설치 (Ubuntu)

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

4. 저장소의 `deploy/Caddyfile` 적용

```bash
sudo cp ~/apps/chatting/current/Caddyfile /etc/caddy/Caddyfile   # 첫 배포 이후 존재
sudo systemctl reload caddy
```

Caddy가 인증서를 자동 발급·갱신하고 HTTP는 HTTPS로 리다이렉트합니다.
이후 `deploy/Caddyfile`을 수정하면 배포 시 자동 반영됩니다 (러너 사용자에게 비밀번호 없는 sudo가 있을 때만, 없으면 경고만 출력).

앱은 `127.0.0.1:3000`에만 바인딩되므로 3000 포트는 외부에 열 필요가 없습니다.

## 롤백

```bash
cd ~/apps/chatting
mv current broken && mv previous current
pm2 delete chatting && pm2 start current/ecosystem.config.js && pm2 save
```
