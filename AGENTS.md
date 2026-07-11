# AGENTS.md

> 本文件为 AI Agent（Claude Code / Cursor / Codex 等）在本仓库中工作时的统一指引。
> 阅读本文件可快速理解项目约束、命令、目录结构与协作规范。

## 1. 项目概览

**Skill Manager** 是一个用于集中管理 AI Agent "Skills"（基于 `SKILL.md` 标准）的桌面 Web 应用。

- **后端**：Node.js + Express 5，负责高权限文件系统操作、GitHub 克隆、Lint 校验。
- **前端**：React 19 + Vite 8，使用 Vanilla CSS 实现玻璃拟态设计系统。
- **同步引擎**：通过 Windows Directory Junction 将中央 Hub 中的 Skill 链接到多个 AI 软件目录，避免文件重复。

**核心目标**：让用户在一个界面内完成 Skill 的发现、安装、创建、优化、版本回滚和跨平台同步。

## 2. 环境与前置条件

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Node.js | ≥ 20 | 使用原生 ESM |
| pnpm | ≥ 9 | **必须使用 pnpm，禁止 npm/yarn** |
| 操作系统 | Windows 11 | 依赖 Directory Junction，非跨平台 |
| TypeScript | ~6.0.2 | 严格模式 |

## 3. 常用命令

```powershell
# 安装依赖（仅首次或 lockfile 变更时）
pnpm install

# 同时启动前后端（推荐开发入口）
pnpm dev:all

# 单独启动后端（带 nodemon 热重载）
pnpm server:dev

# 单独启动前端 Vite
pnpm dev

# 类型检查 + 生产构建
pnpm build

# ESLint 检查
pnpm lint

# 启动后端（无热重载，单次运行）
pnpm server
```

**端口约定**：
- 后端 API：`http://localhost:3001`
- 前端 Dev Server：`http://localhost:5173`
- `start.bat` 会先清理这两个端口再启动。

## 4. 目录结构

```
skills_enhance/
├── server/                    # 后端 Express 服务
│   ├── index.ts               # 路由入口，所有 REST API 定义于此
│   └── services/              # 业务服务层（静态类方法风格）
│       ├── adapters.ts        # 平台适配器（Claude/Cursor/Copilot/Antigravity…）
│       ├── config.ts          # 用户配置读写（~/.skills_enhance_config.json）
│       ├── import.ts          # GitHub 仓库导入与子 Skill 扫描
│       ├── lint.ts            # SKILL.md 健康度评分（安全/结构/质量）
│       ├── optimize.ts        # 规则化优化（补全 frontmatter/章节）
│       ├── path.ts            # AI 软件目录自动发现
│       └── version.ts         # 快照与回滚
├── src/                       # 前端 React 应用
│   ├── App.tsx                # 单文件应用（仪表盘/市场/设置三 Tab）
│   ├── App.css                # 应用专属样式
│   ├── index.css              # 全局设计系统变量与基础样式
│   └── main.tsx               # React 入口
├── public/                    # 静态资源
├── start.bat                  # Windows 一键启动脚本
├── vite.config.ts
├── tsconfig.json              # 项目引用根
├── tsconfig.app.json          # 前端 TS 配置
├── tsconfig.node.json         # Node 端 TS 配置
└── package.json
```

## 5. 架构关键点

### 5.1 平台适配器模式（`server/services/adapters.ts`）

每个 AI 工具一个 `PlatformAdapter` 实现，统一接口：
- `getSkillsDir()` — Skills 落盘位置
- `isInstalled()` — 是否已安装该 AI 软件
- `install(source)` — 按平台正确方式安装（npx / git clone / 本地拷贝）
- `getPostInstallHint()` — 给用户的后续提示

**新增平台支持时**：实现 `PlatformAdapter` 接口 → 注册到 `getAllAdapters()` → 必要时在 `KNOWN_PACKAGES` 中补充安装命令映射。**禁止**通过简单拷贝 `SKILL.md` 实现"安装"，因为各平台需要不同的激活文件（manifest / hook / context）。

### 5.2 Lint 规则（`server/services/lint.ts`）

- 评分 0–100，等级 A–F。
- 三级问题：`error`（-25）/ `warning`（-8）/ `info`（-2）。
- 强制门：缺 frontmatter / name / description 时分数上限 30。
- 安全检查覆盖：OpenAI / AWS / GitHub / Google / 通用 API Key、密码硬编码、内网 URL（alibaba-inc / taobao / alipay / RFC1918）。
- **修改 Lint 规则时**同步更新 `src/App.tsx` 中的 `LintIssue` / `SkillMetrics` 接口。

### 5.3 配置存储

- 用户配置：`~/.skills_enhance_config.json`（单例缓存于 `ConfigService.config`）。
- 中央主仓库：`~/.agents/skills/`，所有通用 Skill 的权威副本。
- 快照：`<skillPath>/.snapshots/<ISO时间戳>/`，回滚时需先迁移 `.snapshots` 避免自覆盖。

### 5.4 前端结构

- 单文件 `App.tsx`，三个 Tab：`dashboard` / `market` / `settings`。
- 通过 `axios` 直连 `http://localhost:3001/api/*`，**无代理配置**。
- 国际化：`TRANSLATIONS` 对象内联 `en` / `zh`，按 `navigator.language` 自动选择。
- 设计系统变量集中在 `src/index.css` 的 `:root`，组件样式用 Vanilla CSS。

## 6. 编码规范

### TypeScript
- 严格模式，禁止 `any`（除与外部 JSON 交互的过渡字段）。
- 后端服务统一使用 `static` 类方法（`ConfigService.getConfig()` 风格），不实例化。
- 接口名 PascalCase，文件名 kebab-case 或小驼峰（保持与现有文件一致）。

### React
- 函数组件 + Hooks，不使用 class 组件。
- 状态按功能就近声明，不引入状态管理库。
- 图标统一来自 `lucide-react`，动画统一使用 `framer-motion`。

### 样式
- **禁止引入 Tailwind / CSS-in-JS**，坚持 Vanilla CSS。
- 颜色 / 间距 / 圆角必须引用 `index.css` 中的 CSS 变量，禁止硬编码。
- 新增组件优先复用现有 `.glass-card` / `.btn` / `.nav-item` 等类。

### 提交
- 提交信息使用祈使句，首行 ≤ 72 字符。
- 不自动提交 `pnpm-lock.yaml` 之外的锁文件变更。
- **禁止** `git push --force` 到主分支。

## 7. 安全与边界

- 后端执行 `execSync` 调用 `git clone` / `start`，**必须对入参做路径校验**，避免命令注入。
- `POST /api/open-folder` 接收 `targetPath` 时需先 `fs.lstat` 确认存在。
- Lint 已内置密钥扫描，新增规则请保持误报率可控。
- 用户配置文件可能含敏感路径，日志中打印时需脱敏。

## 8. 调试技巧

- 后端日志：直接看运行 `pnpm server:dev` 的终端。
- 前端日志：浏览器 DevTools Console，错误响应统一通过 `alert` 展示（当前 UX 约定，勿擅自改为 toast）。
- Junction 链接异常时：在 PowerShell 执行 `Get-Item <path> | Select-Object LinkType, Target` 验证。
- 端口占用：`Get-NetTCPConnection -LocalPort 3001,5173`。

## 9. 不要做的事

- ❌ 引入 npm/yarn 替代 pnpm。
- ❌ 在前端引入状态管理库 / 路由库（当前单文件足够）。
- ❌ 把 `App.tsx` 拆分成多文件（除非用户明确要求重构）。
- ❌ 修改 `start.bat` 的端口清理逻辑（用户依赖此行为）。
- ❌ 在 `optimize.ts` 中调用真实 LLM API（当前为规则化实现，避免引入密钥依赖）。
- ❌ 自动创建文档文件 / README（除非用户明确要求）。

## 10. 任务执行流程建议

1. **理解需求**：先读 `README.md` 与本文件，确认改动范围。
2. **定位代码**：用 Grep / SearchCodebase 而非全量阅读。
3. **最小改动**：仅修改与任务直接相关的文件，不顺手重构。
4. **验证**：`pnpm lint` 通过；涉及后端时 `pnpm server` 启动无报错；涉及前端时 `pnpm dev` 页面正常加载。
5. **汇报**：用 clickable file link 引用改动位置，说明 why 而非 what。

## 11. Recent Architecture Changes (2026-07-03)
- **UI Component Policy**: Avoid adding excessive inline buttons on skill cards. Prefer batch-action modals (like the Multi-Platform Sync Modal) for cleaner UX.
- **Process Spawning**: When opening folders or launching CLI tools in Windows, use asynchronous `child_process.exec` or `spawn` with `detached: true` instead of `spawnSync`, to prevent blocking the Express server event loop.
- **MCP Ecosystem**: MCP server handling relies on NPM (`npx -y`). Do not build heavy custom binaries for MCP unless requested; stick to the NPM ecosystem.
- **Skill Filtering**: System folders like `_shared` (often found in Trae CN) are strictly filtered out in the frontend and should not be treated as executable skills.
