# 两个 Agent 合并：修幻影工具 + 架构对齐 + 对话连续

> 用户拍板：① 修幻影工具 ② 创作区/生成区 Agent 架构对齐（都用真工具调用、共用一套引擎）③ 对话跨区连续（Agent 记得之前说过的）④ 活体测试（起 app，肉眼看真实返回格式与体验）。

## 背景（已读穿的事实）
- 引擎只有一个：`electron/runtime.ts` 的 `runAgentChatV2`（`streamText` + 工具 + 流式）。两个面板都走它。
- 但它有三个问题：
  1. **永远只挂 canvas 工具**，跟 skill 无关 → 创作区拿到的是画布工具（无意义），创作区因此改用"假工具"（让模型输出 JSON，前端正则 `parseCreationDocumentAction` 抠出来）。脆。
  2. **零对话历史**：`messages: [{ role:'user', content:userPrompt }]`，连单面板多轮记忆都没有。
  3. **`delete_canvas_nodes`** 后端有 schema、前端 `throw 'not implemented'`。幻影工具。
- 文档工具的真实实现**已存在**于编辑器（`CreationDocumentTools`：readFullText / readSelectionText / insertAtCursor / replaceSelection / appendToEnd …），只是没被接成 Agent 工具。
- 人在回路：后端 `makeTool.execute` 发 `tool-call` → 前端确认卡片 → `confirmTool` 回传结果 → 继续 loop。这套机制好用，复用它。
- AI SDK v4.3.19：`(await result.response).messages` 可取本轮生成的消息（含 tool-call/tool-result），用于回灌历史。

## 范围（动什么）

### Phase 1 — 修幻影工具（最小、独立）
- 渲染端实现 `delete_canvas_nodes`：`generationCanvasTools.delete_nodes(nodeIds)`→ store `deleteNode`。
- 接进 `CanvasAssistantPanel.applyConfirmedToolCall` 与 `generationCanvasAgentClient.defaultExecuteToolCall`（删掉两处 `throw 'not implemented'`）。

### Phase 2 — 架构对齐（创作区也用真工具）
- 新增 `electron/ai/documentTools.ts`：`read_full_text` / `read_selection` / `insert_at_cursor` / `replace_selection` / `append_to_end` 的 zod schema（无 execute，execute 在前端确认后做）。
- `runtime.ts`：按 skillKey 选工具组——`workbench.creation.*` → 文档工具；其余（generation / storyboard / 默认）→ canvas 工具。引擎其余逻辑不变（一套引擎，参数化工具组）。
- 重写 `CreationAiPanel.tsx`：监听 `tool-call` 事件、复用确认卡片、用 `creationDocumentTools` 真正执行。**删除** JSON 解析路径。
- `creationAiModes.ts`：prompt 改成引用真实工具名；**删除** `parseCreationDocumentAction` / `createFallbackCreationDocumentAction` / `extractJsonCandidate` / `normalizeActionType` 等死代码。read_* 工具按需取正文，user 消息不再塞整篇文稿（history 才不会爆）。
- 抽出共享确认卡片组件（消除两面板重复，规则1）。

### Phase 3 — 对话连续
- `runtime.ts`：内存 `Map<sessionKey, CoreMessage[]>`。`RunAgentChatV2Payload` 加 `sessionKey`、`resetSession?`。回放 history，跑完把 user 消息 + `(await result.response).messages` 追加进去，封顶最近 ~30 条。
- 统一 sessionKey：两面板都用 `nomi:workbench:<projectId|local>`（创作区去掉 `:${mode}` 后缀）→ 共享同一条后端记忆。
- 新对话：加 `nomi:agents:chatV2:clearSession` IPC + bridge，"新对话"按钮清后端 session + 两端显示线程。

### Phase 4 — 活体测试（肉眼）
- 起 app（`pnpm start` 或 Preview MCP）。前提：本地已配一个 text 模型（`chooseTextModel` 否则抛错）。
- 真点：创作区让 AI 续写/润色 → 看确认卡片与写入；生成区拆镜头 → 看 plan 卡片、节点落地、删除节点；跨区问"我们刚定的主角是谁" → 验证记忆。
- 截图记录真实返回格式与体验；以用户视角找问题，回填本文档。

### Phase 5 — 验证 + 回填 + 提交
- 每个 Phase 结束：`tsc -p electron/tsconfig.json` + `pnpm build` + `pnpm test` 绿；grep 确认无死代码残留。
- 分 Phase 提交，便于回滚。

## 不动什么
- 不动 onboarding agent（`electron/ai/onboarding/*`）。
- 不动 `requestPipeline` / 模型目录 / 供应商接入。
- 不动时间轴、导出、生成节点执行（`runGenerationNode`）。
- 不改设计 token / 配色。
- `runAgentChat`（v1，非流式 fallback）暂不动。

## 回滚策略
- 分 Phase 提交；任一 Phase 出问题 `git revert` 该 commit。
- 后端工具组选择与 history 都是增量改动，恢复旧行为=改回"永远 canvas 工具 + 空 messages"。

## 验收门
1. `tsc` / `pnpm build` / `pnpm test` 全绿。
2. grep 确认 `parseCreationDocumentAction`、`delete_canvas_nodes is not yet implemented` 等已物理删除，无外部引用。
3. 活体：创作区真工具确认卡片可写入文档；生成区可删节点；跨区记忆可验证（截图为证）。
4. 控制台无新报错；幻影工具不再出现在任何 prompt。
