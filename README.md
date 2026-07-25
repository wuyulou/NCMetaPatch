
﻿# NCMeta-Patch 网易云音乐专辑补充助手

一个用于整理专辑资料并辅助填写网易云音乐专辑补充页的 Chrome/Edge MV3 扩展。在 `Discogs`、`Rate Your Music` 或 `Bandcamp` 的专辑页面点击左下角按钮，扩展会采集当前专辑资料、下载封面、打开网易云补充页，并尝试自动填写可识别字段。封面选择、内容复核和最终提交始终由你手动完成。

<img width="1254" height="1254" alt="file_0000000054e881f89da5d12f778df9b0" src="https://github.com/user-attachments/assets/9eaa8213-247a-4415-bb47-9fcee59cc4ba" />

## About / 简介

- 中文：一个用于整理专辑资料并辅助填写网易云音乐专辑补充页的 Chrome/Edge MV3 扩展。
- English: A Chrome/Edge MV3 extension for organizing album metadata and helping fill the NetEase Cloud Music album submission page.

## 灵感来源 / Inspiration

本项目的工作流灵感来自 [zeqianli/DoubanListingHelper](https://github.com/zeqianli/DoubanListingHelper)，感谢其“先采集、再人工复核”的编辑思路。

This project was inspired by [zeqianli/DoubanListingHelper](https://github.com/zeqianli/DoubanListingHelper), especially its collect-first, review-by-hand workflow.

## 主要功能 / Features

- 支持 Discogs、Rate Your Music（RYM）和 Bandcamp 专辑页一键采集
- 自动下载封面到浏览器默认下载目录
- 自动打开网易云音乐专辑补充页
- 网易云页面加载完成后尝试自动填表，也可从侧边栏再次触发
- 保留来源链接，便于人工复核

## 安装 / Install

1. 在本项目页面右上方点击绿色的Code选项，再点击Download ZIP进行下载
2. 打开 Chrome，进入 `chrome://extensions/`
3. 打开右上角“开发者模式”
4. 点击“加载未打包的扩展程序”
5. 选择本项目根目录，也就是包含 `manifest.json` 的文件夹
6. 修改扩展后，在扩展管理页点击“重新加载”，并刷新已打开的来源页和网易云页面

Edge 的安装方式相同，扩展管理地址为 `edge://extensions/`。

## 使用 / How to Use

1. 登录网易云音乐，并打开 Discogs、RYM 或 Bandcamp 的专辑页
2. 点击页面左下角的“补充到网易云”
3. 等待扩展采集资料、下载封面并打开网易云补充页
4. 如果页面没有自动填充，就打开侧边栏并点击“填充当前页面”
5. 手动检查所有字段，确认封面、内容和来源链接
6. 最后由你点击网易云页面的提交按钮

## 自动化边界 / Automation Boundaries

| 网易云字段 | 扩展行为 |
| --- | --- |
| 专辑名、副标题 | 有资料时尝试填充 |
| 艺人 | 永远不自动填写，因为网易云音乐网页本身bug |
| 发行公司 | 优先使用来源资料，缺失时填 `Self-Released` |
| 发行日期 | 永远不自动填写，因为网易云音乐网页本身bug |
| 专辑类型、曲风 | 有可靠识别结果时尝试匹配，仍需人工确认 |
| 专辑介绍 | 使用草稿中的来源说明或补充备注文字 |
| 独立“补充备注” | 永远不自动填写 |
| 封面 | 只负责下载，不会自动操作文件选择框 |
| 提交 | 永远不自动点击 |

## 来源处理 / Source Handling

### Discogs

- 结构化字段优先来自 Discogs API
- 会清理艺人重名编号，例如 `Mike (23)` 会在草稿中显示为 `Mike`
- 专辑说明优先采集曲目列表下方、`Companies, etc.` 开始到 `Barcode and Other Identifiers` 之前的页面内容
- 封面优先使用来源页或 API 返回的主图

### Rate Your Music

- 会移除标题中的 `- RYM/Sonemic` 等站点尾缀
- 会从页面说明文字中尽量识别发行日期、发行公司和发行类型
- 例如说明里的 `Released ... on Kill Rock Stars` 会尝试识别为发行公司
- RYM 页面结构变化时，部分字段可能仍需要手工修正

### Bandcamp

- 会采集标题、艺人、发行日期、曲目、封面和页面说明
- 专辑介绍会尽量包含曲目列表下方的说明内容，并截取到 `all rights reserved` 为止
- 页面没有明确发行公司时会填 `Self-Released`

## 侧边栏 / Side Panel

- `打开补充页`：新开网易云音乐专辑补充页
- `填充当前页面`：把当前草稿再次写入正在打开的网易云补充页
- `扫描当前页面`：检查扩展当前可识别多少个表单控件，便于排查页面改版
- `复制摘要`：复制当前草稿的文本摘要，方便人工复核
- `清空草稿`：删除扩展本地保存的当前草稿与待填充状态

## 隐私与边界 / Privacy

- 草稿只保存在浏览器扩展本地存储中，清空草稿后会删除当前记录
- 扩展只在声明的 Discogs、RYM、Bandcamp 和网易云域名上运行
- 不提供音乐文件下载、自动上传封面或自动提交功能
- 使用来源资料时请遵守对应网站条款，并在提交前确认资料准确性和版权状态
- 本扩展为非官方工具，与 Discogs、Rate Your Music、Bandcamp、网易云音乐均无隶属或背书关系

## 开发与测试 / Development & Testing

使用 Node.js 运行测试：

```bash
npm test
```

测试主要覆盖 URL 解析、日期归一化、艺人名清理、来源草稿统一化，以及网易云表单字段映射与回填行为。

主要文件：

- `src/shared.js`：字段归一化、日期解析、表单识别与回填逻辑
- `src/background.js`：草稿状态、封面下载、打开网易云页面和自动填充工作流
- `src/source-content.js`：来源页采集和左下角一键补充按钮
- `src/content.js`：网易云页面适配和页面内操作面板
- `src/sidepanel.js`：侧边栏草稿预览、复核和辅助操作

## 许可证 / License

MIT. See [LICENSE](LICENSE).

## English

NCMeta-Patch-网易云音乐专辑补充助手 is a Chrome/Edge MV3 extension for collecting album metadata from Discogs, Rate Your Music, and Bandcamp, then helping fill the NetEase Cloud Music album submission page.

It downloads cover art, opens the NetEase form, and best-effort fills the fields it can recognize. Cover choice, review, and submission remain manual.

Key points:

- Install it with Load unpacked from the project root.
- Use the lower-left button on supported album pages.
- Review every field before submitting.
- License: MIT.
