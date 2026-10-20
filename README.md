# GRS LC01 Web Console

独立发布的 GRS LC01 浏览器版 **128×64 LCD 界面模拟器 + Web 上位机**。

在线地址：`https://ktimxfgit.github.io/WebTool/`

## 功能

- 按 GRS_01 Production 固件的 128×64 ST7567 页面坐标、绘图图元和资源字形渲染主界面、趋势页和设置交互。
- 提供本底、剂量上升、报警、GM 故障、低电量等模拟场景。
- 使用 Web Serial 连接真实 GRS LC01，读取设备信息、RTC、Health、GM Status、Resource Info 和 HV Status。
- 实时显示剂量率、CPS/CPM、总脉冲、算法/探测状态，并支持 CSV 导出。
- 支持通过现有 USB CDC Production 协议传输 `.grsfw` 和 `.grsres`。
- Production 高压接口保持只读，不开放保留的 `0x51–0x54` 手动 PWM/调参命令。

## Production 同源逐像素渲染

LCD 区域不再使用浏览器字体近似绘制。`GRS_01/03_Project_PCtool/Resource_Build` 使用与 Production 资源包相同的输入生成 Web 字形子集，WebTool 再直接把这些 1-bit bitmap 写入 128×64 页式 framebuffer。

当前资源链固定为：

- Ark Pixel 12px Monospaced zh-CN SHA-256：`43db898baccdcd58f37dcd926c08f8d9ccd412ef8be8104cb491a0d3d6faf6f2`
- U8g2 字体源固定 commit：`ab9e48b2228351e9476682a70b7f3ee4909cd585`
- `font6x8` 固定 commit：`efde4f6250b8127a954e2055b1b12b81e1824fc6`
- Web 字形子集：280 个 Production 实际使用 glyph/icon

```text
Production Resource_Build
        ↓
BODY_12 / LATIN_6X8 / ICON_8
TIMR24 / ProFont12 / T0_11 / HAXRCORP / 6X10
        ↓
1-bit glyph bitmap + width/height/advance/xOffset/yOffset
        ↓
gr­s-production-ui.js
        ↓
128 × 64 ST7567 page framebuffer
        ↓
逐像素 Canvas 输出
        ↓
4× 整数倍显示（桌面端 512 × 256）
```

`grs-production-ui.js` 同时复刻固件 `lcd_canvas` 的像素、水平/垂直线、矩形、填充和整数 Bresenham 线段行为，并按 `ui_pages.c` 的 Production 坐标绘制标题栏、主读数、状态区、表情、底部实时数据、60 秒趋势和设置列表。LCD 绘制过程不调用 `CanvasRenderingContext2D.fillText()`。

`lcd-sharp.css` 仅负责页面端整数倍显示；旧的 `lcd-sharp.js` 已不再由页面加载。

## 重要边界

“逐像素一致”指 **相同输入状态下，Web 模拟器使用与 Production 相同的字形 bitmap、坐标和 1-bit 绘图规则生成帧缓冲**。

当前 Production USB CDC 协议没有提供“读取当前 LCD 1024 字节 framebuffer”或“完整 UI model/远程按键注入”接口，因此连接真机后，Web 左侧 LCD 不是物理屏幕的实时镜像。右侧上位机读取到的 GM/RTC/HV 等公开数据会继续进入 Web 状态；如果后续需要对真机画面做逐字节镜像校验，应在固件增加只读 framebuffer/debug snapshot 接口，而不是在网页端猜测未公开状态。

## 浏览器要求

实机连接使用 Web Serial API，推荐 Windows/macOS/Linux 桌面版 Chrome 或 Edge，并通过 HTTPS 或 localhost 访问。首次连接需要用户在浏览器设备选择框中授权。

## 主要文件

```text
WebTool/
├─ index.html
├─ styles.css
├─ lcd-sharp.css
├─ grs-production-ui.js
├─ ui-resource/
│  ├─ grs-ui-meta.js
│  ├─ grs-ui-strings.js
│  └─ grs-ui-faces.js
├─ grs-protocol.js
├─ app.js
├─ tools/enable-production-pixel-ui.py
├─ .nojekyll
├─ README.md
└─ .github/workflows/
   ├─ deploy-pages.yml
   └─ enable-production-pixel-ui.yml
```

网站无 npm/CDN 运行时依赖，可直接由 GitHub Pages 发布。

## 与固件的关系

Web LCD 的显示资源来自 GRS_01 Production `Resource_Build` 的同源构建结果；网页只公开实际界面所需的紧凑 1-bit glyph 子集，不发布源字体文件。Web 上位机继续只调用 Production 已公开 USB CDC 协议，不额外开放标定或高压调试命令。
