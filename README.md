# bilibili-short-video-blocker

Chrome 插件：按照自定义阈值隐藏 B 站时长过短的视频推荐，包括首页/分区卡片以及视频播放页右侧推荐栏。

## 使用方式

### 下载安装

1. 打开项目发布页：`https://github.com/baicai-1145/bilibili-short-video-blocker/releases`。
2. 在最新的 Release 中找到 `Source code (zip)`，点击下载。
3. 将下载得到的 zip 文件解压到任意本地目录（例如 `D:\bilibili-short-video-blocker`）。

### 在 Chrome 中加载扩展

1. 在地址栏输入 `chrome://extensions/` 打开扩展管理页面。
2. 打开右上角的“开发者模式”（Developer mode）。
3. 点击“加载已解压的扩展程序”（Load unpacked），选择上一步解压后的目录（包含 `manifest.json` 的文件夹）。
4. 加载成功后，你会在扩展列表中看到 “bilibili-short-video-blocker”。

### 配置与使用

1. 点击浏览器工具栏中的扩展图标，打开弹窗即可快速修改“短视频阈值”（单位：秒）。  
   - 阈值为 `0` 表示禁用过滤（不隐藏任何视频）。  
   - 默认阈值为 `60` 秒。
2. 你也可以设置关键词规则、UP 主白名单等高级选项。
3. 配置完成后，回到 bilibili 页面刷新，时长低于阈值且命中规则的视频卡片会被自动隐藏（包括首页、分区页和视频播放页右侧推荐栏）。
