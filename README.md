# dsh-tiiny-video

Generate videos on your Tiiny device from DeepSeek Harness (DSH). Write a prompt, optionally add a first-frame image, and preview the finished clip in the conversation sidebar. Videos are saved to your computer.

[Installation](#installation) · [Configuration](#configuration) · [Troubleshooting](#troubleshooting) · [Development](#development)

## Features

- **Text-to-video and image-to-video:** generate from a prompt, with an optional first-frame image.
- **Resolution and duration checks:** validate requests against a configurable list of combinations exported by your device.
- **Progress and cancellation:** follow submission, queueing, generation, and download; cancel a job from the panel.
- **Local playback:** save clips as `tiiny-video-<timestamp>-<id>.mp4` and preview them in the sidebar.
- **Playback repair:** optionally use FFmpeg to remux clips for seeking and duration metadata.
- **History:** retain recent generation records and discover existing MP4 files in the output folder.

The plugin sends prompts and reference images to the API endpoint you configure. With a local Tiiny endpoint, the device handles generation and the plugin saves the result locally. If you configure a remote endpoint, its data handling policies apply.

## Requirements

- DeepSeek Harness **0.2.x**.
- Node.js **20 or later** on the host.
- A Tiiny device exposing an OpenAI-compatible **`/v1/videos` API**, with an API key and a video model available on the device.
- Optional: **FFmpeg and FFprobe** for playback repair and media metadata.

To install the optional media tools on macOS:

```bash
brew install ffmpeg
```

See [Validation scope](#validation-scope) for testing limits.

## Installation

### Install from GitHub

```bash
dsh plugin add github:triskn/dsh-tiiny-video
```

Restart DSH, open **Tiiny Video** in the conversation sidebar, then open **Settings** and enter your **API Base URL** and **API Key**.

### Install from a local checkout

```bash
git clone https://github.com/triskn/dsh-tiiny-video.git ~/dsh-tiiny-video
```

Locate your DSH profile directory:

- macOS / Linux: `~/.dsh/profiles/<profile>/`
- Windows: `%USERPROFILE%\.dsh\profiles\<profile>\`

The desktop profile is usually named `desktop`. In its `package.json`, add a local dependency and include the package in `dsh.profile.bundles`. Keep your existing dependencies and bundles:

```jsonc
{
  "dependencies": {
    "dsh-tiiny-video": "link:/Users/you/dsh-tiiny-video" // Use your absolute checkout path.
  },
  "dsh": {
    "profile": {
      "bundles": [
        // Keep existing bundles here.
        "dsh-tiiny-video"
      ]
    }
  }
}
```

Run `pnpm install` in the profile directory using DSH's bundled pnpm, then restart DSH and configure the panel.

The package has not been published to npm as part of this release. Use the GitHub or local installation method above.

## Configuration

Change settings in the panel or edit `~/.tiiny-video/settings.json`. The plugin writes settings with file mode `0600` on systems that support Unix file permissions. The API key is not returned by the settings endpoint or displayed back in the panel.

| Field | Default | Description |
| --- | --- | --- |
| `baseUrl` | `http://openai.api.tiiny/v1` | Your device's API base URL. |
| `apiKey` | Empty | API key for the device. |
| `model` | `lightx2v/MiniMax-H3-Turbo` | Video model available on your device. |
| `size` | `832x480` | Resolution. Defaults include `832x480`, `480x832`, `1344x768`, and `768x1344`. |
| `seconds` | `5` | Duration supported for the selected resolution. The default list is 5, 6, or 7 seconds. |
| `outputDir` | `~/tiiny-videos` | Output directory; created if needed. Use an absolute path for a custom location. |
| `spec` | `DEFAULT_SPEC` in `index.js` | Map of resolutions to supported durations. Adjust it to match your device. |

### Environment variables

Environment variables supply defaults. Saved settings can override those defaults; `TIINY_OUTPUT_DIR` always overrides the output directory.

| Variable | Purpose |
| --- | --- |
| `TIINY_API_KEY` | Supply a key when no key is saved in settings. |
| `TIINY_BASE_URL` | Set the default API base URL. |
| `TIINY_MODEL` | Set the default model. |
| `TIINY_OUTPUT_DIR` | Override the output directory. |
| `TIINY_VIDEO_HOME` | Override the data directory, normally `~/.tiiny-video`. An explicit value disables migration from older in-package data files. |
| `TIINY_FFMPEG` | Set the FFmpeg executable path. |
| `TIINY_FFPROBE` | Set the FFprobe executable path. |

### Data storage

```text
~/.tiiny-video/
├── settings.json   # Settings; may contain an API key.
└── history.json    # Up to 50 recent generation records.
```

Runtime data lives outside the installed package so package upgrades do not replace it. Older local versions stored these files inside the plugin directory; the plugin attempts to copy them to the data directory when no destination file exists. Keep files containing credentials out of source control.

## How it works

The plugin has two parts:

- **Host (`index.js`):** submits jobs to the device, polls progress, downloads clips, manages history, and serves local routes.
- **Client (`client.js`):** registers the sidebar panel with prompt input, an optional first-frame image, resolution and duration controls, progress, and playback.

The panel uses these host routes under `/tiiny-video`:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/settings` | Read settings, with `hasApiKey` instead of the key. |
| `POST` | `/settings` | Update settings. |
| `POST` | `/generate` | Submit a generation job. |
| `GET` | `/job?id=` | Read one job. |
| `GET` | `/jobs` | List active jobs, history, and discovered output files. |
| `POST` | `/cancel` | Cancel a local job and attempt device-side cancellation. |
| `GET` | `/file/<name>` | Stream a saved clip with HTTP Range support. |

The device API calls are relative to `baseUrl`:

- `POST /videos`: multipart fields `model`, `prompt`, `size`, `seconds`, and optional `input_reference`.
- `GET /videos/{id}`: poll status and progress.
- `GET /videos/{id}/content`: download the MP4.
- `DELETE /videos/{id}`: request cancellation.

## Troubleshooting

### The device rejects a resolution or duration

The device may only support combinations exported ahead of time. Choose a supported resolution and duration, and make sure the plugin's `spec` matches your device. The default table is in `index.js` as `DEFAULT_SPEC`; override it through the `spec` field in `settings.json` if needed.

### A clip shows the wrong duration or cannot be scrubbed

Some device outputs are fragmented MP4 files with incomplete duration or seek metadata. When FFmpeg is available, the plugin attempts a remux using `-c copy -movflags +faststart`. Without FFmpeg, it keeps the original file.

### `Tiiny API key is not configured`

Enter the key in panel settings, or set `TIINY_API_KEY` in the DSH host environment and restart DSH.

### The panel does not appear

Check that `dsh-tiiny-video` is included in your profile's bundles, dependency installation succeeded, and DSH has been restarted. Check the host logs for module loading errors.

## Validation scope

The initial publication passed **7 local host-route smoke tests**, JavaScript syntax checks, and an npm package dry run. Real-device generation, panel loading after a DSH restart, and Windows / Linux compatibility were not revalidated for that publication. The CI workflow defines checks for macOS, Windows, and Linux with Node.js 20 and 22; this is not a claim that all platform checks have passed.

The default resolution and duration table comes from local configuration. Confirm that your device supports those combinations before generating a clip.

## Development

```bash
git clone https://github.com/triskn/dsh-tiiny-video.git
cd dsh-tiiny-video
node --test
```

The tests require no additional dependencies and use temporary directories for settings and output.

```text
index.js           # Host API bridge, routes, downloads, and history.
client.js          # React sidebar panel loaded by DSH.
cordis.patch.yml   # Profile mounting declaration.
locale/en.json     # English locale resource.
icon.svg           # Plugin icon.
test/              # Host-route smoke tests.
.github/workflows/ # CI checks.
```

## License

[MIT](./LICENSE)
