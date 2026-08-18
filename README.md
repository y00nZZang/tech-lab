---
type: Repository Guide
title: Tech Lab
description: 기술적 질문을 공개 가능한 코드와 데이터로 재현하고 검증하는 공개 실험 저장소입니다.
tags: [technology, experiments, reproducibility, okf]
status: stable
sources:
  - id: okf-spec
    resource: https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md
    title: Open Knowledge Format Specification
---

# Tech Lab

이 저장소는 블로그 글과 기술 학습에서 필요한 가설을 합성 데이터와 공개 가능한 코드로 재현하는 공개 실험실입니다. 문서는 OKF v0.2 형식으로 관리합니다.[^okf-spec]

## 실험 디렉터리

새 실험은 저장소 최상위에 다음 형식으로 만듭니다.

```text
YYYY-MM-DD-<kebab-case-topic>/
├── README.md
├── src/
├── fixtures/
└── results/
```

`src/`, `fixtures/`, `results/`는 실험에 필요할 때만 만듭니다. 빈 예제 실험은 추가하지 않습니다.

## 실험 README 구조

각 실험의 `README.md`는 OKF frontmatter 뒤에 다음 제목을 사용합니다.

```markdown
# 실험 제목

## 목적과 배경
## 질문 또는 가설
## 실제 경험과 공개 실험의 관계
## 실행 환경과 의존성
## 설치와 실행
## 데이터와 fixtures
## 측정 기준과 절차
## 결과
## 해석과 한계
## 연결된 블로그 글
```

결과가 확인되기 전에는 `status: draft`로 두며, 확인하지 않은 수치나 결론을 작성하지 않습니다.

## 운영 흐름

1. 질문과 공개 가능성을 확인합니다.
2. 날짜와 주제를 조합한 실험 디렉터리를 만듭니다.
3. 합성 데이터 또는 재배포 가능한 공개 데이터를 준비합니다.
4. 환경, 실행 명령과 측정 절차를 먼저 기록합니다.
5. 실험을 실행하고 성공·실패 결과 및 한계를 함께 남깁니다.
6. 루트 [인덱스](index.md)와 [변경 기록](log.md)을 갱신합니다.
7. 블로그에서 인용할 때 커밋 SHA 또는 태그를 연결합니다.

[^okf-spec]: Open Knowledge Format Specification v0.2
