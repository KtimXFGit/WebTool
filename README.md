# GRS LC01 Web Console

独立发布的 GRS LC01 浏览器版 **128×64 LCD 界面模拟器 + Web 上位机**。

在线地址：`https://ktimxfgit.github.io/WebTool/`

## 功能

- 复刻 GRS_01 Production 固件 128×64 ST7567 主界面、趋势页和设置交互。
- 提供本底、剂量上升、报警、GM 故障、低电量等模拟场景。
- 使用 Web Serial 连接真实 GRS LC01，读取设备信息、RTC、Health、GM Status、Resource Info 和 HV Status。
- 实时显示剂量率、CPS/CPM、总脉冲、算法/探测状态，并支持 CSV 导出。
- 支持通过现有 USB CDC Production 协议传输 `.grsfw` 和 `.grsres`。
- Production 高压接口保持只读，不开放保留的 `0x51–0x54` 手动 PWM/调参命令。

## 128×64 LCD 像素渲染

Web 模拟器保持真实的 `128×64` 逻辑 Canvas，不把浏览器抗锯齿后的低分辨率文字直接任意比例拉伸：

```text
GRS UI layout
    ↓
128 × 64 logical Canvas
    ↓
LCD 两色 1-bit 量化
    ↓
4× 整数倍像素显示（桌面端 512 × 256）
```

`lcd-sharp.js` 会把 LCD Canvas 中的抗锯齿灰阶像素重新量化为 ST7567 风格的两种颜色；`lcd-sharp.css` 在桌面端使用精确 4× 显示，并禁用图像平滑。

GRS Production 固件的设置页中文使用 `UI_FACE_BODY_12`，英文使用紧凑的 `UI_FACE_LATIN_6X8`。Web 端因此会把中文标签按接近 BODY_12 的像素尺寸栅格化，避免原先 6~7 px 中文字体放大后笔画发灰、发虚。

实现思路参考了 GitHub 开源项目 `createskyblue/u8g2-js` 的 Canvas renderer：从显示缓冲逐像素生成图像，关闭 `imageSmoothingEnabled`，再按整数 `scale` 放大。WebTool 没有直接复制其渲染代码，而是针对现有 GRS Canvas 做独立的 1-bit 后处理。

## 浏览器要求

实机连接使用 Web Serial API，推荐 Windows/macOS/Linux 桌面版 Chrome 或 Edge，并通过 HTTPS 或 localhost 访问。首次连接需要用户在浏览器设备选择框中授权。

## 目录

```text
WebTool/
├─ index.html
├─ styles.css
├─ lcd-sharp.css
├─ lcd-sharp.js
├─ grs-protocol.js
├─ app.js
├─ .nojekyll
├─ README.md
└─ .github/workflows/deploy-pages.yml
```

网站无 npm/CDN 运行时依赖，可直接由 GitHub Pages 发布。

## 与固件的关系

网页中的 LCD 是浏览器 Canvas 对 GRS_01 Production UI 布局与主要交互状态机的复刻，不直接执行 CH32 固件的 `.grsres` 字形解码，因此字形轮廓仍可能与实机资源包存在少量像素级差异；显示输出本身保持严格的单色像素风格。Web 上位机只调用 Production 已公开的 USB CDC 协议，不额外开放标定或高压调试命令。
