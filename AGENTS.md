---
type: Agent Instructions
title: Tech Lab Codex Instructions
description: 공개 기술 실험 저장소에서 Codex가 따라야 할 재현성, 문서화와 공개 안전 규칙입니다.
tags: [codex, experiment, reproducibility, okf]
status: stable
sources:
  - id: okf-spec
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format Specification
  - id: codex-agents-md
    resource: https://developers.openai.com/codex/guides/agents-md/
    title: Custom instructions with AGENTS.md
---

# Tech Lab 작업 규칙

## 저장소 목적

이 저장소는 기술적 질문과 가설을 공개 가능한 코드와 데이터로 재현하고 검증하는 공개 실험실입니다. 실제 업무 경험을 증명하는 저장소가 아니라, 일반화한 문제를 독립적으로 실험하는 공간입니다.

## 디렉터리 규칙

- 모든 실험은 저장소 최상위의 `YYYY-MM-DD-<kebab-case-topic>/` 디렉터리에 만듭니다.
- 날짜는 실험을 시작한 날의 ISO 8601 형식이며 주제는 짧은 영문 kebab-case를 사용합니다.
- 실험 디렉터리에는 반드시 `README.md`를 두고, 필요에 따라 `src/`, `fixtures/`, `results/`를 추가합니다.
- 가짜 실험이나 결과를 예시 목적으로 만들지 않습니다.

## OKF 문서 규칙

- 모든 문서는 OKF v0.2를 따릅니다.[^okf-spec]
- `index.md`와 `log.md`를 제외한 모든 Markdown 파일은 파일 첫 줄부터 YAML frontmatter를 둡니다.
- frontmatter에는 최소한 `type`, `title`, `description`, `tags`, `status`를 기록합니다.
- 외부 근거는 frontmatter의 `sources`에 기록하고, 특정 주장에는 `sources[].id`와 같은 이름의 Markdown 각주를 연결합니다.
- 실험을 만들거나 의미 있게 변경하면 루트 `index.md`와 `log.md`를 함께 갱신합니다.
- 기본 작성 언어는 한국어이며 파일명과 slug는 영문 kebab-case를 사용합니다.

## 실험 README 필수 내용

각 실험의 `README.md`에는 목적과 배경, 질문 또는 가설, 실제 경험과 공개 실험의 관계, 실행 환경과 의존성 버전, 설치·실행·검증 명령, 데이터와 fixture 생성 방법, 측정 기준과 절차, 결과, 해석과 한계, 연결된 블로그 글을 기록합니다.

결과가 아직 없다면 결과를 추정하지 말고 `status: draft`와 미완료 상태를 명시합니다. 성공한 실행만 남기지 말고 결론에 영향을 주는 실패 조건과 환경 제약도 기록합니다.

## 재현성과 공개 안전

- 의존성 버전과 잠금 파일을 커밋하고, 처음부터 실행할 수 있는 명령을 제공합니다.
- 실험 데이터는 합성 데이터 또는 라이선스상 재배포 가능한 공개 데이터만 사용합니다.
- 회사 내부 코드, 실데이터, 고객·직원 정보, 비공개 URL, 원본 응답, 자격증명, 토큰, 쿠키를 저장하지 않습니다.
- 비밀값은 환경변수로 주입하고 실제 값이 없는 `.env.example`만 커밋합니다.
- 큰 바이너리 결과는 무조건 커밋하지 말고 재생성 방법과 요약 결과를 문서화합니다.
- 블로그에서 실험을 인용할 수 있도록 재현 가능한 Git 커밋 SHA 또는 태그를 유지합니다.
- 근거 없는 수치, 성능 개선, 인과관계 또는 일반화를 만들지 않습니다.

## Codex 컨텍스트

Codex는 Git 루트의 `AGENTS.md`를 프로젝트 지침으로 읽습니다.[^codex-agents-md] 특정 실험에 추가 규칙이 꼭 필요한 경우에만 해당 실험 디렉터리에 `AGENTS.md`를 추가하고, 임시 override나 비표준 fallback 파일은 만들지 않습니다.

[^okf-spec]: Open Knowledge Format Specification v0.2
[^codex-agents-md]: OpenAI 공식 Codex AGENTS.md 문서
