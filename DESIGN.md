# DESIGN.md

> 本文件描述 Skill Manager 的设计系统、架构决策与视觉规范。
> 任何 UI/UX 改动应先对照本文件，保持一致性。

## 1. 设计目标

| 维度 | 目标 |
|------|------|
| **定位** | 开发者工具，专业、克制、信息密度高 |
| **气质** | 玻璃拟态（Glassmorphism）+ 暗色优先 |
| **交互** | 即时反馈、危险操作二次确认、零跳转完成主流程 |
| **可访问性** | 键盘可达、对比度达标、focus-visible 明确 |
| **国际化** | 中英双语，按 `navigator.language` 自动切换 |

## 2. 设计系统（Design Tokens）

所有 token 定义在 `src/index.css` 的 `:root`，**禁止在组件中硬编码颜色/圆角/间距**。

### 2.1 色彩

#### 背景层级（暗色优先）
```
--bg-primary     #0a0a0c   应用主背景
--bg-secondary   #141417   侧边栏 / 卡片底色
--bg-tertiary    #1c1c21   悬浮层 / 输入框
```

#### 强调色
```
--accent-primary   #6366f1   主操作（Gold）
--accent-secondary #8b5cf6   渐变副色（Violet）
--accent-glow      rgba(99,102,241,0.15)   hover/active 光晕
```

#### 文本层级
```
--text-primary   #f8fafc   标题 / 主要内容
--text-secondary #94a3b8   次要说明
--text-muted     #64748b   占位 / 禁用
```

#### 语义色
```
--success #10b981
--warning #f59e0b
--error   #ef4444
```

#### 健康度等级色（Lint 专属）
```
--grade-a #10b981   90-100
--grade-b #84cc16   75-89
--grade-c #f59e0b   60-74
--grade-d #f97316   40-59
--grade-f #ef4444   0-39
```

#### 玻璃拟态
```
--glass-bg      rgba(20,20,23,0.7)
--glass-border  rgba(255,255,255,0.1)
--border-color  rgba(255,255,255,0.08)
```

### 2.2 字体
```
--font-main: 'Inter', system-ui, -apple-system, sans-serif
```
- 单一字族，靠字重与字号建立层级。
- 标题：800 / 1.5rem；正文：400 / 0.95rem；辅助：400 / 0.8rem。

### 2.3 圆角与间距
- 卡片圆角：`16px`；按钮/输入：`12px`；徽章：`999px`。
- 间距尺度：`0.5 / 0.75 / 1 / 1.5 / 2 / 2.5rem`，遵循 8px 网格。

## 3. 布局架构

### 3.1 应用骨架
```
┌─────────────┬───────────────────────────────┐
│             │                               │
│  Sidebar    │       Main Content            │
│  280px      │       (overflow-y: auto)      │
│             │                               │
│  - Logo     │   ┌───────────────────────┐   │
│  - Nav      │   │  Page Header          │   │
│    Dashboard│   ├───────────────────────┤   │
│    Market   │   │  Stats Row            │   │
│    Settings │   ├───────────────────────┤   │
│             │   │  Content Grid         │   │
│  - Footer   │   │  (Skill Cards / etc.) │   │
│             │   └───────────────────────┘   │
└─────────────┴───────────────────────────────┘
```

- CSS Grid：`grid-template-columns: 280px 1fr`，全屏 `100vh`。
- 侧边栏固定宽，主内容区滚动。
- 响应式断点 `@media (max-width: 1024px)`：侧边栏收起为图标条。

### 3.2 三大 Tab

| Tab | 职责 | 主要组件 |
|-----|------|---------|
| **Dashboard** | Skill 清单、健康度、同步与优化入口 | 统计卡 + 优化按钮 + Skill 卡片网格 + 优化解决模态框 |
| **Market** | 社区发现与 GitHub 导入 | 导入区域 + 排行榜 (总榜/分类榜) + 技能网格 |
| **Settings** | 配置路径、扫描、Hub 用量 | 路径列表 + 扫描按钮 + 存储统计 |

## 4. 核心组件规范

### 4.1 玻璃卡片（`.glass-card`）
- 背景 `var(--glass-bg)` + `backdrop-filter: blur(20px)`。
- 边框 `1px solid var(--glass-border)`。
- 圆角 16px，内边距 1.5rem。
- hover：边框色过渡到 `var(--accent-primary)`，轻微上浮（`translateY(-2px)`）。

### 4.2 按钮
- **主按钮**：渐变背景 `linear-gradient(135deg, --accent-primary, --accent-secondary)`，白字。
- **次按钮**：透明背景 + 玻璃边框。
- **危险按钮**：`var(--error)` 边框 + 红色文字。
- 所有按钮：圆角 12px，`focus-visible` 时 2px 实线 outline + 2px offset。

### 4.3 健康度徽章
- 圆形或胶囊，背景为对应 `--grade-*` 色的 20% 透明度。
- 文字为对应 `--grade-*` 色实色。
- 显示等级字母（A/B/C/D/F）+ 分数。

### 4.4 Skill 卡片
- 顶部：Skill 名 + 健康度徽章 + 类型标签。若有断裂的符号链接，显示醒目红色警告。
- 中部：description 截断 2 行。
- 底部：平台图标行 + 操作按钮（打开 / 历史）。
- 已同步：左侧 4px 强调色竖条；仅本地：灰色竖条。

### 4.5 导航项（`.nav-item`）
- 默认：`var(--text-secondary)` 文字，无背景。
- hover/active：`var(--accent-glow)` 背景 + `var(--accent-primary)` 文字。
- 左侧 3px 圆角指示条，active 时显示。

## 5. 交互模式

### 5.1 反馈层级
1. **微反馈**（< 100ms）：hover 颜色过渡、按钮按下缩放。
2. **元素反馈**（100–300ms）：`framer-motion` 的 `AnimatePresence` 控制抽屉/模态进出。
3. **页面反馈**（> 300ms）：`loading` 状态骨架屏；操作完成 `alert` 提示。

### 5.2 危险操作
- 覆盖、回滚、删除：`window.confirm` 二次确认，文案说明不可逆性。
- 优化应用前：展示 diff 预览（当前为 `confirm` + 文字描述，未来可升级为 diff 视图）。

### 5.3 加载状态
- 全局列表加载：骨架屏 + 居中 spinner。
- 按钮加载：按钮内 spinner + 禁用，文字保留。
- **禁止**整屏遮罩 loading（阻断感过强）。

### 5.4 空状态
- 无 Skill：插画 + "新建你的第一个 Skill" CTA。
- 无搜索结果：说明文案 + 清空筛选按钮。
- 无平台安装：灰色禁用 + "未检测到该 AI 软件" 提示。

## 6. 动效规范

| 场景 | 时长 | 缓动 |
|------|------|------|
| 颜色/边框过渡 | 200ms | `ease` |
| 卡片 hover 上浮 | 200ms | `ease-out` |
| 抽屉/模态进入 | 300ms | `cubic-bezier(0.4, 0, 0.2, 1)` |
| 列表项进出 | 250ms | `ease-in-out` |
| Tab 切换 | 200ms | `ease` |

- 动画统一通过 `framer-motion` 实现，避免 CSS animation 与 JS 动画混用。
- 尊重 `prefers-reduced-motion`（未来需补充媒体查询）。

## 7. 数据可视化

### 7.1 统计卡
- 三张并排：总技能数 / 已同步 / 仅本地。
- 大数字（2rem, 800 字重）+ 小标签（0.8rem, secondary 色）。
- 数字变化时 200ms 颜色闪烁（accent → 默认）。

### 7.2 健康度分布（未来）
- 当前仅卡片徽章，未来可加仪表盘分布图。
- 配色严格用 `--grade-*`，禁止引入图表库默认色。

### 7.3 Hub 用量
- 进度条形式，强调色填充，超 80% 变 `--warning`，超 95% 变 `--error`。

## 8. 国际化

- 键值集中在 `App.tsx` 的 `TRANSLATIONS` 对象。
- 切换语言不刷新页面，通过 `useState` 触发重渲染。
- **新增 UI 文案必须同时补 `en` 与 `zh`**，缺键时回退到 `en`。
- 日期/数字：使用 `toLocaleString`，跟随语言切换。

## 9. 可访问性

- 所有可交互元素必须键盘可达，`tabindex` 顺序符合视觉流。
- `:focus-visible` 统一为 `2px solid var(--accent-primary)` + `2px offset`。
- 图标按钮必须 `aria-label`。
- 颜色对比度：正文 ≥ 4.5:1，大字 ≥ 3:1（当前 `--text-secondary` on `--bg-secondary` 约为 5.2:1，达标）。
- 不依赖颜色单独传达信息（如错误同时配图标 + 文字）。

## 10. 响应式策略

| 断点 | 行为 |
|------|------|
| ≥ 1280px | 完整三栏，卡片网格 3 列 |
| 1024–1279px | 侧边栏收窄为图标，卡片网格 2 列 |
| 768–1023px | 侧边栏抽屉化，卡片网格 2 列 |
| < 768px | 单列堆叠，侧边栏底部 Tab Bar（未来支持） |

- 当前优先保证 ≥ 1024px 体验，移动端为未来工作。

## 11. 设计禁忌

- ❌ 引入 Tailwind / CSS Modules / styled-components。
- ❌ 在组件中硬编码 hex 颜色。
- ❌ 使用 `!important` 覆盖样式（应通过 token 调整）。
- ❌ 引入额外图标库（统一 `lucide-react`）。
- ❌ 引入 UI 组件库（Ant Design / MUI 等）。
- ❌ 用 toast 替代 `alert`（除非用户明确要求）。
- ❌ 整屏遮罩 loading。
- ❌ 自动播放动画或声音。

## 12. 设计资产

- Logo：`lucide-react` 的 `Package` 图标 + 渐变文字。
- Favicon：`public/favicon.svg`。
- 装饰图：`src/assets/hero.png`（登录/欢迎页，当前未启用）。
- 无外部图片资源，全部为 CSS/SVG 绘制。

## 13. 设计演进方向

- [ ] 暗色/亮色主题切换（当前仅暗色，`config.theme` 字段已预留）。
- [ ] `prefers-reduced-motion` 媒体查询支持。
- [ ] 移动端 Tab Bar 布局。
- [ ] 健康度分布图表。
- [ ] Diff 视图替代优化前的 `confirm` 文字描述。
- [ ] Toast 系统设计（待用户确认后替代 `alert`）。
