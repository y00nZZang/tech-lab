---
type: Experiment
title: 브라우저 RPC — Connect와 gRPC-Web/Envoy
description: 동일 proto의 unary와 server streaming을 두 전송 경로에서 관찰하는 합성 실험입니다.
tags: [grpc, connectrpc, protobuf, browser, envoy]
status: draft
sources:
  - id: connect-web
    resource: https://connectrpc.com/docs/web/choosing-a-protocol/
    title: Connect protocol selection
  - id: connect-node
    resource: https://connectrpc.com/docs/node/server-plugins/
    title: Connect Node server adapters
  - id: grpc-web
    resource: https://github.com/grpc/grpc-web
    title: Official grpc-web implementation
---

# 목적과 배경

브라우저에서 같은 proto 계약을 사용하는 Connect와 gRPC-Web/Envoy 경로를 직접 실행합니다. 과거의 기술 선택과 이번 공개 실험은 구분하며, 내부 구현이나 원본 업무 자료를 복제하지 않습니다. 사용자와 함께 관찰할 첫 실습 환경입니다. 학습 전 예상은 작성하지 않았습니다.

## 질문과 구성

- 같은 proto가 두 전송 프로토콜에서 어떻게 사용되는가?
- server streaming 메시지는 종료 전에 순차적으로 보이는가?
- 일부 응답 후 오류와 클라이언트 취소가 어떻게 전달되는가?

1. 브라우저 → Connect(JSON과 binary를 순서대로 관찰; 현재 기본 JSON) → 공식 Connect Node adapter(HTTP/1.1, 8090).
2. 브라우저 → gRPC-Web(binary) → Envoy(8091) → grpc-js(HTTP/2, 50061).

양쪽 브라우저 클라이언트는 `@connectrpc/connect-web` 2.2.0입니다. 라이브러리를 고정하고 transport를 변경합니다.[^connect-web] 공식 `grpc-web` 클라이언트는 별도로 검증하지 않았으며 해당 구현의 server streaming은 grpcwebtext 모드 제약이 있습니다.[^grpc-web] NestJS 커스텀 연동도 아직 포함하지 않았습니다.

## 환경과 의존성

macOS, Docker Desktop 29.4.0, 서버 Node 24.15.0. 브라우저 검증 실행기는 Node 26.3.0에서 저장소 밖 Playwright를 사용했습니다. Browser plugin not available. 의존성은 package.json과 package-lock.json에 고정했습니다. Envoy 1.35.0은 compose.yaml에 digest까지 고정합니다. host.docker.internal을 사용하는 Docker Desktop 환경 기준입니다.

## 설치와 실행

실험 디렉터리에서 실행합니다. proto 생성은 로컬 Buf와 protoc-gen-es로 수행합니다.

```sh
npm ci
npm run generate
npm run server
```

두 번째 터미널:

```sh
docker compose up -d
npm run dev
```

http://127.0.0.1:5178/ 에서 경로 선택 후 Unary → Streaming → 3개 후 오류 → Streaming 중 취소 순서로 관찰합니다. 다른 hostname은 CORS 허용 대상이 아닙니다. 개발용 gRPC listener는 Docker에서 접근하도록 0.0.0.0으로 열립니다.

## 검증과 측정 절차

```sh
npm run check
npm run build
```

check는 Node fetch를 사용하므로 브라우저 CORS 검증을 대신하지 않습니다. 화면의 메시지별 경과 시간과 서버 JSON 로그를 함께 확인합니다. 서버 로그의 `finish.aborted`로 취소가 서버에 도달했는지 확인합니다. 입력은 Echo 문자열과 최대 20개 메시지로 제한한 합성 데이터입니다.

정리할 때 서버와 Vite 터미널에서 Ctrl+C, Envoy는 다음 명령으로 종료합니다.

```sh
docker compose down
```

## 최초 관찰과 한계

- 두 경로 모두 unary 성공 및 1초 간격 5개 메시지 수신을 Chromium에서 확인했습니다.
- 최초 정상 stream 한 번에서 Connect는 약 1010/2008/3008/4010/5012ms, gRPC-Web/Envoy는 약 1013/2012/3012/4016/5018ms에 메시지를 수신했습니다. 정밀 성능 비교가 아닌 순차 도착 관찰입니다.
- 초기 grpc-js 합성 오류 처리에 `call.destroy()`를 사용했을 때 종료 status가 도착하지 않아 오류 검증이 timeout되었습니다. `error` 이벤트로 gRPC status를 전달하도록 수정했습니다. 이는 실험 서버 구현 오류이며 Envoy나 프로토콜의 결함으로 해석하지 않습니다.
- 수정 후 Node 검증은 두 경로의 정상 stream, 3개 후 INTERNAL 오류, 2개 후 취소를 통과했습니다.
- 수정 후 Chromium 브라우저에서도 두 경로의 3개 후 INTERNAL(code=13) 오류와 2개 수신 후 취소(code=1)를 재검증했습니다. 페이지 runtime 오류는 없었습니다. 서버 로그로 취소 전파도 확인했습니다.
- TLS, 인증, 운영 프록시의 buffering, 재연결, client/bidi streaming, 공식 grpc-web 클라이언트, NestJS 생성기는 아직 검증하지 않았습니다. 프로토콜 지원 범위와 개별 구현 지원 범위를 구분합니다.[^connect-node]

## 연결된 블로그 글

후속 블로그 글은 비공개 초안으로 작성 중입니다. 공개 후 링크를 연결합니다.

[^connect-web]: Connect 공식 브라우저 transport 설명.
[^connect-node]: 공식 Node adapter의 HTTP 버전별 지원 범위.
[^grpc-web]: 공식 grpc-web 클라이언트의 지원 범위.

## 두 번째 실습: Connect binary

`src/browser.js`의 Connect transport에 `useBinaryFormat: true`를 설정했습니다. proto, 생성된 서비스 정의와 서버 구현은 그대로 사용합니다. binary 실행을 관찰한 뒤 현재 화면은 기본 JSON으로 되돌렸습니다. 옵션을 켜면 다시 binary로 호출할 수 있습니다.[^connect-web]

Chromium에서 unary와 1초 간격 5개 server streaming의 정상 완료 및 응답 Content-Type을 확인했습니다.

| 호출 | 최초 JSON | binary 변경 후 |
|---|---|---|
| Unary | application/json | application/proto |
| Server streaming | application/connect+json | application/connect+proto |

JSON 최초 Content-Type은 사용자가 Network에서 직접 확인했습니다. binary 변경 후 application/proto와 바이너리 payload는 사용자도 직접 확인했습니다. 인코딩 변경에 따른 성능 비교는 수행하지 않았습니다.

## 2026-10-10 Spring REST와 Armeria gRPC-Web 확장

기존 `proto/lab.proto`를 수정 없이 Maven의 Java/gRPC 코드 생성 입력으로 사용합니다. Spring Boot 애플리케이션 한 프로세스에서 Spring MVC/Tomcat REST(8092)와 Armeria gRPC-Web(8093)을 별도 listener로 실행합니다. Spring과 Armeria를 같은 포트로 통합하는 구성은 이번 실습에 포함하지 않았습니다.

두 진입점은 Spring Bean `EchoLogic`을 공유합니다. REST의 JSON DTO는 수동 정의하며 proto로 자동 생성된 REST 계약이 아닙니다. Armeria는 생성된 `EchoServiceGrpc`와 메시지 타입을 사용합니다. Armeria `GrpcService`의 gRPC-Web 지원을 통해 Envoy 없이 브라우저에서 호출합니다. 근거: https://armeria.dev/docs/server/grpc/

### 실행 환경과 재현

Java 21.0.2, Spring Boot 3.5.16, Armeria 1.42.0, Netty 4.2.18.Final, protoc 3.25.9, gRPC Java codegen 1.84.0. 직접 버전은 `java/pom.xml`, 실제로 해결된 전이 의존성은 `java/dependencies.txt`에 기록했습니다. 의존성 목록은 검증용 snapshot이며 Maven 자체 lockfile은 아닙니다.

실험 디렉터리에서:

```sh
mvn -f java/pom.xml package
java -jar java/target/spring-armeria-lab-0.1.0.jar
```

브라우저 화면의 `Spring REST`를 선택하고 Unary를 호출합니다. 이어서 `gRPC-Web → Armeria`에서 Unary, Streaming, 3개 후 오류, Streaming 중 취소를 실행합니다. Vite가 실행되지 않았다면 별도 터미널에서 `npm ci` 후 `npm run dev`를 실행합니다. Java 경로는 Node 서버나 Envoy 없이 독립적으로 동작합니다.

```sh
node src/check-java.js
```

검증은 Node fetch 기반이며 CORS는 별도 Chromium UI 검증으로 확인했습니다. Java 서버는 Ctrl+C로 종료합니다.

### 실제 결과

- Spring REST: HTTP 200, `application/json`, text와 sequence가 있는 JSON 응답.
- Armeria unary: HTTP 200, `application/grpc-web+proto`, 같은 Echo 결과.
- Armeria server streaming: 5개 메시지가 약 1초 간격으로 도착하고 정상 종료.
- Armeria 중간 오류: 3개 메시지 이후 클라이언트 code=13. HTTP 상태는 200.
- Armeria 취소: 브라우저에서 2개 수신 후 취소하면 클라이언트 code=1. 서버에서는 `cancelled after=3`이 관찰되어 취소 전파 중 추가 메시지 1개를 생성했습니다. 이후 예약 작업을 중단합니다. 클라이언트의 취소 시점과 서버 중단 시점이 같다고 가정하지 않습니다.
- Chromium 페이지 runtime 오류 없음. Browser plugin not available; 기존 personal-blog의 Playwright 실행기를 사용했으며 검증 스크립트와 화면 캡처는 공개 실험 코드에 복제하지 않았습니다.

### 실패 조건과 한계

최초 실행에서 Spring Boot의 dependency management가 Netty를 4.1.135.Final로 선택해 Armeria 1.42.0이 필요로 하는 `IoEventLoopGroup`을 찾지 못했습니다. POM의 `netty.version`을 Armeria 요구 버전 4.2.18.Final로 고정한 뒤 빌드와 실행을 통과했습니다.

REST streaming, TLS, 인증, same-port Spring 통합, backpressure와 대규모 부하, native gRPC Java client는 아직 검증하지 않았습니다. 합성 Echo 결과가 같다는 사실만으로 두 API 계약이 자동 동기화되거나 운영 성능이 같다고 결론짓지 않습니다.
