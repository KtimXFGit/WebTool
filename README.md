# GRS LC01 Web Console

独立发布的 GRS LC01 浏览器版界面模拟器与 Web 上位机。

## 功能

- 复刻 GRS_01 Production 固件 128×64 ST7567 主界面、趋势页和设置交互。
- 提供本底、剂量上升、报警、GM 故障、低电量等模拟场景。
- 使用 Web Serial 连接真实 GRS LC01，读取设备信息、RTC、Health、GM Status、Resource Info 和 HV Status。
- 实时显示剂量率、CPS/CPM、总脉冲、算法/探测状态，并支持 CSV 导出。
- 支持通过现有 USB CDC Production 协议传输 `.grsfw` 和 `.grsres`。
- Production 高压接口保持只读，不开放保留的 0x51–0x54 手动 PWM/调参命令。

## 在线地址

GitHub Pages 启用并部署成功后：

`https://ktimxfgit.github.io/WebTool/`

## 浏览器要求

实机连接使用 Web Serial API，推荐 Windows/macOS/Linux 桌面版 Chrome 或 Edge，并通过 HTTPS 或 localhost 访问。首次连接需要用户在浏览器设备选择框中授权。

## 目录

```text
WebTool/
├─ index.html
├─ styles.css
├─ grs-protocol.js
├─ app.js
├─ .nojekyll
├─ README.md
└─ .github/workflows/deploy-pages.yml
```

网站无 npm/CDN 运行时依赖，可直接由 GitHub Pages 发布。

## 与固件的关系

网页中的 LCD 是浏览器 Canvas 对 GRS_01 Production UI 布局与主要交互状态机的复刻，不直接执行 CH32 固件绘制函数，因此字体 raster 可能与实机资源包存在少量像素级差异。Web 上位机只调用 Production 已公开的 USB CDC 协议，不额外开放标定或高压调试命令。
