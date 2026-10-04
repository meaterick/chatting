# 서버 설정 매뉴얼

OCI 인스턴스(1 vCPU / 1GB RAM)에 이 저장소(`meaterick/chatting`)의 Next.js 앱을 올리고,
`main` 병합 시 자동 배포 + `https://meaterickchat.kro.kr` HTTPS 서비스까지 구성하는 전체 과정입니다.

## 전체 구조

```
[개발자] ── PR 병합 ──> GitHub main
                          │
                          ▼
              GitHub Actions: Deploy
   ┌──────────────────────┴──────────────────────┐
   │ build 잡 (ubuntu-latest, GitHub 서버)        │
   │  npm ci → next build → bundle.tar.gz 업로드  │
   └──────────────────────┬──────────────────────┘
                          ▼
   ┌─────────────────────────────────────────────┐
   │ deploy 잡 (self-hosted runner, OCI 서버)     │
   │  번들 다운로드 → ~/apps/chatting/current 교체 │
   │  → PM2 재시작 → 헬스 체크                    │
   └─────────────────────────────────────────────┘

[사용자] ──https──> Caddy(:80/:443, 인증서 자동) ──> Next.js(127.0.0.1:3000, PM2)
```

- 서버 RAM이 1GB라 `next build`는 서버에서 하지 않고 GitHub 호스티드 러너에서 합니다.
- 서버는 빌드된 standalone 번들(약 23MB)을 받아 PM2로 실행만 합니다. 앱 메모리 사용량은 약 30~60MB입니다.
- 앱은 `127.0.0.1:3000`에만 바인딩되므로 외부에서는 Caddy를 통해서만 접근됩니다.

## 관련 파일

| 파일 | 역할 |
| --- | --- |
| `.github/workflows/deploy.yml` | `main` push 시 build(GitHub) → deploy(서버) |
| `scripts/package.sh` | 빌드 결과를 `bundle.tar.gz`로 묶음 (server.js, `.next/static`, `public`, PM2 설정, Caddyfile, deploy.sh) |
| `scripts/deploy.sh` | 서버에서 번들을 `~/apps/chatting/current`로 교체, PM2 재시작, 헬스 체크, Caddyfile 변경 시 반영 |
| `ecosystem.config.js` | PM2 설정 (프로세스명 `chatting`, 300MB 초과 시 재시작) |
| `deploy/Caddyfile` | 도메인 → `127.0.0.1:3000` 리버스 프록시 |
| `app/api/health/route.js` | 헬스 체크 엔드포인트 (`/api/health`) |

---

## 0. 사전 준비 (이미 완료된 항목)

- OCI 인스턴스에 `git`, `node`(22.x), `pm2` 설치
- GitHub 저장소에 self-hosted runner 등록 (Settings → Actions → Runners)

CPU 아키텍처를 확인합니다. 빌드는 GitHub의 x86_64 머신에서 하므로 서버도 x86_64여야 합니다.

```bash
uname -m
```

- `x86_64` → 그대로 사용
- `aarch64` (Ampere A1) → `.github/workflows/deploy.yml`의 build 잡을 `runs-on: ubuntu-24.04-arm`으로 변경

> 아래 명령에서 `~`는 **러너를 실행하는 사용자**의 홈입니다. root로 작업할 때는
> `/home/<러너 사용자>/apps/chatting/...`처럼 전체 경로를 쓰세요.

## 1. 스왑 추가 (2GB)

빌드는 서버에서 하지 않지만, 러너·PM2·Node·Caddy가 1GB를 나눠 쓰므로 여유분으로 추가합니다.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab   # 재부팅 후에도 유지
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl --system
free -h   # Swap: 2.0Gi 확인
```

## 2. 러너와 PM2 상시 실행

러너 디렉터리(예: `~/actions-runner`)에서 러너를 서비스로 등록합니다.

```bash
cd ~/actions-runner
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

러너를 실행하는 사용자로 PM2 부팅 자동 시작을 설정합니다.

```bash
pm2 startup   # 출력되는 sudo 명령을 그대로 복사해 실행
```

주의할 점:

- **러너와 PM2는 같은 사용자**로 실행되어야 같은 PM2 데몬(`~/.pm2`)을 씁니다.
- 워크플로의 deploy 단계에는 `RUNNER_TRACKING_ID: ""`가 설정되어 있습니다. 이 값이 없으면 잡이 끝날 때 러너가 자신이 띄운 PM2 데몬까지 종료합니다. 지우지 마세요.

## 3. 첫 배포

`main`에 push/병합하거나 GitHub Actions 탭에서 `Deploy` 워크플로를 수동 실행합니다.

배포 후 서버에서 확인합니다.

```bash
pm2 ls                                   # chatting: online
curl -s http://127.0.0.1:3000/api/health # {"status":"ok","commit":"..."}
ls ~/apps/chatting/current               # server.js, Caddyfile 등
```

## 4. DNS 설정

내도메인.한국에서 `meaterickchat.kro.kr`의 **A 레코드**를 서버 공인 IP(`138.2.113.76`)로 설정합니다.

```bash
ping -c 1 meaterickchat.kro.kr   # 서버 공인 IP가 나오는지 확인
```

## 5. 방화벽: 80, 443 포트 열기

두 군데 모두 열어야 합니다.

**① OCI 콘솔:** VCN → Security Lists → Ingress Rules에 다음 두 규칙 추가

- Source `0.0.0.0/0`, TCP, 포트 `80`
- Source `0.0.0.0/0`, TCP, 포트 `443`

**② 서버 iptables** (OCI Ubuntu 이미지는 기본적으로 REJECT 규칙이 있음)

```bash
sudo iptables -I INPUT 5 -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 5 -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
sudo iptables -L INPUT -n --line-numbers | head -20   # ACCEPT 줄이 REJECT 줄보다 위에 있어야 함
```

3000 포트는 앱이 `127.0.0.1`에만 바인딩되므로 외부에 열 필요가 없습니다 (열어 두었다면 닫아도 됩니다).

## 6. 80 포트를 쓰는 기존 웹서버 끄기

nginx 등이 80 포트를 쓰고 있으면 Caddy가 시작되지 않습니다
(`listen tcp :80: bind: address already in use`).

```bash
sudo ss -tlnp | grep -E ':80 |:443 '
```

결과에 나온 프로그램을 끕니다. nginx로 운영 중인 다른 사이트가 있다면 먼저 Caddyfile로 옮기세요.

```bash
sudo systemctl disable --now nginx     # nginx인 경우
sudo systemctl disable --now apache2   # apache인 경우
```

## 7. Caddy 설치 및 HTTPS 적용

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

배포된 Caddyfile을 적용하고 Caddy를 시작합니다.

```bash
sudo cp ~/apps/chatting/current/Caddyfile /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager -l   # active (running) 확인
```

> `reload`는 Caddy가 **실행 중일 때만** 됩니다. `caddy.service is not active, cannot reload`가
> 나오면 `restart`(또는 `enable --now`)로 시작하세요.

인증서 발급을 확인합니다.

```bash
sudo journalctl -u caddy --no-pager | grep -E "certificate obtained|rateLimited|challenge failed" | tail -5
```

`certificate obtained successfully`가 나오면 `https://meaterickchat.kro.kr` 접속 시 메인 화면(`/`)이 열립니다.
`http://`로 접속하면 자동으로 `https://`로 리다이렉트됩니다.

### Caddyfile 자동 반영 (선택)

`deploy/Caddyfile`을 수정해 `main`에 병합하면 `deploy.sh`가 변경을 감지해 `/etc/caddy/Caddyfile`로 복사하고 `systemctl reload caddy`를 실행합니다.
이를 위해서는 러너 사용자에게 **비밀번호 없는 sudo**가 필요합니다. 없으면 워크플로에 경고만 남기고 넘어가므로 7단계의 복사·reload를 수동으로 하면 됩니다.

러너 사용자에게 필요한 명령만 허용하려면 (`server`를 러너 사용자 이름으로 바꾸세요):

```bash
echo 'server ALL=(root) NOPASSWD: /usr/bin/cp /home/server/apps/chatting/current/Caddyfile /etc/caddy/Caddyfile, /usr/bin/systemctl reload caddy, /usr/bin/true' \
  | sudo tee /etc/sudoers.d/chatting-deploy
sudo chmod 440 /etc/sudoers.d/chatting-deploy
sudo visudo -c
```

---

## 문제 해결

### `caddy.service is not active, cannot reload`

Caddy가 꺼져 있습니다. `sudo systemctl restart caddy` 후 `status`를 확인하세요.

### `listen tcp :80: bind: address already in use`

다른 웹서버(nginx 등)가 80 포트를 사용 중입니다. → [6단계](#6-80-포트를-쓰는-기존-웹서버-끄기)

### `HTTP 429 ... too many certificates (50) already issued for "kro.kr"`

Let's Encrypt는 상위 도메인 하나당 **7일에 50개**까지만 인증서를 발급합니다.
`kro.kr`은 많은 사람이 공유하는 무료 도메인이라 한도가 자주 찹니다. 서버 설정 문제가 아닙니다.

- **기다리기:** Caddy가 자동으로 계속 재시도합니다. 로그의 `retry after` 시각 이후 빈자리가 생기면 발급됩니다. 다른 사용자와 경쟁하므로 바로 된다는 보장은 없습니다.
- **ZeroSSL 함께 쓰기 (더 확실):** Caddy는 이메일이 설정되어 있으면 Let's Encrypt 실패 시 ZeroSSL로 넘어갑니다. `deploy/Caddyfile` 맨 위에 다음을 추가해 `main`에 병합하세요 (서버에서 직접 고치면 다음 배포 때 덮어써질 수 있음).

  ```
  {
  	email 본인이메일@example.com
  }
  ```

### `Timeout during connect (likely firewall problem)`

외부에서 80 포트로 접속이 안 되는 상태입니다. 443으로 하는 인증(tls-alpn)으로 인증서는 받을 수 있지만, `http://` → `https://` 리다이렉트가 동작하지 않습니다.
→ [5단계](#5-방화벽-80-443-포트-열기)의 OCI Security List와 iptables 규칙 순서를 확인하세요.

### 배포 워크플로가 `헬스 체크 실패`로 끝남

```bash
pm2 logs chatting --lines 50 --nostream
```

### 배포는 성공했는데 잡 종료 후 앱이 꺼짐

워크플로에서 `RUNNER_TRACKING_ID: ""`가 빠졌거나, 러너와 PM2 사용자가 다른 경우입니다. → [2단계](#2-러너와-pm2-상시-실행)

---

## 자주 쓰는 명령

```bash
pm2 ls                                  # 앱 상태
pm2 logs chatting                       # 앱 로그
curl -s http://127.0.0.1:3000/api/health
sudo systemctl status caddy --no-pager -l
sudo journalctl -u caddy -n 50 --no-pager -l
free -h                                 # 메모리/스왑
```

## 롤백

`deploy.sh`는 직전 버전을 `~/apps/chatting/previous`에 하나 보관합니다.

```bash
cd ~/apps/chatting
mv current broken && mv previous current
pm2 delete chatting && pm2 start current/ecosystem.config.js && pm2 save
```

또는 GitHub에서 문제 커밋을 revert하는 PR을 병합하면 자동으로 재배포됩니다.
