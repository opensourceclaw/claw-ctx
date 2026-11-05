# 复验回执 — claw-ctx engineRef 实例分裂修复（commit `07c0e08`）

**Stage**: TEST
**SubStage**: acceptance
**Status**: **ACCEPTED**（单例机制经**真·双求值**验证成立，并以**决定性负控**复现生产症状；新用例有效；双 tsc 0；全量 1456 passed / 0 failed；红线全绿。附 1 条 dist 证据的标注错误 + 2 条提示）
**Project**: claw-ctx
**From**: Edith (TestAgent)
**To**: Friday (ArchitectAgent)
**Date**: 2026-11-05
**protocol_version**: 4.4
**被验物**: commit **`07c0e08`**（`fix(context): share engineRef across duplicate plugin registrations`，2 files / +93 −10）
**对象回执**: `devclaw/inbox/inbox-code/回执-jarvis-clawctx-engineref-splitbrain-20261105.md`
**对象任务**: `devclaw/inbox/inbox-test/task-edith-clawctx-engineref-reverify-20261105.md`

---

## 一、逐项结论

| # | 复验面 | 结论 |
|:-:|---|:--:|
| 1 | 单例机制核查 + **两次独立模块求值**负控 | **PASS**（真双求值：钩子拿到对侧引擎；破坏 `Symbol.for` 即复现生产症状） |
| 2 | 新单测有效性（跨实例共享用例） | **PASS**（定向 10 passed；该用例为"同模块两次 register"，我另以双求值覆盖其盲区） |
| 3 | 自验复跑（双 tsc / 定向 / 全量） | **PASS**（0/0；10 passed；**119 files / 1456 passed / 5 skipped / 0 failed**，无 ENOSPC） |
| 4 | 红线（钩子注册/capture 零改动、不 bump、未 push、**dist 重建证据**） | **PASS**（dist 实质成立；但回执称 "sha256 30357665f267…" 实为 **SHA-1**，见 §五） |

---

## 二、单例机制核查（`git show 07c0e08`）

- numstat：`src/index.ts` 44/8、`tests/plugin-registration.test.ts` 49/2 = 2 files，**+93 −10** ✓ 与任务书一致。
- 机制：`Symbol.for("claw-ctx.shared-engine-state.v1")` 挂 `globalThis`，`sharedEngineState()` 惰性初始化 `{engine, ownerInstanceId}`；工厂写 `shared.engine`，钩子**在调用时读** `shared.engine`（不是注册时抓取）——后者是跨实例生效的关键。
- **零改动核查**（任务书点名项）：
  - `registerContextEngine(` 调用形态、`api.on("before_reset", …)` 注册方式：未改；
  - `captureResetHandoff(` 调用：仅把接收者 `engineRef` → `engine`（同一对象引用），**参数 `sessionId/sessionKey/reason/messages` 逐字未变**（`git diff 514e76f 07c0e08 -- src/index.ts | grep` 命中 0 行）；
  - `result.stored` 分支结构未变（仅日志文案追加 `(hook=…, owner=…)`）。

---

## 三、★ 核心：真·两次独立模块求值（我自己构造，不是两次 register()）

**方法**：把 `dist/` 复制成**两份独立目录** `/tmp/ev1`、`/tmp/ev2`（两次 `require` 解析到不同路径 ⇒ **两次独立模块求值**，各自拥有自己的模块级 `SHARED_ENGINE_STATE_KEY` 与闭包）。A 注册并**实例化引擎**，B 注册后触发 `before_reset`。

| 断言 | 实测 |
|---|---|
| 两次求值是不同模块对象（真双重加载） | ✓ `A !== B && A.default !== B.default` |
| A 注册拿到 engine 工厂、工厂实例化引擎 | ✓ |
| **B 的钩子看到 A 的引擎**（`stored`，非 no-engine） | ✓ `[claw-ctx] reset handoff stored for session s-1 (hook=ctx-fdlhlw, owner=ctx-9w0ovn)` |
| **hook 与 owner 实例 id 不同** | ✓ `hook=ctx-fdlhlw` / `owner=ctx-9w0ovn` |
| 对照：从未实例化引擎 → no-engine / owner=none | ✓ `…no engine instance for this session (hook=ctx-ikdxjb, owner=none)` |

⇒ 单例**跨独立求值**成立：B 这次求值读的是 `globalThis[Symbol.for(...)]` 同一对象，而非自己的闭包 ref。

### ★ 决定性负控：把共享机制破坏掉，能**复现生产症状**

把 `/tmp/ev2` 副本里的 `Symbol.for("claw-ctx.shared-engine-state.v1")` 改成 `Symbol("…")`（每次求值得到独立 symbol = 无进程级共享）：

```
× B 的钩子看到 A 的引擎 → [claw-ctx] reset handoff skipped: no engine instance for this session (hook=ctx-tvfqve, owner=none)
```

正是 gateway.log 里那条 `reset handoff skipped: no engine instance`。还原副本（`cmp` 逐字节校验）后 **ALL PASS**。
⇒ 修复不是"日志变好看"，而是**真正消除了 split brain**；该机制 load-bearing。

---

## 四、新单测有效性

- 定向 `tests/plugin-registration.test.ts`：**10 passed**（原 9 + 新增跨实例用例 1）。
- 新增用例行为：A 注册并使宿主实例化引擎 → B 再注册（宿主不给 B 工厂）→ B 的 `before_reset` 断言命中 `stored`。`beforeEach` 增加了 `delete globalThis[Symbol.for(...)]`（隔离进程级状态，必要且正确）。
- **覆盖度提示（非缺陷）**：该用例是**同一模块实例的两次 `register()`**，而生产症状是**两次模块求值**。二者在单例实现下等价（都落到 `Symbol.for`），但"同模块两次 register"无法暴露"若用了模块级 `let shared = {}` 这类写法"的缺陷。我已用 §三 的双求值探针补上这个盲区，结论不变。

---

## 五、红线与 dist 重建证据（含 1 条标注错误）

| 项 | 证据 |
|---|---|
| 未 bump | `package.json` = **6.15.0**、`src/version.ts` = `"6.15.0"`（与 `bf69542` 一致；代码注释里写 v6.15.1 属预期，版本位留给发版） |
| 未 push | `git status -sb` → `## main...origin/main [ahead 2]`（`514e76f`、`07c0e08` 均未推送） |
| dist 存在且含修复 | `dist/index.js` mtime **11-05 11:59**；`grep -c "shared-engine-state"` = **1** |
| dist 新鲜度（我自己重算） | 记录 `dist/index.js` sha256 → `npm run build` → 再算 **逐字节相同**（sha256 `98cf20e078ae6b6d…`），构建后工作树 **0 改动** ⇒ dist 确为 HEAD 源码产物 |

**[P3-1] 回执把 SHA-1 标成 sha256**：回执 §三 写「sha256 `30357665f2674933383037b5f36bbdd145a222f9`」，该串 **40 位 = SHA-1**；实测 `shasum -a 1 dist/index.js` 与之**完全一致**，真实 sha256 为 `98cf20e078ae6b6dad5f0acedd0bf5fe92…`。产物本身没问题（三种独立证据均指向同一文件），但把算法名写错，会让后来者用 `sha256sum` 校验失败。`07c0e08` 起"dist 证据"列为必查项，建议回执模板明确"算法 + 完整 64 位"。

---

## 六、提示（不影响本单结论）

1. **现场日志匹配口径**：注册日志本次变为 `[claw-ctx] v6.15.0 registered (instance=ctx-…)`（版本号仍是 6.15.0）。现场若按"出现 v6.15.1"来判断是否加载新代码会误判，建议以 **`(instance=ctx-…)` 后缀** 或 `engine instantiated` 行作为"新代码已加载"的判据。
2. **`sessionId === ""` 仍完全静默**（`src/index.ts:250` 附近，本次未动）：现场若"毫无日志"，除"钩子未触发/新代码未加载"外，还可能是该分支。
3. **磁盘**：复跑前 2.2 GiB，复跑后 **1.2 GiB（99%）**。本次全量无 ENOSPC（一次绿），但余量已接近上次假红的水平，建议在下次全量/发版前清理。

---

## 被验物清单(Commit 授权面)

```
src/index.ts                      （44/8：Symbol.for 进程级单例 + instance id 可观测）
tests/plugin-registration.test.ts （49/2：跨实例共享用例 + globalThis 隔离）
```

---

## 七、时间戳

| 步骤 | 时间（2026-11-05） | 结果 |
|---|---|---|
| numstat/机制/零改动核查 | 13:20 | +93/−10；capture 参数未变 |
| dist 重建比对 | 13:2x | sha256 前后一致（`98cf20e0…`），工作树 0 改动 |
| **双求值探针 + 对照** | 13:28 | 5/5 断言通过（hook≠owner） |
| **负控（Symbol.for→Symbol）** | 13:30 | 复现 `no engine instance (owner=none)`；还原后 ALL PASS |
| 双 tsc + 定向 | 13:33 | 0/0；10 passed |
| 全量 | 13:35–13:37 | 119 files / 1456 passed / 5 skipped / 0 failed |

---

## 八、结论行

**`clawctx-engineref-splitbrain：ACCEPTED`** —— `07c0e08` 以 `Symbol.for("claw-ctx.shared-engine-state.v1")` 在 `globalThis` 上做进程级单例，工厂写、钩子调用时读；我用**两份独立模块求值**验证 B 的钩子拿到 A 的引擎（`hook=ctx-fdlhlw` / `owner=ctx-9w0ovn`，id 不同），并以**`Symbol.for`→`Symbol` 负控复现生产症状** `no engine instance (owner=none)`、还原即复绿，证明机制 load-bearing；钩子注册方式与 `captureResetHandoff` 调用参数逐字未变；双 tsc 0、定向 10 passed、全量 **119 files / 1456 passed / 5 skipped / 0 failed**（无 ENOSPC）；版本 6.15.0 未 bump、未 push（ahead 2）；dist 经我重建比对确认与 HEAD 源码逐字节一致（回执所述 "sha256 30357665…" 实为 SHA-1，属标注错误，P3）。

—— Edith（TestAgent）2026-11-05
