# JSON Viewer

![MIT](https://img.shields.io/badge/license-MIT-22d3ee)
![零依赖](https://img.shields.io/badge/dependencies-0-a78bfa)
![Vanilla JS](https://img.shields.io/badge/vanilla-js-f7df1e)

> 一个**纯前端、零依赖**的 JSON 格式化与可视化查看器 —— 双击 `index.html` 就能用，数据全程留在本地。

---

## ✨ 功能列表

| 功能 | 说明 |
| --- | --- |
| 🖥️ 左右分栏 | 左侧输入、右侧可视化，互不遮挡 |
| ✨ 一键格式化 | 支持 **2 空格 / 4 空格** 两种缩进 |
| 📦 压缩成一行 | 一键把 JSON 压成单行 |
| 📋 复制结果 | 复制当前输入内容到剪贴板（带降级方案） |
| ⬇️ 下载 .json | 导出为带时间戳的 `.json` 文件 |
| 🗑️ 清空 / 🎲 示例 | 一键清空、一键载入结构丰富的示例数据 |
| ⚡ 实时解析 | 输入变化后 **300ms 防抖**自动解析 |
| 🚨 错误定位 | 解析失败时显示红色错误条与**行列号 / 字符偏移** |
| 🌳 树形视图 | 递归渲染，节点可点击折叠展开，显示类型与条目数（`{3}`、`[5]`） |
| 🎨 类型着色 | 字符串 / 数字 / 布尔 / null 各自不同颜色 |
| 🔍 搜索高亮 | 按 key 名或值搜索，命中项高亮并自动展开祖先 |
| 📊 统计栏 | 键总数、最大嵌套深度、字符数、解析耗时 |
| 📱 响应式 | 窄屏（< 900px）自动切换为上下布局，手机可用 |

---

## 🚀 如何开始使用

**方式一：直接双击（推荐）**

```
双击 json-viewer/index.html
```

无需安装、无需构建、无需联网。

**方式二：起一个本地静态服务**

```bash
cd json-viewer
python -m http.server 8000
# 然后浏览器打开 http://localhost:8000
```

> 提示：两种方式功能完全一致。用 `file://` 直接打开时，个别浏览器可能限制 `navigator.clipboard`，此时项目会自动降级到 `document.execCommand('copy')`。

---

## ⌨️ 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl` + `Enter` | 格式化（2 空格） |
| `Ctrl` + `Shift` + `Enter` | 格式化（4 空格） |
| `Ctrl` + `Shift` + `M` | 压缩成一行 |
| `Ctrl` + `Shift` + `C` | 复制结果 |
| `Ctrl` + `Shift` + `S` | 下载 .json 文件 |
| `Ctrl` + `Shift` + `E` | 展开全部 |
| `Ctrl` + `Shift` + `W` | 折叠全部 |
| `Ctrl` + `F` | 聚焦搜索框 |
| `Ctrl` + `K` | 清空 |
| `Esc`（搜索框内） | 清空搜索并失焦 |

> macOS 上把 `Ctrl` 换成 `⌘` 即可。

---

## 📁 项目结构

```
json-viewer/
├── index.html    # 页面骨架：分栏、工具栏、搜索框、统计栏
├── style.css     # 暗色青紫主题、树形样式、响应式布局
├── app.js        # 全部逻辑（IIFE + 'use strict'）
├── README.md     # 本文件
├── LICENSE       # MIT 协议
└── .gitignore    # 忽略系统与编辑器杂项
```

---

## 🛠️ 技术说明

### 树形渲染：递归 + 原生 DOM

`buildNode(key, value, depth, isLast)` 是一个纯递归函数：每遇到一个值，先创建 `.node-row`，再按类型决定画什么。

- **容器**（object / array）额外创建 `.children` 容器并递归渲染子项，行首是一个可点击的三角按钮，行内显示类型徽章 `{n}` / `[n]`；
- **原始值**（string / number / boolean / null）直接按类型挂上 `value-string`、`value-number`、`value-boolean`、`value-null` 类名，颜色交由 CSS 控制。

折叠状态只用**一个 CSS 类**表达：`.node.collapsed > .children { display: none; }`。展开/折叠完全不重建 DOM，只切换类名和三角字符，因此对超大 JSON 也足够轻快。点击事件统一由输出容器上的**事件委托**处理，避免为成千上万个节点逐个绑定监听器；默认只展开前 2 层，更深的层保持折叠。

### 实时解析防抖

`input` 事件只做一件事：清掉旧定时器、重开一个 `setTimeout`（300ms）。用户连续敲击时定时器被反复重置，只有真正停手后才执行一次 `JSON.parse`，避免每个按键都触发全量解析与重绘。

```js
function scheduleParse() {
  if (parseTimer) clearTimeout(parseTimer);
  parseTimer = setTimeout(function () { parseTimer = null; parseInput(false); }, 300);
}
```

### 错误位置定位

现代 V8 的报错文本会自带 `(line L column C)`，能直接取用；老版本只有 `at position N`，于是用 `offsetToLineCol()` 从偏移量扫一遍原文，数出 `\n` 的个数得到行号、用 `pos - lineStart + 1` 得到列号。两条路径都拿不到时才只显示原始错误信息。

### 嵌套深度怎么算

`computeStats()` 从根出发递归：**根节点所在层级记为 1**，每向内一层 `depth + 1`，过程中顺带累计所有 object 的 `Object.keys().length` 得到键总数。数组元素也计入层级，因此 `[ { a: 1 } ]` 的深度为 3。

### 其他细节

- 解析耗时用 `performance.now()` 测量，精确到亚毫秒；
- 搜索用事件委托遍历所有 `.node-row`，先清除旧高亮再匹配，命中后调用 `expandAncestors()` 逐级展开祖先，保证命中项一定可见；
- 复制结果优先用 `navigator.clipboard`，不可用时降级到临时 `textarea` + `execCommand('copy')`。

---

## 📄 License

本项目基于 [MIT License](LICENSE) 开源。

```
Copyright (c) 2026 苏小晗
```

你可以自由使用、修改、分发，只需保留上述版权声明。
