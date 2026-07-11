# MEMORY.md

> 项目级记忆：记录关键决策、约定、踩坑与待办，避免重复踩坑与决策反复。
> 跨会话持久化，AI Agent 在执行任务前应先读此文件。

## 1. 关键决策记录（ADR 摘要）

### ADR-001：使用 Windows Directory Junction 而非 Symbolic Link
- **背景**：需要让 `~/.agents/skills` 中的 Skill 同时出现在多个 AI 软件目录。
- **决策**：使用 `fs.symlinkSync(target, path, 'junction')` 创建 Junction。
- **原因**：Junction 不需要管理员权限，且对目标为目录的场景更稳定；Symbolic Link 在 Windows 上需提权。
- **影响**：项目锁定为 Windows 平台，跨平台支持需重新设计同步层。

### ADR-001b：Master-Centric 架构与主仓库迁移
- **背景**：原先的 `~/.skills_hub` 概念会导致技能到处都是、管理混乱。
- **决策**：废弃 `~/.skills_hub`，全面切换至以 `~/.agents/skills` 为主仓库的 Master-Centric 架构。主仓库只管理通用技能，平台专属技能由各平台自身目录保留。
- **原因**：统一管理通用技能，避免实体副本散落各处，同时尊重各 AI 软件的平台独特性。
- **影响**：同步引擎（Linker）升级为规划器（Plan-based），在执行前提供大小/时间的冲突解决。

### ADR-002：后端服务采用静态类方法风格
- **背景**：服务层无状态，仅做文件系统与外部命令封装。
- **决策**：所有 service 类使用 `static` 方法。
- **原因**：避免实例化样板代码，调用处更简洁；与 Express 路由处理器天然契合。
- **影响**：新增服务必须沿用此风格。

### ADR-003：前端单文件 App.tsx + Hooks 架构
- **背景**：应用规模可控，过早拆分增加维护成本。
- **决策**：UI 与渲染逻辑集中在 `src/App.tsx`，状态管理提取到 hooks。
- **原因**：便于快速迭代，减少文件跳转；hooks 提供良好的关注点分离。
- **影响**：App.tsx 目标 < 2500 行，状态声明通过 `useAppState` hook 管理。

### ADR-004：OptimizeService 保持规则化，不接入 LLM
- **背景**：早期版本设想调用 LLM 优化 `SKILL.md`。
- **决策**：当前实现为纯规则化。
- **原因**：避免引入 API Key 依赖与网络调用，保证离线可用。
- **影响**：接入 LLM 前需先设计密钥管理与成本控制。

### ADR-005：包管理器锁定 pnpm
- **背景**：用户全局规则要求。
- **决策**：`package.json` 脚本与 `start.bat` 均使用 `pnpm`，禁止 npm/yarn。

### ADR-006：禁用 noUnusedLocals（TypeScript 6.0.3 兼容性）
- **背景**：TypeScript 6.0.3 的 `noUnusedLocals` 对 JSX 中的变量检测过于严格。
- **决策**：在 `tsconfig.app.json` 中设置 `"noUnusedLocals": false`。
- **原因**：解构自 hooks 的变量在 JSX 中使用时被误报为未使用。
- **影响**：需要开发者自行注意未使用的变量，IDE 仍会提供提示。

## 2. 约定清单

### 代码约定
- TypeScript 严格模式（`noUnusedLocals` 已禁用）。
- 后端：`static` 类方法、`fs-extra` 替代原生 `fs`、`gray-matter` 解析 frontmatter。
- 前端：函数组件 + Hooks、`lucide-react` 图标、`framer-motion` 动画、`axios` HTTP。
- 样式：Vanilla CSS + CSS 变量，**禁止** Tailwind / CSS-in-JS。

### API 约定
- 所有路由前缀 `/api/`。
- 错误响应统一：`res.status(500).json({ error: (error as Error).message })`。
- 入参为路径时，必须 `fs.lstat` 校验存在性后再操作。
- `execSync` 调用必须对入口做转义，禁止拼接用户输入到 shell 字符串。

### UX 约定
- 错误反馈统一用 `toast`（已从 `alert` 迁移）。
- 国际化键新增时同步更新 `en` 与 `zh`。
- 危险操作（覆盖、回滚）必须 `confirm` 二次确认。

## 3. 已知问题与陷阱

### 陷阱-1：Junction 在 `fs.lstat` 下的行为
- `fs.lstat(junctionPath).isSymbolicLink()` 对 Junction 返回 `true`，但 `fs.stat` 会跟随到目标。
- **正确做法**：判断"是否为链接"用 `lstat`；判断"目标是否存在"用 `stat` 或 `pathExists`。

### 陷阱-2：快照回滚的自覆盖问题
- `VersionService.rollback` 直接 `fs.emptyDir(skillPath)` 会清空 `.snapshots`。
- **现有实现**：先把 `.snapshots` 移到上级临时目录，回滚后再移回。

### 陷阱-3：`ConfigService` 单例缓存
- `ConfigService.config` 为进程内缓存，`saveConfig` 后会更新缓存。
- **外部修改配置文件**后，需重启后端才能生效。

### 陷阱-4：Lint 正则的 `g` flag 副作用 ✅ 已修复
- **状态**：使用 `content.match(pattern)` + `pattern.lastIndex = 0` 修复。

### 陷阱-5：前端无代理配置 ✅ 已修复
- **状态**：Vite 配置已添加 proxy，所有 API 调用改为相对路径。

### 陷阱-6：KNOWN_PACKAGES 硬编码 ✅ 已修复
- **状态**：已外置为 `server/config/known_packages.json` 配置文件。

### 陷阱-7：TypeScript 6.0.3 noUnusedLocals 与 JSX 不兼容
- 解构自 hooks 的变量在 JSX onClick 等回调中使用时，被误报为 TS6133。
- **解决方案**：在 `tsconfig.app.json` 中禁用 `noUnusedLocals`。

### 陷阱-8：PowerShell 反引号与模板字面量
- PowerShell 的反引号 `` ` `` 是转义字符，在字符串替换中会破坏 JavaScript 模板字面量。
- **解决方案**：使用 `.ps1` 脚本文件或避免在 PowerShell 字符串中使用反引号。

## 4. 待办与改进方向

- [x] Lint 正则 `g` flag 副作用修复（2026-06-24）
- [x] Vite proxy 配置（2026-06-24）
- [x] KNOWN_PACKAGES 外置为配置文件（2026-06-24）
- [x] 前端错误反馈从 `alert` 升级为 `toast`（2026-06-24）
- [x] Vitest 测试框架引入（2026-06-24）
- [x] 创建 hooks 目录，封装状态管理（2026-06-24）
- [x] App.tsx 拆分（2957 → 2546 行）（2026-06-24）
- [ ] App.tsx 继续优化（目标 < 2000 行）
- [ ] OptimizeService 接入 LLM 的密钥管理设计
- [ ] 跨平台支持评估（macOS/Linux 的 symlink 方案）

## 5. 外部依赖与关键路径

### 用户文件系统（运行时读写）
- `~/.agents/skills/` — 中央主仓库（Hub），所有通用 Skill 的权威副本。
- `~/.skills_enhance_config.json` — 用户配置。
- `~/.claude/skills/`、`~/.cursor/skills-cursor/`、`~/.gemini/antigravity/skills/` 等 — 各 AI 软件目录。
- `<skillPath>/.snapshots/` — 版本快照。

### 关键第三方包
- `fs-extra` — 文件系统操作（promise 化 + ensureDir/copy/move）。
- `gray-matter` — frontmatter 解析，**勿替换**为手写 YAML 解析。
- `execSync` — 调用 `git clone` 与 `start`，是命令注入风险点。
- `framer-motion` — 前端动画，版本 ^12。
- `vitest` — 测试框架（2026-06-24 引入）。

## 6. 历史会话要点

> 格式：`- [YYYY-MM-DD] 要点`

- [2026-06-20] 初始化 `AGENTS.md` / `MEMORY.md` / `DESIGN.md` 三份基础文档。
- [2026-06-24] 完成多项改进：
  - 修复 Lint 正则 `g` flag 安全漏洞
  - 配置 Vite proxy，支持非 localhost 部署
  - 拆分 App.tsx（2957 → 2624 行），提取 types.ts、translations.ts、components/
  - 引入 Vitest 测试框架，添加 8 个测试
  - 将 KNOWN_PACKAGES 外置为配置文件
  - 将前端 alert 全部替换为 toast
  - 创建 hooks 目录，封装 API 调用逻辑
- [2026-06-25] 继续重构：
  - 创建 `useAppState` hook（108 行），提取所有状态声明
  - 集成 `useMesh` hook，替换 13 个状态 + 5 个 fetch 函数
  - App.tsx 从 2624 行减少到 2546 行
  - 修复 handleRollback 缺失、模板字面量损坏等问题
  - 禁用 `noUnusedLocals`（TypeScript 6.0.3 兼容性）
  - 最终状态：构建通过，测试 8/8 通过
- [2026-07-03] 架构升级与 UI 完善：
  - 彻底废弃 `.skills_hub`，转向 `~/.agents/skills` 主仓库架构。
  - 重写后端 `linker.ts` 为规划引擎，精准识别缺失、冲突、损坏与独立技能。
  - Dashboard 引入“优化”模态框，提供基于大小与修改时间的可视化冲突解决。
  - Market 重构，移除冗余检测，引入排行榜并标记已安装的技能，防止重复。


### [2026-07-11] Competition Post & Final Polish
- **Competition Post**: Created comprehensive demo post for TRAE competition (学习工作 track). Post includes 6 sections: Demo intro, creation rationale, experience address, TRAE development process (6 phases), experience summary, and tech stack.
- **Screenshots**: Captured 5 product screenshots via Playwright (dashboard, market, settings, sync engine, full dashboard). Stored in `screenshots/` directory.
- **Session IDs**: Documented 3 key development sessions: `6a35f9182acda9c0c85b7741` (Jun 20-24), `6a4898ebb5ac5d0b46b292b3` (Jul 4-7), `6a525b926e029009bdb7dd2a` (Jul 11).
- **Deliverables**: `demo-post.md` (forum post text), `screenshots/` (product images), `.trae-html-share-packages/product-docs/product-docs.html.zip` (interactive HTML demo).

### [2026-07-03] UI Refinement & Multi-Platform Sync
- **UI/UX Aesthetics**: Shifted to a Dark Gold premium aesthetic (background #0a0a0a, accents #c5a059).
- **Skill Visualization**: Refactored the dashboard to hide "Private" and "Master" headers, flattened local skills, filtered out `_shared` from Trae CN, and folded "Symlinked Skills" into concise tag containers.
- **Card Cleanups**: Removed inline Sync/More actions from cards to reduce clutter. Injected 2-line truncated descriptions. Added Source badges (Folder vs Link).
- **Multi-Platform Sync**: Deprecated the immediate inline-sync button. Replaced it with a centralized `MultiPlatformSyncModal` that supports batch platform selection and conflict visibility.
- **CLI & MCP**: Introduced a dedicated CLI Extensions manager to launch terminal commands (`start cmd.exe /k`). Transformed MCP management to focus strictly on NPM-based installations (`npx -y`).
- **Backend Fixes**: Rewrote `CommandService.openFolder` to use asynchronous `exec` instead of blocking `spawnSync` for smoother Windows Explorer invocation.
