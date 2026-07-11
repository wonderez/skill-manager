# Skill Manager — 版本路线图

> 基于 AI Agent 生态行业研究制定的前瞻性版本规划。
> 核心差异化定位：**Web GUI + 格式翻译 + Lint 评分 + 版本管理** 的全栈 Skill 管理平台。

---

## v1.0 — 格式翻译官（Format Translator）

**核心洞察**：SKILL.md 已成为开放标准，但 Cursor/Windsurf/Copilot 等需要不同格式。
当前项目只能"拷贝"，不能"翻译"。这是最大的功能缺口，也是最高杠杆的切入点。

| # | 功能 | 描述 |
|---|------|------|
| 1.1 | 跨格式翻译引擎 | SKILL.md → Cursor `.mdc` / Windsurf `.windsurfrules` / Copilot `copilot-instructions.md` / Cline `.clinerules` 的自动转换。基于中间表示（IR）架构 |
| 1.2 | 翻译预览与 Diff | 安装到非原生平台时，展示翻译前后的 diff 视图 |
| 1.3 | Frontmatter 映射 | `triggers` → Cursor `globs` + `alwaysApply`，`description` → Copilot instruction header 等语义映射 |
| 1.4 | 反向收集 | 从 Cursor rules / Copilot instructions 反向解析为 SKILL.md 格式 |
| 1.5 | 平台适配器扩展 | 补齐 Continue、Augment、KiloCode、Junie、Kiro、AdaL、CodeBuddy 等 |

### 架构

```
SKILL.md → [Parser] → IR (Intermediate Representation) → [Transpiler] → .mdc / .windsurfrules / ...
```

---

## v2.0 — 双向同步引擎（Two-Way Sync Engine）

**核心洞察**：多设备、多机器是真实痛点。当前 Junction 只解决单机多平台，不解决跨设备。

| # | 功能 | 描述 |
|---|------|------|
| 2.1 | Git 远程仓库同步 | Hub 绑定 Git 远程仓库，`sync push` / `sync pull` 一键跨设备 |
| 2.2 | 双向收集与合并 | `sync collect` 从所有平台目录反向收集新 Skill → Hub；`sync distribute` 从 Hub 分发到所有平台 |
| 2.3 | 冲突检测与解决 | 同名 Skill 在不同平台有不同版本时，展示 diff 并提供策略 |
| 2.4 | 防循环机制 | Junction/Symlink 自动识别跳过；Copy 模式注入标记防止重复收集 |
| 2.5 | Watch 热重载 | `sync watch` 常驻守护进程，文件变更即时同步 |
| 2.6 | Group 批量操作 | 创建命名分组，一键安装/卸载整套 Skill |

---

## v3.0 — 智能市场与 MCP 融合（Smart Market + MCP Fusion）

**核心洞察**：Skills 教 Agent "怎么做"，MCP 给 Agent "访问什么"。两者配对才是完整工作流。

| # | 功能 | 描述 |
|---|------|------|
| 3.1 | 社区市场聚合 | 聚合 GitHub awesome-agent-skills / anthropics/skills / 社区仓库的元数据 |
| 3.2 | Skills + MCP 配对推荐 | "Works Well With" 关系图谱 |
| 3.3 | MCP Server 管理 | 在同一界面管理 MCP Server 配置 |
| 3.4 | LLM 驱动优化 | 接入 LLM 对 SKILL.md 进行语义优化 |
| 3.5 | Skill 依赖图 | 声明式依赖，安装时自动拉取依赖链 |
| 3.6 | 安全审计增强 | 供应链安全扫描，检测恶意脚本 |

---

## v5.0 — 智能体网络（Agent Mesh）

**核心洞察**：去中心化的 Skill 共享网络。当生态成熟后，中心化市场会让位于 P2P 网络。

| # | 功能 | 描述 |
|---|------|------|
| 5.1 | P2P Skill 分发 | 去中心化 Skill 共享，无需中心服务器 |
| 5.2 | Agent Memory 持久化 | 跨会话、跨项目的 AI 学习记忆存储 |
| 5.3 | 跨 Agent 消息 | 不同 AI Agent 之间通过 Mesh 网络传递上下文 |
| 5.4 | Skill 自动进化 | 基于使用反馈自动优化 Skill 指令 |
| 5.5 | 联邦市场 | 多个组织/社区运行各自的 Skill Registry，通过 Mesh 协议互操作 |

---

## 竞品差异化

| 维度 | skills-sync (CLI) | SkillKit | Skill Manager (我们) |
|------|-------------------|----------|----------------------|
| 形态 | CLI + TUI | CLI | **Web GUI + API** |
| 格式翻译 | 无 | IR + Transpiler | **IR + Transpiler + 可视化 Diff** |
| 同步 | Git 单向 | Git + Mesh P2P | **Git 双向 + 五阶段流水线** |
| 市场 | 无 | 15K+ 聚合 | **Skills + MCP 配对** |
| Lint | 无 | 无 | **0-100 评分 + 安全扫描** |
| 优化 | 无 | Primer 自动生成 | **规则化 + LLM 语义优化** |
| 版本 | 无 | 无 | **快照 + 回滚 + semver** |
