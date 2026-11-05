# dsh-tiiny-video

> 在 DeepSeek Harness（dsh）里，用你手上的 Tiiny 设备本地跑视频生成。

写一句提示词，可选附一张首帧图，模型在 Tiiny 设备上渲染，成片直接落到你的硬盘里并在会话侧栏里预览。

[English](#english) · [安装](#安装) · [配置](#配置) · [常见问题](#常见问题)

---

## 它是什么

`dsh-tiiny-video` 是 DSH 的一个双端插件：

- **Host 端**（`index.js`）通过 Tiiny 设备暴露的 **OpenAI 兼容 Videos API** 提交任务、轮询进度、下载成片，并把文件落盘、维持一份历史记录。
- **Client 端**（`client.js`）在会话侧栏注册一个「Tiiny Video」面板：提示词输入、首帧图、分辨率/时长选择、进度条、最近成片预览。

插件将提示词和首帧图发送到你配置的 API 地址。使用本地 Tiiny 地址时，生成由该设备处理，成片保存到本机；若配置远程地址，请先确认该服务的数据处理方式。

## 功能

| 能力 | 说明 |
| --- | --- |
| 文生视频 / 图生视频 | 输入提示词；可选拖入一张首帧图作为 `input_reference` |
| 设备形状预检 | 只允许设备已导出的「分辨率 × 时长」组合，避免提交后被设备拒绝 |
| 可读的报错 | 把设备的 `no exported bucket fits …` 翻译成「该分辨率只导出了 5/6/7 秒」这类可操作提示 |
| 进度与取消 | 提交 → 排队 → 生成 → 下载，全程可见，可随时取消 |
| 成片落盘 | 保存为 `tiiny-video-<时间戳>-<id>.mp4`，自动 remux 修复时长与拖动（需 ffmpeg） |
| 历史与发现 | 重启后仍能看到历史成片；输出目录里已有的 mp4 也会被识别出来 |

## 环境要求

- **DSH 0.2.x**（macOS / Windows / Linux 的桌面版或 Web 版均可）
- **一台 Tiiny 设备**，提供 OpenAI 兼容的 `/v1/videos` 接口，以及对应的 API key
- 可选：`ffmpeg` / `ffprobe`（缺失时插件仍可用，只是不做 faststart 修复和时长探测）

```bash
# macOS
brew install ffmpeg
```

## 安装

**方式一：一条命令从 GitHub 安装（现在就能用）**

```bash
dsh plugin add github:triskn/dsh-tiiny-video
```

装完重启 DSH，侧栏会出现「Tiiny Video」。

**方式二：从 npm 安装（发布后）**

```bash
dsh plugin add dsh-tiiny-video
```

**方式三：源码开发 / 本地调试**

```bash
git clone https://github.com/triskn/dsh-tiiny-video.git ~/dsh-tiiny-video
```

profile 目录在：

- macOS / Linux：`~/.dsh/profiles/<profile>/`（一般是 `desktop`）
- Windows：`%USERPROFILE%\.dsh\profiles\<profile>\`

编辑该目录下的 `package.json`，用 `link:` 指过去，并把包名加进 `bundles`：

```jsonc
{
  "dependencies": {
    "dsh-tiiny-video": "link:/Users/you/dsh-tiiny-video"   // 换成你的绝对路径
  },
  "dsh": {
    "profile": {
      "bundles": [
        // …已有的 bundle…
        "dsh-tiiny-video"
      ]
    }
  }
}
```

然后在 profile 目录执行 `pnpm install`（DSH 自带 pnpm），重启 DSH。

**最后一步（任意方式）：打开面板设置，填入 API Base URL 与 API Key。**

## 配置

插件把配置存在 `~/.tiiny-video/settings.json`（权限 `600`），可以在面板的「设置」里改，也可以直接改文件：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `baseUrl` | `http://openai.api.tiiny/v1` | 设备上 OpenAI 兼容服务的地址 |
| `apiKey` | 空 | 设备 API key；面板里永远不回显 |
| `model` | `lightx2v/MiniMax-H3-Turbo` | 设备上已导出的模型名 |
| `size` | `832x480` | 分辨率；可选 `832x480` / `480x832` / `1344x768` / `768x1344` |
| `seconds` | `5` | 时长，只能是该分辨率已导出的值（通常是 5–7 秒） |
| `outputDir` | `~/tiiny-videos` | 成片输出目录，不存在会自动创建 |
| `spec` | 见源码 `DEFAULT_SPEC` | 设备已导出的「分辨率 → 时长」表，换设备时可覆盖 |

环境变量可提供默认值；已保存的配置可能覆盖这些默认值，`TIINY_OUTPUT_DIR` 始终覆盖输出目录：

| 变量 | 作用 |
| --- | --- |
| `TIINY_API_KEY` | 不想把 key 写进文件时用它 |
| `TIINY_BASE_URL` | 覆盖默认设备地址 |
| `TIINY_MODEL` | 覆盖默认模型 |
| `TIINY_OUTPUT_DIR` | 覆盖成片输出目录 |
| `TIINY_VIDEO_HOME` | 覆盖数据目录（默认 `~/.tiiny-video`）；显式设置后不再迁移旧版包内数据 |
| `TIINY_FFMPEG` / `TIINY_FFPROBE` | 指定 ffmpeg / ffprobe 路径 |

### 数据放在哪

```
~/.tiiny-video/
├── settings.json   # 配置（可能含 API key，已在 .gitignore 里）
└── history.json    # 最近 50 条生成记录
```

升级插件不会丢配置：数据目录在包目录之外。早期版本把这两个文件放在插件目录里，首次启动会自动迁移。

## 工作原理

Host 端只做三件事：向设备提交、轮询、取回。Client 端的面板通过下面这组本地路由与 Host 通信（前缀 `/tiiny-video`）：

| 方法 | 路径 | 作用 |
| --- | --- | --- |
| `GET` | `/settings` | 读取配置（不含 key 明文，只给 `hasApiKey`） |
| `POST` | `/settings` | 更新配置 |
| `POST` | `/generate` | 提交生成任务，返回 job |
| `GET` | `/job?id=` | 查询单个任务 |
| `GET` | `/jobs` | 合并「进行中 + 历史 + 输出目录里已有的 mp4」 |
| `POST` | `/cancel` | 取消任务（并尽力通知设备） |
| `GET` | `/file/<name>` | 带 Range 的成片流式播放 |

对设备侧使用的是标准 OpenAI Videos 语义：

- `POST /videos`（multipart：`model` / `prompt` / `size` / `seconds` / 可选 `input_reference`）
- `GET /videos/{id}`（轮询 `status` 与 `progress`）
- `GET /videos/{id}/content`（下载 mp4 字节）
- `DELETE /videos/{id}`（取消）

## 常见问题

**「设备没有为这个形状导出计算图」**

Tiiny 设备不会临时编译视频计算图，只支持预先导出的「分辨率 × 时长」组合。换一个该分辨率下列出的时长（通常 5–7 秒），或换分辨率。表格在 `index.js` 的 `DEFAULT_SPEC`，也可以在 `settings.json` 里用 `spec` 覆盖。

**成片时长显示只有 1 秒、不能拖动**

设备返回的是分片 MP4（`mvhd` duration 为 0、无索引）。插件会用 ffmpeg 做一次 `-c copy -movflags +faststart` 重封装来修好它；如果没装 ffmpeg 就会跳过，原文件仍然可播。

**提示 `Tiiny API key is not configured`**

面板设置里填 key，或设置 `TIINY_API_KEY` 环境变量后重启 DSH。

**面板没出现**

确认 profile 的 `bundles` 里有 `dsh-tiiny-video`、`pnpm install` 成功、并且重启过 DSH。Host 端日志会打印模块加载错误。

## 验证范围

已通过 7 项本地 Host 路由冒烟测试和 JavaScript 语法检查。本次发布未重新验证真实设备生成、DSH 重启后的面板加载或 Windows / Linux 兼容性；仓库 CI 提供跨平台检查。默认分辨率与时长表来自本地配置，使用前请确认你的设备实际支持。

## 开发

```bash
git clone https://github.com/triskn/dsh-tiiny-video.git
cd dsh-tiiny-video
node --test test/        # 无需安装任何依赖
```

仓库结构：

```
index.js           # Host 端：设备 API、路由、落盘、历史
client.js          # Client 端：侧栏面板（React，浏览器全局模块）
cordis.patch.yml   # 插件在 profile 里的挂载声明
locale/en.json     # 面板文案
icon.svg           # 图标
test/              # node:test 冒烟测试
```

## 许可

[MIT](./LICENSE)

---

<a id="english"></a>

## English

**dsh-tiiny-video** plugs a Tiiny device's local MiniMax video model into DeepSeek Harness (dsh). Write a prompt, optionally attach a first-frame image, and the clip is rendered on the device, saved to disk, and previewed in the conversation sidebar.

- Requires dsh 0.2.x, a Tiiny device exposing an OpenAI-compatible `/v1/videos` API plus its API key, and optionally `ffmpeg`.
- Install with `dsh plugin add github:triskn/dsh-tiiny-video` (or `dsh plugin add dsh-tiiny-video` once it is on npm), then restart dsh.
- Settings live in `~/.tiiny-video/settings.json`; set `TIINY_API_KEY` to keep the key out of the file.
- MIT licensed.
