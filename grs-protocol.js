/* Browser-side subset of 03_Project_PCtool/GRS_LC01_Tool/grs_protocol.py.
 * Production boundary: read-only HV status; reserved 0x51-0x54 are intentionally absent.
 */
(() => {
  'use strict';

  const MAGIC0 = 0x47; // G
  const MAGIC1 = 0x52; // R
  const PROTOCOL_VERSION = 1;
  const MAX_PAYLOAD = 512;
  const MAX_CHUNK = 256;
  const RESPONSE_BIT = 0x80;
  const USB_VID = 0xFFFF;
  const USB_PID = 0xB63D;
  const STATUS_OK = 0;

  const CMD = Object.freeze({
    GET_DEVICE_INFO: 0x01,
    START: 0x10,
    WRITE: 0x11,
    QUERY: 0x12,
    FINISH: 0x13,
    ABORT: 0x14,
    REBOOT: 0x15,
    RESOURCE_INFO: 0x20,
    RESOURCE_START: 0x21,
    RESOURCE_WRITE: 0x22,
    RESOURCE_QUERY: 0x23,
    RESOURCE_FINISH: 0x24,
    RESOURCE_ABORT: 0x25,
    RTC_GET: 0x30,
    RTC_SET: 0x31,
    DEVICE_HEALTH_GET: 0x32,
    GM_STATUS_GET: 0x33,
    HV_STATUS_GET: 0x50,
  });

  class ProtocolError extends Error {}
  class DeviceRejected extends ProtocolError {
    constructor(status, message = '') {
      super(message || `设备拒绝请求：0x${hex(status, 4)}`);
      this.status = status;
    }
  }

  function hex(value, width = 2) {
    return Number(value >>> 0).toString(16).toUpperCase().padStart(width, '0');
  }

  function crc16CcittFalse(data, initial = 0xFFFF) {
    let crc = initial;
    for (const value of data) {
      crc ^= value << 8;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
      }
    }
    return crc;
  }

  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(data) {
    let crc = 0xFFFFFFFF;
    for (const value of data) crc = CRC32_TABLE[(crc ^ value) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function u16(value) {
    const out = new Uint8Array(2);
    new DataView(out.buffer).setUint16(0, value, true);
    return out;
  }

  function concatBytes(...parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }

  function encodeFrame(command, sequence, payload = new Uint8Array()) {
    if (payload.length > MAX_PAYLOAD) throw new ProtocolError('协议负载超过 512 字节');
    const body = new Uint8Array(8 + payload.length);
    const view = new DataView(body.buffer);
    body[0] = MAGIC0; body[1] = MAGIC1;
    body[2] = PROTOCOL_VERSION;
    body[3] = command;
    view.setUint16(4, sequence, true);
    view.setUint16(6, payload.length, true);
    body.set(payload, 8);
    return concatBytes(body, u16(crc16CcittFalse(body)));
  }

  class FrameParser {
    constructor() { this.buffer = new Uint8Array(); }
    feed(chunk) {
      this.buffer = concatBytes(this.buffer, chunk);
      const frames = [];
      while (true) {
        let magicAt = -1;
        for (let i = 0; i + 1 < this.buffer.length; i += 1) {
          if (this.buffer[i] === MAGIC0 && this.buffer[i + 1] === MAGIC1) { magicAt = i; break; }
        }
        if (magicAt < 0) {
          this.buffer = this.buffer.length && this.buffer[this.buffer.length - 1] === MAGIC0
            ? this.buffer.slice(-1) : new Uint8Array();
          break;
        }
        if (magicAt) this.buffer = this.buffer.slice(magicAt);
        if (this.buffer.length < 8) break;
        const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
        const version = this.buffer[2];
        const command = this.buffer[3];
        const sequence = view.getUint16(4, true);
        const length = view.getUint16(6, true);
        if (length > MAX_PAYLOAD) { this.buffer = this.buffer.slice(1); continue; }
        const total = 8 + length + 2;
        if (this.buffer.length < total) break;
        const raw = this.buffer.slice(0, total);
        this.buffer = this.buffer.slice(total);
        const expectedCrc = new DataView(raw.buffer, raw.byteOffset + total - 2, 2).getUint16(0, true);
        if (crc16CcittFalse(raw.slice(0, -2)) !== expectedCrc || version !== PROTOCOL_VERSION) continue;
        frames.push({ command, sequence, payload: raw.slice(8, -2) });
      }
      return frames;
    }
  }

  function viewOf(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function requireLength(payload, length, text) { if (payload.length < length) throw new ProtocolError(text); }
  function requireOk(status) { if (status !== STATUS_OK) throw new DeviceRejected(status); }

  function parseDeviceInfo(payload) {
    requireLength(payload, 30, '设备信息响应过短');
    const v = viewOf(payload);
    const result = {
      status: v.getUint16(0, true), productId: v.getUint32(2, true), hardwareRevision: v.getUint16(6, true),
      applicationVersion: v.getUint32(8, true), bootState: v.getUint8(12), upgradeState: v.getUint8(13),
      externalPowerPresent: Boolean(v.getUint8(14)), resetReason: v.getUint8(15), batteryMv: v.getUint16(16, true),
      maxChunkSize: v.getUint16(18, true), sessionId: v.getUint32(20, true), acceptedOffset: v.getUint32(24, true),
      lastError: v.getUint16(28, true),
    };
    requireOk(result.status); return result;
  }

  function parseRtc(payload) {
    requireLength(payload, 12, 'RTC 响应过短');
    const v = viewOf(payload);
    const result = { status: v.getUint16(0, true), clockSource: v.getUint8(2), timeQuality: v.getUint8(3), utcEpoch: v.getUint32(4, true), timezoneOffsetMinutes: v.getInt16(8, true), lseReady: Boolean(v.getUint8(10)) };
    requireOk(result.status); return result;
  }

  function parseHealth(payload) {
    requireLength(payload, 8, '设备健康状态响应长度错误');
    const v = viewOf(payload);
    const result = { status: v.getUint16(0, true), formatVersion: v.getUint16(2, true), faultBitmap: v.getUint32(4, true) };
    requireOk(result.status); return result;
  }

  function parseGm(payload) {
    requireLength(payload, 32, 'GM 状态响应长度错误');
    const v = viewOf(payload);
    const formatVersion = v.getUint16(2, true);
    let measure = v.getUint16(26, true);
    if (formatVersion < 2) measure = v.getUint32(16, true);
    if (formatVersion >= 3) { requireLength(payload, 36, 'GM 状态 v3 响应长度错误'); measure = v.getUint32(32, true); }
    const elapsed = v.getUint32(20, true);
    const raw = v.getUint16(24, true);
    const flags = v.getUint8(31);
    const result = {
      status: v.getUint16(0, true), formatVersion, sampleSequence: v.getUint32(4, true), totalPulses: v.getUint32(8, true),
      displayCpm: v.getUint32(12, true), doseRateCentiUsvh: v.getUint32(16, true), sampleElapsedMs: elapsed,
      rawDeltaCount: raw, measureDoseRateCentiUsvh: measure, algorithmStatus: formatVersion < 2 ? 0 : v.getUint16(28, true),
      detectionState: v.getUint8(30), flags: formatVersion < 2 ? (flags & 0x07) : flags,
      normalizedCps: elapsed ? raw * 1000 / elapsed : 0,
      alarmActive: Boolean(flags & 0x01), timingFault: Boolean(flags & 0x02), gmFault: Boolean(flags & 0x04),
    };
    requireOk(result.status); return result;
  }

  function parseHv(payload) {
    requireLength(payload, 24, '高压状态响应长度错误');
    const v = viewOf(payload);
    const result = {
      status: v.getUint16(0, true), formatVersion: v.getUint16(2, true), feedbackValid: Boolean(v.getUint8(4)),
      faultFlags: v.getUint8(5), enabled: Boolean(v.getUint8(6)), actualFrequencyHz: v.getUint32(8, true),
      targetMv: v.getUint32(12, true), measuredMv: v.getUint32(16, true), appliedDutyBp: v.getUint16(20, true), adcRaw: v.getUint16(22, true),
    };
    requireOk(result.status); return result;
  }

  function parseProgress(payload) {
    requireLength(payload, 16, '设备进度响应过短'); const v = viewOf(payload);
    return { status: v.getUint16(0, true), state: v.getUint8(2), sessionId: v.getUint32(4, true), acceptedOffset: v.getUint32(8, true), batteryMv: v.getUint16(12, true), lastError: v.getUint16(14, true) };
  }

  function parseResourceProgress(payload) {
    requireLength(payload, 28, '资源更新进度响应过短'); const v = viewOf(payload);
    return { status: v.getUint16(0, true), state: v.getUint8(2), activeBank: v.getUint8(3), targetBank: v.getUint8(4), maxChunkSize: v.getUint16(6, true), sessionId: v.getUint32(8, true), acceptedOffset: v.getUint32(12, true), totalSize: v.getUint32(16, true), candidateVersion: v.getUint32(20, true), lastError: v.getUint16(24, true) };
  }

  function parseResourceInfo(payload) {
    requireLength(payload, 30, '资源信息响应过短'); const v = viewOf(payload);
    const result = { status: v.getUint16(0, true), state: v.getUint8(2), activeBank: v.getUint8(3), targetBank: v.getUint8(4), maxChunkSize: v.getUint16(6, true), activeVersion: v.getUint32(8, true), candidateVersion: v.getUint32(12, true), sessionId: v.getUint32(16, true), acceptedOffset: v.getUint32(20, true), totalSize: v.getUint32(24, true), lastError: v.getUint16(28, true) };
    requireOk(result.status); return result;
  }

  function payloadU32(value) { const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value >>> 0, true); return out; }
  function payloadTwoU32(a, b) { const out = new Uint8Array(8); const v = new DataView(out.buffer); v.setUint32(0, a >>> 0, true); v.setUint32(4, b >>> 0, true); return out; }
  function payloadThreeU32(a, b, c) { const out = new Uint8Array(12); const v = new DataView(out.buffer); v.setUint32(0, a >>> 0, true); v.setUint32(4, b >>> 0, true); v.setUint32(8, c >>> 0, true); return out; }
  function payloadChunk(sessionId, offset, data) {
    if (!data.length || data.length > MAX_CHUNK) throw new ProtocolError('升级分块长度必须在 1 到 256 字节之间');
    const head = new Uint8Array(12); const v = new DataView(head.buffer);
    v.setUint32(0, sessionId >>> 0, true); v.setUint32(4, offset >>> 0, true); v.setUint16(8, data.length, true); v.setUint16(10, crc16CcittFalse(data), true);
    return concatBytes(head, data);
  }

  class SerialClient {
    constructor(onLog = () => {}, onDisconnect = () => {}) {
      this.port = null; this.reader = null; this.keepReading = false; this.parser = new FrameParser(); this.sequence = 0;
      this.pending = new Map(); this.onLog = onLog; this.onDisconnect = onDisconnect; this.txTail = Promise.resolve();
    }
    get connected() { return Boolean(this.port?.readable && this.port?.writable); }
    async connect() {
      if (!('serial' in navigator)) throw new ProtocolError('当前浏览器不支持 Web Serial');
      this.port = await navigator.serial.requestPort({ filters: [{ usbVendorId: USB_VID, usbProductId: USB_PID }] });
      await this.port.open({ baudRate: 115200, bufferSize: 4096 });
      this.keepReading = true; this._readLoop();
      this.onLog('Web Serial 已打开');
    }
    async disconnect() {
      this.keepReading = false;
      try { if (this.reader) await this.reader.cancel(); } catch (_) {}
      for (const [, pending] of this.pending) pending.reject(new ProtocolError('串口已断开'));
      this.pending.clear();
      try { if (this.port) await this.port.close(); } catch (_) {}
      this.port = null;
    }
    async _readLoop() {
      let unexpected = false;
      try {
        while (this.keepReading && this.port?.readable) {
          this.reader = this.port.readable.getReader();
          try {
            while (this.keepReading) {
              const { value, done } = await this.reader.read();
              if (done) break;
              if (!value?.length) continue;
              for (const frame of this.parser.feed(value)) {
                const pending = this.pending.get(frame.sequence);
                if (pending && frame.command === pending.expectedCommand) {
                  this.pending.delete(frame.sequence); pending.resolve(frame.payload);
                }
              }
            }
          } finally { this.reader.releaseLock(); this.reader = null; }
        }
      } catch (error) {
        unexpected = this.keepReading;
        if (unexpected) this.onLog(`串口读取失败：${error.message || error}`);
      } finally {
        if (unexpected) this.onDisconnect();
      }
    }
    _nextSequence() { this.sequence = (this.sequence + 1) & 0xFFFF; return this.sequence; }
    async _write(bytes) {
      if (!this.port?.writable) throw new ProtocolError('设备未连接');
      const writer = this.port.writable.getWriter();
      try { await writer.write(bytes); } finally { writer.releaseLock(); }
    }
    transact(command, payload = new Uint8Array(), timeoutMs = 1500, retries = 3) {
      const job = this.txTail.then(() => this._transactNow(command, payload, timeoutMs, retries));
      this.txTail = job.catch(() => {});
      return job;
    }
    async _transactNow(command, payload, timeoutMs, retries) {
      const sequence = this._nextSequence();
      const encoded = encodeFrame(command, sequence, payload);
      const expectedCommand = command | RESPONSE_BIT;
      let lastError = null;
      for (let attempt = 0; attempt < retries; attempt += 1) {
        if (!this.connected) throw new ProtocolError('设备未连接');
        try {
          return await new Promise(async (resolve, reject) => {
            const timer = setTimeout(() => {
              this.pending.delete(sequence);
              reject(new ProtocolError(`命令 0x${hex(command)} 响应超时`));
            }, timeoutMs);
            this.pending.set(sequence, {
              expectedCommand,
              resolve: (value) => { clearTimeout(timer); resolve(value); },
              reject: (error) => { clearTimeout(timer); reject(error); },
            });
            try {
              await this._write(encoded);
            } catch (error) {
              clearTimeout(timer);
              this.pending.delete(sequence);
              reject(error);
            }
          });
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new ProtocolError('设备事务失败');
    }
    async getDeviceInfo() { return parseDeviceInfo(await this.transact(CMD.GET_DEVICE_INFO)); }
    async getRtc() { return parseRtc(await this.transact(CMD.RTC_GET)); }
    async setRtc(utcEpoch, timezoneOffsetMinutes, updateTimezone = true) {
      if (timezoneOffsetMinutes < -720 || timezoneOffsetMinutes > 840 || timezoneOffsetMinutes % 15) throw new ProtocolError('时区必须为 UTC-12:00 至 UTC+14:00 的 15 分钟整数倍');
      const p = new Uint8Array(8); const v = new DataView(p.buffer); v.setUint32(0, utcEpoch >>> 0, true); v.setInt16(4, timezoneOffsetMinutes, true); v.setUint8(6, updateTimezone ? 1 : 0);
      return parseRtc(await this.transact(CMD.RTC_SET, p));
    }
    async getHealth() { return parseHealth(await this.transact(CMD.DEVICE_HEALTH_GET)); }
    async getGm() { return parseGm(await this.transact(CMD.GM_STATUS_GET)); }
    async getHv() { return parseHv(await this.transact(CMD.HV_STATUS_GET)); }
    async getResourceInfo() { return parseResourceInfo(await this.transact(CMD.RESOURCE_INFO)); }
    async firmwareStart(session, fileSize, headerCrc) { return parseProgress(await this.transact(CMD.START, payloadThreeU32(session, fileSize, headerCrc), 2000)); }
    async firmwareWrite(session, offset, data) { return parseProgress(await this.transact(CMD.WRITE, payloadChunk(session, offset, data), 2000)); }
    async firmwareFinish(session, fileSize) { return parseProgress(await this.transact(CMD.FINISH, payloadTwoU32(session, fileSize), 2500)); }
    async firmwareAbort(session) { return parseProgress(await this.transact(CMD.ABORT, payloadU32(session))); }
    async reboot() { return parseProgress(await this.transact(CMD.REBOOT, new Uint8Array(), 2000, 1)); }
    async resourceStart(session, fileSize, headerCrc) { return parseResourceProgress(await this.transact(CMD.RESOURCE_START, payloadThreeU32(session, fileSize, headerCrc), 2000)); }
    async resourceWrite(session, offset, data) { return parseResourceProgress(await this.transact(CMD.RESOURCE_WRITE, payloadChunk(session, offset, data), 2000)); }
    async resourceFinish(session, fileSize) { return parseResourceProgress(await this.transact(CMD.RESOURCE_FINISH, payloadTwoU32(session, fileSize), 2500)); }
    async resourceAbort(session) { return parseResourceProgress(await this.transact(CMD.RESOURCE_ABORT, payloadU32(session))); }
  }

  function parseFirmwarePackage(data) {
    if (!(data instanceof Uint8Array) || data.length <= 256) throw new ProtocolError('文件过短，不是完整 .grsfw');
    const v = viewOf(data);
    const info = {
      magic: v.getUint32(0, true), formatVersion: v.getUint16(4, true), headerSize: v.getUint16(6, true), productId: v.getUint32(8, true),
      hwMin: v.getUint16(12, true), hwMax: v.getUint16(14, true), firmwareVersion: v.getUint32(16, true), imageSize: v.getUint32(20, true), imageOffset: v.getUint32(24, true),
      loadAddress: v.getUint32(28, true), entryAddress: v.getUint32(32, true), flags: v.getUint32(44, true), imageCrc: v.getUint32(52, true), headerCrc: v.getUint32(244, true), commit: v.getUint32(252, true),
    };
    if (info.magic !== 0x46535247 || info.formatVersion !== 1 || info.headerSize !== 256) throw new ProtocolError('GRS 固件 Manifest 标识/版本无效');
    if (info.productId !== 0x3130434C) throw new ProtocolError('固件产品 ID 不是 LC01');
    if (info.imageOffset !== 256 || info.imageOffset + info.imageSize !== data.length) throw new ProtocolError('固件镜像偏移或长度不一致');
    if (info.commit !== 0x54494D43) throw new ProtocolError('固件提交标记无效');
    if (crc32(data.slice(0, 244)) !== info.headerCrc) throw new ProtocolError('固件 Manifest CRC 错误');
    if (crc32(data.slice(info.imageOffset)) !== info.imageCrc) throw new ProtocolError('固件镜像 CRC 错误');
    return info;
  }

  async function firmwareSessionId(data) {
    if (!globalThis.crypto?.subtle) throw new ProtocolError('浏览器缺少 Web Crypto，无法生成固件会话 ID');
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
    return new DataView(digest.buffer).getUint32(0, true);
  }

  function parseResourcePackage(data) {
    if (!(data instanceof Uint8Array) || data.length < 128) throw new ProtocolError('资源包长度不足');
    const v = viewOf(data);
    const info = {
      magic: v.getUint32(0, true), formatVersion: v.getUint16(4, true), headerSize: v.getUint16(6, true), productId: v.getUint32(8, true),
      hwMin: v.getUint16(12, true), hwMax: v.getUint16(14, true), resourceVersion: v.getUint32(16, true), payloadOffset: v.getUint32(20, true), payloadSize: v.getUint32(24, true), payloadCrc: v.getUint32(28, true), headerCrc: v.getUint32(56, true), commit: v.getUint32(60, true),
    };
    if (info.magic !== 0x52535247 || info.formatVersion !== 1 || info.headerSize !== 64) throw new ProtocolError('GRSR Manifest 标识/版本无效');
    if (info.productId !== 0x3130434C || info.hwMin > info.hwMax) throw new ProtocolError('资源包产品 ID / 硬件范围无效');
    if (info.commit !== 0x4B4F5352) throw new ProtocolError('资源包提交标记无效');
    if (crc32(data.slice(0, 56)) !== info.headerCrc) throw new ProtocolError('资源包 Manifest CRC 错误');
    if (info.payloadOffset !== 64 || info.payloadOffset + info.payloadSize !== data.length) throw new ProtocolError('资源包载荷偏移或长度不一致');
    if (crc32(data.slice(info.payloadOffset)) !== info.payloadCrc) throw new ProtocolError('资源包载荷 CRC 错误');
    return info;
  }

  function resourceSessionId(data, resourceVersion) { return ((crc32(data) ^ resourceVersion ^ data.length) >>> 0) || 1; }

  window.GRSProtocol = Object.freeze({
    USB_VID, USB_PID, CMD, MAX_CHUNK, ProtocolError, DeviceRejected, SerialClient,
    crc16CcittFalse, crc32, parseFirmwarePackage, parseResourcePackage, firmwareSessionId, resourceSessionId, hex,
  });
})();
