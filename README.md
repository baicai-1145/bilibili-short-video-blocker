# bilibili-short-video-blocker

Chrome 插件：按照自定义阈值隐藏 B 站时长过短的视频推荐，包括首页/分区卡片以及视频播放页右侧推荐栏。

## 使用方式

1. 执行 `pnpm install` 之类的命令不是必须，插件无需编译，可直接加载。
2. 在 Chrome 浏览器地址栏输入 `chrome://extensions/`，打开右上角的“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本仓库根目录。
4. 加载后，点击浏览器工具栏中的扩展图标即可在弹窗内快速修改阈值；也可以在扩展详情页打开“扩展选项”进行配置。阈值为 `0` 表示禁用过滤。
5. 回到 bilibili 页面刷新，时长低于阈值的视频卡片会被自动隐藏。

## 开发说明

- `manifest.json`：Manifest V3 配置，声明 content script 与选项页。
- `src/content.js`：内容脚本，读取阈值、扫描视频卡片并通过 MutationObserver 监听新增节点。
- `options.html` / `options.css` / `src/options.js`：阈值配置界面与弹窗共用的 UI 与逻辑，使用 `chrome.storage` 同步至所有页面。
- `popup.html`：工具栏弹窗入口，复用同一套设置表单。

默认阈值为 60 秒，可在弹窗或选项页中调整。若后续需要支持更多页面或自定义规则，可在 `CARD_CONFIGS` 中扩充选择器与解析逻辑。
