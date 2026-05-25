# Nomi 分类卡片设计 v1

日期：2026-05-25
覆盖代码版本：v0.6.1
依赖文档：
- `docs/design/nomi-design-system.md`（设计系统 v1）
- v0.5.1 audit / v0.6.0 release notes 里关于"5 个分类共用 BaseGenerationNode"的遗留差距

> 本文档目的：把"角色 / 场景 / 道具 / 声音"这 4 类节点从"跟分镜长一样的图像方块"升级成**符合各自使用情境**的卡片视觉。
>
> 流程严格按"先研究、再设计、最后实施"的顺序，避免视觉先行 / 闭门造车。

---

## §1 用户研究：4 个真实创作场景

我们做 5 分类卡片，本质是回答"用户在哪种情境下用它"。先列 4 个具象场景。

### §1.1 场景 A：15 分钟短片（个人创作）

**用户画像：** 独立创作者，单兵作战，一周内做完。

**资产规模：**
- 主角 1 + 配角 2–3
- 场景 4–5
- 道具 5–8
- 配乐 / 音效 5–10

**典型工作流：**

1. 创作区写 1500 字剧本梗概
2. 切到生成区"角色"分类，建小苏 + 妈妈 + 老师 3 个角色卡，各生成 1–2 张定型图
3. 切到"场景"分类，建 4–5 个场景卡，每个生成一张氛围图
4. 道具略，先做"小苏的旧背包"
5. 进分镜区，开始铺 20–30 个分镜，每个分镜 prompt 里 `@小苏 @教室` 引用角色和场景
6. 中途反复切回"角色"分类对比"小苏第 17 个分镜的发型是不是和第 3 个分镜统一"
7. 时间轴拖 BGM + 雨声

**痛点：**
- 反复切分类做"视觉一致性核对"。每次切过去要 1 秒识别"哦这是小苏的卡片"
- 道具的"归属角色"在脑子里记着，没地方写
- 想知道"小苏出现在哪些分镜"，目前没法看，要靠手数

### §1.2 场景 B：1 小时长片（团队 2–5 人）

**用户画像：** 小团队，导演 + 美术 + 配乐分工。

**资产规模：**
- 主角 1 + 配角 10+
- 场景 20+
- 道具 30+
- 声音素材 30+

**典型工作流：**

1. 导演先在创作区分章节铺剧本
2. 美术批量在"角色"和"场景"分类建卡，每个角色多个表情/服装变体
3. 切回剧本检查"这个分镜该用小苏的哪个服装版本"
4. 导演反查"这个场景在第几集出现过 → 风格要一致"
5. 配乐工程师在"声音"分类管理 30+ 音乐 / 音效

**痛点（更严重）：**
- 角色多了之后**视觉相似的角色容易混**（两个少年角色卡片靠 prompt 才能分得清）
- 场景太多分不清"教室 day"和"教室 night"，要靠时间标签
- 道具找不到"这个道具是谁的"
- 声音 30+ 个，没试听等于没分类

### §1.3 场景 C：短视频系列（10 集，每集 2 分钟）

**用户画像：** 内容创作者，每周 1–2 集。

**资产规模：** 共享角色和世界设定，剧情每集不同。

**典型工作流：**
- 角色 / 场景 / 道具是跨集复用的"资产库"
- 每集只新建分镜

**痛点：**
- 跨"项目"复用资产（v0.8+ Phase H 范围，v0.6 不解决）
- 一个角色用了 10 集后，需要看"这角色出现在哪些集" → 跨项目反查（也是 Phase H）

**v0.6 能做的：** 同项目内的"使用次数"。给后续 Phase H 留接口。

### §1.4 场景 D：动画 / PV（强视觉一致性）

**用户画像：** 动画师 / 音乐 PV 制作者。

**资产规模：**
- 主角 1–2，但每个角色有 5+ 服装变体、表情变体
- 场景 3–5，每个场景有"白天/黑夜/雨/雪"4 个时段版本

**痛点（最严重）：**
- **变体管理**：小苏校服 vs 小苏便服 vs 小苏雨衣，都属于"小苏"但视觉不同
- 用户进角色卡，需要看到"这个角色当前有几个变体"
- 选哪个变体作为"主形象"
- 同场景的不同时段哪个最常用

**v0.6 能做的：** 派生链 (`regeneratedFrom`) 数据已存在，可以显示"X 个变体"计数。完整变体管理 UI（带切换 / 标记主形象）是 Phase G。

---

## §2 每个分类的真实需求

按 [MoSCoW](https://en.wikipedia.org/wiki/MoSCoW_method) 排：Must / Should / Could / Won't。

### §2.1 角色卡 (Cast)

**核心使用情境：** 视觉一致性核对（"小苏发型对不对？"）+ 关联反查（"小苏出现在哪些分镜？"）

**MoSCoW 需求：**

| 优先级 | 需求 | 当前数据可达性 |
|---|---|---|
| **Must** | 主形象（头像或立绘） | ✅ 已有 `node.result.url` |
| **Must** | 名字 | ✅ 已有 `node.title` |
| **Must** | 一句话设定（"反派少年，14 岁，有伤疤"） | ⚠️ 没专门字段，可暂用 `node.prompt` 的第一行 |
| **Should** | 使用次数（"在 23 个分镜里"） | ✅ 可 live 计算（数 prompt 引用 / 反向 edges）|
| **Should** | 变体数量（"3 个版本"） | ✅ 可数 `regeneratedFrom = this.id` 的节点 |
| **Could** | 关联场景 chip | ❌ 需要 Phase G 关系图谱 |
| **Could** | 标签（"反派 / 主角 / 少年"） | ❌ 需要新字段 `meta.tags` |
| **Won't** | 详细 prompt 全文 | ⚠️ 进入编辑态才看 |
| **Won't** | 模型 / 参数 chip | ⚠️ 进入编辑态才看 |

**关键观察：**
- 角色卡是**纵向矩形**（人物视觉天然纵向）
- 主形象 70% 空间 + 信息 30%
- "使用次数 + 变体数"是长片场景的关键 metadata，必须显示

### §2.2 场景卡 (Scene)

**核心使用情境：** 氛围一致性核对（"雨夜街头色调统一吗？"）+ 反查（"教室出现过哪些角色？"）

**MoSCoW 需求：**

| 优先级 | 需求 | 当前可达性 |
|---|---|---|
| **Must** | 场景图（大幅缩略） | ✅ `node.result.url` |
| **Must** | 名字 | ✅ `node.title` |
| **Must** | 时间/氛围 tag（"夜 · 雨 · 冷色"） | ❌ 需要 `meta.mood` 或解析 prompt |
| **Should** | 使用次数 | ✅ 可 live 计算 |
| **Should** | 出现的角色 chip（小头像列表） | ❌ Phase G |
| **Could** | 变体（"夜间版 / 白天版"） | ✅ 同上派生计数 |
| **Won't** | prompt 详情 / 模型 | ⚠️ 编辑态 |

**关键观察：**
- 场景卡是**横向矩形 / 接近正方形**（场景天然 landscape）
- 主图 80% 空间 + 信息条浮在底部（沉浸式）
- "时间/氛围 tag" 是和角色卡最大的不同——场景是有"时段感"的

### §2.3 道具卡 (Prop)

**核心使用情境：** 视觉一致性（"小苏的小刀长什么样？"）+ 归属（"这道具是谁的？"）

**MoSCoW 需求：**

| 优先级 | 需求 | 当前可达性 |
|---|---|---|
| **Must** | 道具图 | ✅ `node.result.url` |
| **Must** | 名字 | ✅ `node.title` |
| **Must** | **归属**（"小苏的"）— 道具特有 | ❌ 需要 `meta.ownedBy` 字段 |
| **Should** | 出现场景 | ❌ Phase G |
| **Should** | 关键属性（"旧 / 黑色 / 帆布"） | ❌ 需要 `meta.attributes` 或解析 prompt |
| **Should** | 使用次数 | ✅ 可计算 |
| **Won't** | 模型 / prompt | ⚠️ 编辑态 |

**关键观察：**
- 道具卡是**正方形**（物品中心，无明显方向）
- "归属"是道具特有信号，没它就没意义
- 视觉上跟角色 / 场景区分应该有"物品感"（边框、阴影、底纹）

### §2.4 声音卡 (Audio)

**完全不同的范式。** 声音是**时间维度**的，视觉不是主体。

**核心使用情境：** 选 BGM / 音效 + 试听 + 用到时间轴

**MoSCoW 需求：**

| 优先级 | 需求 | 当前可达性 |
|---|---|---|
| **Must** | 类型徽标（BGM / 音效 / 旁白） | ❌ 需要 `meta.audioKind` |
| **Must** | 名字 | ✅ `node.title` |
| **Must** | 时长 mm:ss | ⚠️ 需要从音频文件解析 |
| **Must** | 播放控制（▶ / ⏸） | ❌ 需要 audio kind 支持 |
| **Should** | 波形预览 | ❌ 需要预生成波形或 web audio API 实时绘 |
| **Could** | 音量峰值 | ⚠️ 派生于波形 |
| **Could** | BPM（音乐用） | ❌ 元数据 |
| **Won't** | 静态图像缩略 | ⚠️ 不存在 |

**关键观察：**
- 声音卡是**横向 strip**（时间天然横向）
- 视觉主体是波形 + 播放按钮，不是图
- 当前 v0.6 数据层**没有 audio kind 支持**，声音分类节点其实是 image 占位

**v0.6 范围的现实：**
- 实现 AudioStripNode 视觉骨架（波形 placeholder + 时长 placeholder + 播放按钮 disabled）
- 真实音频处理推到 audio kind 落地的独立 phase

---

## §3 信息架构差异

### §3.1 4 张卡片的核心差异表

| 维度 | 角色 | 场景 | 道具 | 声音 |
|---|---|---|---|---|
| **形状** | 纵向矩形 | 横向矩形 | 正方形 | 横向 strip |
| **默认尺寸** | 200 × 280 | 320 × 200 | 200 × 200 | 420 × 80 |
| **主视觉占比** | 70% | 80% | 65% | 60% (波形) |
| **主信息** | 名字 + 设定 | 名字 + 氛围 | 名字 + 归属 | 名字 + 时长 |
| **关联线索** | 使用次数 / 变体数 | 使用次数 / 角色 chip | 使用次数 / 归属 | 关联场景（未做）|
| **时间维度** | ❌ | 隐含（时段）| ❌ | ✅ 核心 |
| **跟分镜的最大区别** | 没 composer | 没 composer | 没 composer | 有播放控制 |

### §3.2 关联反查的核心性

**长片场景下**，"X 出现在哪些 Y"的反向查找是**最高价值**的功能：

- 小苏角色卡 → "23 个分镜引用"
- 教室场景卡 → "7 个角色出现过"
- 旧背包道具 → "15 个分镜出现"

**v0.6.x 卡片至少要显示这些计数**，哪怕 click 暂时不能跳转（跳转 = Phase G 关系图谱）。

**计数的 MVP 算法**（不依赖 Phase G）：

```typescript
// 角色 X 出现次数 = 全部分镜节点中 prompt 包含 X.title 的数量
// 场景 / 道具同理
function getUsageCount(node, allNodes) {
  if (!node.title || !node.categoryId || node.categoryId === 'shots') return 0
  return allNodes.filter(n =>
    n.categoryId === 'shots' && n.prompt?.includes(node.title)
  ).length
}

// 变体数 = derivedFrom = this.id OR regeneratedFrom = this.id 的节点数
function getVariantCount(node, allNodes) {
  return allNodes.filter(n => n.derivedFrom === node.id || n.regeneratedFrom === node.id).length
}
```

简单文本匹配，足够 MVP。后续 Phase G 会有真正的关系字段。

### §3.3 数据模型现状 vs 期望

| 字段 | 现状 | 期望（最终） | v0.6.x 实现策略 |
|---|---|---|---|
| `title` | ✅ 已有 | 沿用 | 沿用，作为名字 |
| `prompt` | ✅ 已有 | 沿用 | 第一行作为 fallback "一句话设定" |
| `result.url` | ✅ 已有 | 沿用 | 主视觉 |
| `meta.tagline` | ❌ | 一句话设定（角色/场景/道具的"档案描述"） | **新增**，可选 |
| `meta.tags` | ❌ | 标签数组 | **新增**，可选 |
| `meta.ownedBy` | ❌ | 道具归属（角色 nodeId 或字符串） | **新增**（道具用），可选 |
| `meta.mood` | ❌ | 场景氛围 tag | **新增**（场景用），可选 |
| `meta.audioKind` | ❌ | BGM / SFX / VO | **新增**（声音用），可选 |
| `meta.durationSec` | ⚠️ 已有 `durationSeconds` 字段在 result | 沿用 | 沿用 |

**关键决定：** 这些新字段**全部存到 `node.meta` 里**，不动顶层 schema。原因：
- `meta` 已经是 `Record<string, unknown>`，加什么都行
- 不需要 zod schema 改动 + migration
- 缺失时优雅降级（"暂无 tagline"）

---

## §4 视觉设计：4 个卡片

每个卡片严格遵循 `docs/design/nomi-design-system.md` 的 token / 组件 / patterns。

### §4.1 `CharacterCardNode`

**视觉结构**（200 × 280）：

```
┌──────────────────────────────┐
│ ╭───────╮            ╭──╮    │  ← TitlePill "角色" + 副本角标
│ │角色   │            │📋│    │
│ ╰───────╯            ╰──╯    │
│                              │
│                              │
│     [头像 / 立绘]             │  ← 主图，flex-1 (~70%)
│     占位：斜条纹 + "角色 NN"   │
│     占位：等待生成             │
│                              │
│                              │
├──────────────────────────────┤
│ 小苏                        ●│  ← 名字 (title token) + 使用次数 dot
│ 反派少年，14 岁，有伤疤        │  ← 一句话设定 (caption, ink-60)
│                       ⊕3变体  │  ← 变体计数 chip (右下角)
└──────────────────────────────┘
```

**规格表（按设计系统 §8 模板）：**

| 属性 | 值 / token |
|---|---|
| **尺寸** | 200 × 280 px |
| **外框** | `border border-nomi-line rounded-nomi shadow-nomi-sm`（选中 `shadow-nomi-md` + `outline-2 outline-nomi-accent`）|
| **背景** | `bg-nomi-paper` |
| **主图区** | `flex-1 min-h-0 rounded-nomi-sm overflow-hidden`，占位斜条纹（设计系统 §5.1）|
| **名字字号** | `text-title` (16px) `font-medium` `text-nomi-ink` |
| **设定字号** | `text-caption` (12px) `text-nomi-ink-60`，单行 truncate + 全文 tooltip |
| **使用次数 dot** | 8px 圆点 `bg-nomi-accent`，旁边小数字 `text-micro text-nomi-ink-60` |
| **变体 chip** | `rounded-full bg-nomi-ink-05 px-2 py-[2px] text-micro text-nomi-ink-60`，仅当变体 ≥1 显示 |
| **行为** | 点击 = 选中节点；双击 = 进入编辑态（同 BaseGenerationNode）|

**降级（数据缺失时）：**
- 没头像 → 显示占位斜条纹
- 没 tagline → 隐藏第二行（不显示"暂无设定"，简洁优先）
- 使用次数 = 0 → 不显示 dot
- 变体 = 0 → 不显示 chip

### §4.2 `SceneCardNode`

**视觉结构**（320 × 200）：

```
┌────────────────────────────────────────┐
│ ╭───────╮              [📋 副本]      │  ← TitlePill + 副本角标
│ │场景    │                              │
│ ╰───────╯                              │
│                                        │
│        [场景大图 / 斜条纹占位]            │  ← 主图，绝对位 (h-full)
│                                        │
│                                        │
│  ┌──────────────────────────────┐       │
│  │ 教室                    ●12 │←     │  ← 名字 + 使用次数（半透明遮罩）
│  │ 夜 · 雨 · 冷色          ⊕2  │       │  ← 氛围 tag + 变体
│  └──────────────────────────────┘       │
└────────────────────────────────────────┘
```

**特别设计：** 信息条**浮在主图底部**（半透明黑底 + 白字），不是底部独立区。这样场景图始终全幅展示，氛围感不被切割。

**规格表：**

| 属性 | 值 / token |
|---|---|
| **尺寸** | 320 × 200 px |
| **外框** | 同 §4.1 |
| **主图** | `absolute inset-0 rounded-nomi`，full bleed |
| **信息条** | `absolute bottom-2 left-2 right-2 px-3 py-2 rounded-nomi-sm`，背景 `bg-nomi-ink/[0.78]` + `backdrop-blur-md`，字色 `text-nomi-paper` |
| **名字** | `text-body` (14px) `font-medium` |
| **氛围 tag** | `text-micro` `text-nomi-paper/80`，多个 tag 用 `·` 分隔 |
| **使用次数** | dot + 数字 `text-micro`，浮在右上 |
| **变体 chip** | 同上但用更浅色 |
| **占位态** | 没场景图时，斜条纹背景 + 中央显示"场景 NN / 等待生成"，信息条降级到普通灰底 |

### §4.3 `PropCardNode`

**视觉结构**（200 × 200）：

```
┌──────────────────────────────┐
│ ╭───────╮            ╭──╮    │
│ │道具    │            │📋│    │
│ ╰───────╯            ╰──╯    │
│                              │
│      [道具图 / 斜条纹]         │  ← 正方形主图
│                              │
│                              │
├──────────────────────────────┤
│ 旧背包                     ●8│  ← 名字 + 使用次数
│ 🔗 小苏的                    │  ← 归属 (高亮显示)
└──────────────────────────────┘
```

**特别设计：** "归属"用 🔗 + 文字明确标识，且**字色用 `nomi-accent`** 让它在卡片上跳出来——这是道具卡的核心差异化。

**规格表：**

| 属性 | 值 / token |
|---|---|
| **尺寸** | 200 × 200 px（正方形）|
| **外框** | 同前 |
| **主图** | `flex-1 min-h-0 aspect-square rounded-nomi-sm` |
| **名字** | `text-body` (14px) `font-medium` `text-nomi-ink` |
| **归属** | `text-caption` (12px) `text-nomi-accent` `font-medium`，前置 🔗 icon (Tabler `IconLink` 12px) |
| **使用次数** | 同前 |
| **占位态** | 同前 |

**降级：**
- 没归属 → 隐藏归属行（不显示"无归属"）
- 没图 → 占位斜条纹

### §4.4 `AudioStripNode`

**视觉结构**（420 × 80）— **完全不同的横条范式**：

```
┌───────────────────────────────────────────────┐
│ [▶]  [BGM] 雨夜BGM           ⌒⌒⌒⌒⌒  03:42  │
│      ●5 关联                                 │
└───────────────────────────────────────────────┘
```

布局水平：左 [播放按钮] | 中左 [类型徽标 + 名字 + 关联] | 中右 [波形] | 右 [时长]

**规格表：**

| 属性 | 值 / token |
|---|---|
| **尺寸** | 420 × 80 px（横向 strip）|
| **外框** | `border border-nomi-line rounded-nomi-lg shadow-nomi-sm` |
| **播放按钮** | 32×32 圆形按钮，`bg-nomi-ink text-nomi-paper`，IconPlay / IconPause |
| **类型徽标** | `rounded-full bg-nomi-accent-soft text-nomi-accent text-micro px-2 py-[1px]`，文案 "BGM" / "音效" / "旁白" |
| **名字** | `text-body` (14px) `text-nomi-ink` |
| **关联** | `text-micro text-nomi-ink-60`，dot + 数字 |
| **波形** | 32px 高，占据中间区域，SVG 渲染。占位状态：`opacity-30` 灰条纹 |
| **时长** | `text-caption text-nomi-ink-60 tabular-nums font-mono` |
| **状态** | 播放中：播放按钮变 IconPause；波形 highlight 当前位置 |

**v0.6 范围内不做的部分：**
- 真实音频播放（需要 audio kind + Web Audio API）
- 真实波形（需要预解析或 audio kind）
- BPM / 音量峰值

**v0.6 提供的：** 视觉骨架 + 占位 + 当数据存在时优雅渲染（`meta.audioKind`、`meta.durationSec`）

---

## §5 实施计划

### §5.1 任务清单（沿用 `[E.2C-XX]` 风格 + DESIGN 前缀）

| Task ID | 主题 | Wave | 工时估 |
|---|---|---|---|
| **[DESIGN-CARDS-01]** | meta 字段约定登记 + 类型注释（不改 schema） | 1 | 0.5 天 |
| **[DESIGN-CARDS-02]** | 共享 hooks: `useNodeUsageCount` / `useNodeVariantCount` | 1 | 0.5 天 |
| **[DESIGN-CARDS-03]** | `CharacterCardNode` 实现 | 2 | 0.5 天 |
| **[DESIGN-CARDS-04]** | `SceneCardNode` 实现（含浮动信息条） | 2 | 0.5 天 |
| **[DESIGN-CARDS-05]** | `PropCardNode` 实现 | 2 | 0.5 天 |
| **[DESIGN-CARDS-06]** | `AudioStripNode` 实现（骨架，无真实音频） | 2 | 1 天 |
| **[DESIGN-CARDS-07]** | BaseGenerationNode 改为 renderKind 分发器 | 3 | 1 天 |
| **[DESIGN-CARDS-08]** | 默认 size 按 renderKind 决定 | 3 | 0.5 天 |
| **[DESIGN-CARDS-09]** | 视觉回归（截屏每个分类） | 4 | 0.5 天 |
| **[DESIGN-CARDS-10]** | 版本 bump 0.6.1 → 0.7.0 + release notes | 4 | - |

总计 ~5 天。

### §5.2 BaseGenerationNode dispatcher 模式

```typescript
// pseudo-code
function BaseGenerationNode({ node, ...rest }) {
  const renderKind = node.renderKind ?? inferFromCategoryId(node.categoryId)
  
  switch (renderKind) {
    case 'shot-frame':     return <ShotFrameNode node={node} {...rest} />
    case 'character-card': return <CharacterCardNode node={node} {...rest} />
    case 'scene-card':     return <SceneCardNode node={node} {...rest} />
    case 'prop-card':      return <PropCardNode node={node} {...rest} />
    case 'audio-strip':    return <AudioStripNode node={node} {...rest} />
    default:               return <ShotFrameNode node={node} {...rest} />  // 兜底
  }
}
```

**关键决定：** `ShotFrameNode` 不是新文件，而是**现有 BaseGenerationNode 的 body 整体移过去**（保留所有 1100+ 行功能：composer 内嵌、status badge、derived badge、resize、timeline drag 等）。其它 4 个新组件是从零写的简化版。

### §5.3 共享 hooks 提取

```typescript
// src/workbench/generationCanvasV2/hooks/useNodeRelationships.ts

export function useNodeUsageCount(nodeId: string, nodeTitle: string | undefined): number {
  return useGenerationCanvasStore((state) => {
    if (!nodeTitle) return 0
    return state.nodes.filter(n => 
      n.categoryId === 'shots' && n.prompt?.includes(nodeTitle)
    ).length
  })
}

export function useNodeVariantCount(nodeId: string): number {
  return useGenerationCanvasStore((state) =>
    state.nodes.filter(n => n.derivedFrom === nodeId || n.regeneratedFrom === nodeId).length
  )
}
```

### §5.4 meta 字段约定（不改 schema）

新建 `src/workbench/generationCanvasV2/model/nodeMetaFields.ts`：

```typescript
/**
 * 各分类节点在 node.meta 里使用的可选字段。
 * 类型层面是 unknown（meta 的 Record 限制），运行时由 helper 函数收窄。
 */
export type CharacterMeta = {
  tagline?: string   // "反派少年，14 岁，有伤疤"
  tags?: string[]    // ["反派", "少年"]
}

export type SceneMeta = {
  mood?: string[]    // ["夜", "雨", "冷色"]
}

export type PropMeta = {
  ownedBy?: string   // "小苏" 或 nodeId
  attributes?: string[]
}

export type AudioMeta = {
  audioKind?: 'bgm' | 'sfx' | 'vo'
  durationSec?: number
  bpm?: number
}

export function readCharacterMeta(node: GenerationCanvasNode): CharacterMeta {
  return (node.meta || {}) as CharacterMeta
}
// 同理 readSceneMeta / readPropMeta / readAudioMeta
```

写入这些字段的 UI（编辑器）**不在 v0.6 范围**——v0.6 只做"如果 meta 里有就显示，没有降级"。写入功能留给后续 phase。

### §5.5 兜底逻辑

- 现有项目升级到 v0.7 后，所有现存节点的 `meta` 都是空的（除了原有的 result/history/...）
- 卡片显示时全部降级（只显示名字 + 图）
- 用户手动用 Cmd+E（如果有编辑面板）或未来通过 prompt 间接更新

**关键：v0.7 发版后，旧节点不会"看起来坏掉"——只是没有 tagline/mood/ownedBy，就少显示一行。**

---

## §6 验收

### §6.1 功能验收

- [ ] 角色分类节点用 CharacterCardNode 渲染
- [ ] 场景分类节点用 SceneCardNode 渲染
- [ ] 道具分类节点用 PropCardNode 渲染
- [ ] 声音分类节点用 AudioStripNode 渲染（视觉骨架）
- [ ] 分镜分类节点继续用 ShotFrameNode（即原 BaseGenerationNode 内容）
- [ ] 4 张卡片在 meta 字段缺失时优雅降级
- [ ] 使用次数 / 变体数 live 计算正确

### §6.2 视觉验收（必须截图）

每个分类截图一张并对比设计稿：
- [ ] CharacterCardNode 占位态 + 有图态
- [ ] SceneCardNode 有图态（含浮动信息条）
- [ ] PropCardNode 有归属 + 无归属
- [ ] AudioStripNode 占位（无音频数据）+ 假数据态

### §6.3 设计系统合规

- [ ] 所有颜色用 token，无 hex
- [ ] 所有字号用 token
- [ ] 所有图标走 `@tabler/icons-react`
- [ ] 新组件都在 `docs/design/nomi-design-system.md` §4 登记规格
- [ ] 选中态 / hover 态 / 占位态视觉一致

---

## §7 长期视角

完成本设计后，Nomi 卡片体系将支撑：

1. **v0.7 起**：用户做"快速识别 + 一致性检查"的工作流，4 分类卡片各司其职
2. **Phase F**：Nomi Script 创作时 `@小苏` 引用直接显示角色卡片（hover 弹出预览）
3. **Phase G**：关系图谱可视化，4 类卡片是节点单元
4. **Phase H**：跨项目资产库（角色卡 / 场景卡 / 道具卡 / 声音卡都是跨项目可复用单元）

**所以 v0.7 这 5 天投资是 Phase F/G/H 的视觉基座。**

---

## §8 启动前确认清单

我等你确认：
- ⬜ 4 个场景假设是否符合你的产品意图（特别是场景 D 动画/PV 的变体管理）
- ⬜ 使用次数 / 变体数计数显示在卡片上是否必要
- ⬜ 道具的"归属"用 `🔗 小苏的` 高亮显示，是否过强
- ⬜ 场景卡的浮动信息条（半透明黑底白字）是否符合你想象
- ⬜ AudioStripNode 在没真实音频数据时显示骨架占位，可接受
- ⬜ meta 字段不改 schema 只在 node.meta 里加，可接受
- ⬜ 5 天工期 + 版本 bump 到 0.7.0，可接受

任意 ⬜ 想调整告诉我。全 ✓ 我立即派 executor 启动 Wave 1。
