# Kasumi_Excavation — System Spec v1.0 (Fuel + Combo Gauge + Overdrive)
작성일: 2026-03-06 (Asia/Seoul)  
범위: **싱글플레이 코어 룰만**. (난이도 스케일링/스테이지/멀티는 Out of Scope)

> 목표: **상/하/좌/우만으로** 플레이되면서도  
> **콤보(색 클러스터) → 연료 환급 → 콤보 게이지 충전 → 폭주(Overdrive)**의 리듬이 생기도록 한다.

---

## 0) 핵심 요약

| 시스템 | 한 줄 정의 | 트리거 | 결과 |
|---|---|---|---|
| Fuel(연료) | “행동 가능한 자원” | 행동할 때 소모 | 0이면 **비상 모드(Limp)** 진입 |
| Combo Event(콤보) | “클러스터 클리어 발생” | 같은 색 컴포넌트 size≥4가 터짐 | Fuel 환급 + ComboGauge 충전 + Chain 갱신 |
| ComboGauge(폭주 게이지) | “하이라이트 모드 트리거” | 콤보 이벤트로 충전 | MAX 도달 즉시 **Overdrive 자동 발동** |
| Overdrive(폭주) | “짧고 강력한 돌파 시간” | ComboGauge MAX | Fuel 무한 + STURDY 1타 + UNBREAKABLE 2단계 파괴 |

---

## 1) 조작 / 입력

| 입력 | 동작 |
|---|---|
| ← → ↓ | 1칸 이동 시도 (블록이면 채굴 시도로 처리) |
| ↑ | 위가 빈칸이면 점프(1칸) / 위가 블록이면 상향 채굴 시도 |

추가 키/버튼 없음.

---

## 2) 블록 타입 규칙(기본)

| 타입 | 기본 규칙(일반 상태) |
|---|---|
| BASIC(색) | HP1: 1회 채굴 시 파괴 + 이동 |
| STURDY(색) | HP2: 1타 HP-1 & 튕김(이동 X), 2타 파괴 + 이동 |
| UNBREAKABLE(무적) | 파괴 불가, 이동 불가. **낙하하지 않는 고정 블록** |
| EVENT(placeholder) | 현재는 BASIC처럼 1회 파괴 + 이동 (추후 확장) |

> 색(Color)은 BASIC/STURDY에만 존재(4색). UNBREAKABLE/EVENT는 무색(또는 중립).

---

## 3) 콤보(색 클러스터) 정의

### 3.1 콤보 이벤트(Combo Event) 정의
**콤보 1회 = “클러스터 클리어(size≥4)가 발생한 것”**.

| 항목 | 정의 |
|---|---|
| 클러스터 | 상하좌우(4-neighbor)로 연결된 “같은 색” 컴포넌트 |
| 클리어 조건 | `componentSize >= CLUSTER_MIN_SIZE` (기본 4) |
| 콤보 카운트 | “한 번의 플레이어 액션(방향 입력)”에서 클리어가 일어나면 **콤보 1회** |
| 1액션 다중 연쇄 | 같은 액션으로 여러 번 터져도 **콤보는 1회만 처리** (오토게임 방지) |

### 3.2 클러스터 클리어 시 블록 처리(독창성 룰 유지)
| 대상 | 처리 |
|---|---|
| BASIC(컴포넌트 내) | 제거(파괴) |
| STURDY(컴포넌트 내) | **제거하지 않고 HP-1** (HP<=0이면 제거) |
| UNBREAKABLE | 영향 없음 |
| EVENT | 영향 없음(또는 BASIC처럼 제거 — 현재는 영향 없음 권장) |

> 제거된 칸은 **플레이 유발 빈칸(EXCAVATED void)** 로 마킹한다.  
> (기존 “EXCAVATED만 붕괴 트리거” 정책 유지)

### 3.3 affected 정의 (보상 계산용)
`affected = basicRemoved + sturdyDamaged + sturdyRemoved`

---

## 4) 콤보 체인(Chain)

콤보를 “연타”로 만들기 위한 템포 보상.

| 항목 | 값(기본) | 설명 |
|---|---:|---|
| CHAIN_WINDOW_TURNS | **3** | 마지막 콤보 이후, **3턴(입력 3회)** 안에 콤보가 다시 나면 체인 유지 |
| turnsSinceCombo | 매 행동마다 +1, 콤보 발생 시 0 | 체인 판정용 |
| chainLevel | 콤보 연속 횟수 | 유지 시 +1, 끊기면 1로 재시작 |

> 튜닝 가능해야 함: `CHAIN_WINDOW_TURNS`는 상수로 노출.

---

## 5) Fuel(연료) 시스템

### 5.1 기본 수치
| 항목 | 값(기본) |
|---|---:|
| FUEL_MAX | 100 |
| 연료 범위 | 0 ~ FUEL_MAX |
| 표시 | 게이지 바 + 숫자 |

### 5.2 소모 정책: **차등 소모(이동/점프/채굴 모두)**
> 의사결정 결과: A안(차등 소모) 적용.

| 행동 유형 | 연료 소모(기본) | 판정 기준 |
|---|---:|---|
| 빈칸 이동(←/→/↓로 빈칸) | -1 | 타겟 셀이 empty |
| 점프(↑로 빈칸) | -2 | 위가 empty이고 grounded일 때 |
| 채굴 시도(블록 방향 이동/상향 채굴 포함) | -3 | 타겟 셀이 block(BASIC/STURDY/UNBREAKABLE/EVENT) |
| 불가 행동(경계 밖/완전 막힘) | -1 | 이동 실패 |

**연료 소모는 “행동 처리 직후” 적용**하고, 0 이하가 되면 0으로 클램프 후 Limp 진입.

### 5.3 콤보 환급(리베이트)
콤보 이벤트 발생 시 Fuel을 회복한다.

| 항목 | 값(기본) | 산식 |
|---|---:|---|
| rebateBase | 4 | `rebate = 4 + affected*1 + min(6, chainLevel)` |
| rebateScale | 1 |  |
| chainBonusMax | 6 |  |

**Fuel = min(FUEL_MAX, Fuel + rebate)**

---

## 6) Fuel 0 상태: 비상 모드(Limp Mode)

> 의사결정 결과: **추가 완충장치(자연회복, 쿨다운 증가) 둘 다 미적용**.  
> (현재는 아래 4개만)

### 6.1 Limp 진입/해제
| 항목 | 조건 |
|---|---|
| 진입 | Fuel이 0이 되면 즉시 Limp = true |
| 해제 | 콤보 환급 등으로 Fuel이 1 이상이 되는 순간 Limp = false |

### 6.2 Limp 규칙
| 항목 | Limp에서의 동작 |
|---|---|
| 점프 | **불가** (↑로 빈칸이어도 점프 안 됨) |
| BASIC 채굴 | **2타 필요** (STURDY처럼 1타는 HP-1 & 튕김, 2타 파괴+이동) |
| STURDY 채굴 | **불가** (튕김만, HP 감소 없음) |
| 연료 소모 | **0** (어떤 행동도 연료 소모 없음) |

> 구현 권장: Limp에서 BASIC도 “내구도(HP)”를 가지게 하여 2타 구조로 처리.  
> (손상 상태는 유지되어도 무방 — 오히려 회복 플레이에 도움)

---

## 7) ComboGauge(폭주 게이지) 시스템

### 7.1 기본 수치
| 항목 | 값(기본) |
|---|---:|
| OD_MAX | 100 |
| 표시 | 게이지 바(0~100) |

### 7.2 충전 규칙
콤보 이벤트 발생 시 ComboGauge를 충전한다.

| 항목 | 값(기본) | 산식 |
|---|---:|---|
| gainBase | 8 | `gain = 8 + affected*2 + min(10, chainLevel*2)` |
| gainScale | 2 |  |
| chainBonusMax | 10 |  |

**ComboGauge = min(OD_MAX, ComboGauge + gain)**

### 7.3 발동
- ComboGauge가 OD_MAX에 도달하면 **즉시 Overdrive 자동 발동**  
- Overdrive 시작 시:
  - `overdriveActive = true`
  - `overdriveTimeLeft = OD_DURATION`
  - `ComboGauge = OD_MAX`
  - Limp가 켜져 있으면 **해제** (폭주가 비상 상태를 덮어씀)

---

## 8) Overdrive(폭주) 모드

### 8.1 기본
| 항목 | 값(기본) |
|---|---:|
| OD_DURATION | 6.0초 |
| 게이지 표시 | 시간에 따라 100→0 감소(시각 피드백) |

폭주 동안:
- ComboGauge 충전 중지(무한 폭주 방지)
- ComboGauge는 **남은 시간 비율로 감소**:  
  `ComboGauge = ceil(OD_MAX * overdriveTimeLeft / OD_DURATION)`

### 8.2 폭주 효과
| 항목 | 폭주 중 동작 |
|---|---|
| Fuel | **무한(소모 0)** |
| STURDY | **1타 파괴 + 이동** (튕김 없음) |
| UNBREAKABLE | **2단계 파괴 가능** (아래 참조) |

### 8.3 UNBREAKABLE 2단계 파괴(폭주 전용)
UNBREAKABLE은 기본적으로 파괴 불가/고정.  
폭주 중에만 아래 상호작용이 열린다.

| 단계 | 조건/행동 | 결과 |
|---|---|---|
| 0 → 1 (균열) | 폭주 중 UNBREAKABLE로 채굴 시도 | **Cracked 상태로 변환**, 이동은 실패(튕김) |
| 1 → 파괴 | 폭주 중 Cracked UNBREAKABLE로 다시 채굴 시도 | 파괴 + 해당 칸으로 이동 |

- **Cracked 상태는 유지되어도 됨**(다음 폭주 때 “2번째 타”를 노릴 수 있는 전략 요소).

---

## 9) 상태 우선순위(충돌 방지)

| 우선순위 | 상태 | 규칙 |
|---:|---|---|
| 1 | Overdrive | 활성 시 Fuel 소모 0, STURDY/UNBREAKABLE 특수 규칙 적용 |
| 2 | Limp | Fuel==0일 때만 활성, Overdrive 시작 시 해제 |
| 3 | Normal | 일반 규칙 |

---

## 10) 점수(간단 제안)
(이번 스펙에서 필수는 아님 — 구현 선택)

| 항목 | 추천 |
|---|---|
| Depth | 최대 y(깊이) |
| Combo Score | `affected^2` 또는 `affected*10` |
| Chain Bonus | `chainLevel * 5` 정도 |

---

## 11) Out of Scope (이번 v1.0에서 하지 않음)
- 난이도 스케일링(Depth에 따른 생성 파라미터 변화)
- 스테이지/바이옴 시스템
- 멀티플레이

---

## 12) 튜닝 가능한 상수 목록(코드 상수로 노출)
| 상수 | 기본값 |
|---|---:|
| CLUSTER_MIN_SIZE | 4 |
| CHAIN_WINDOW_TURNS | **3** |
| FUEL_MAX | 100 |
| OD_MAX | 100 |
| OD_DURATION | 6.0 |
| FuelCost_MoveEmpty | 1 |
| FuelCost_Jump | 2 |
| FuelCost_MineAttempt | 3 |
| FuelCost_Invalid | 1 |
| FuelRebate_Base | 4 |
| FuelRebate_Scale | 1 |
| FuelRebate_ChainCap | 6 |
| ODGain_Base | 8 |
| ODGain_Scale | 2 |
| ODGain_ChainCap | 10 |

---

## 13) 구현 훅(어디서 무엇을 계산해야 하는가)

| 이벤트 | 처리해야 할 것 |
|---|---|
| “플레이어 액션 처리” 끝 | (1) fuel 소모(Overdrive/Limp이면 0) (2) turnsSinceCombo++ |
| “클러스터 클리어 발생” | (1) chain 갱신 (2) Fuel 환급 (3) ComboGauge 충전 (4) Overdrive 발동 체크 |
| “Fuel==0” 도달 | Limp=true |
| “Fuel>=1” (Limp 중) | Limp=false |
| “Overdrive 시간 종료” | overdriveActive=false, ComboGauge=0 |

