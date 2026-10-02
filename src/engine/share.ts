/**
 * 分享編碼（HANDOFF §7）：base64url(engineVersion + packed(assumptions) + seed)。
 * 1.0 只用於本機存檔與 PNG 角落。版本不符 → 回傳 { version, ok: false } 提示「舊版引擎，無法重現」。
 */
import type { Assumptions } from './types.js';
import { packAssumptions } from './assumptions.js';
import { ENGINE_VERSION } from './simulate.js';

const SCALES = ['raid', 'medium', 'full'] as const;
const US = ['none', 'delayed', 'immediate'] as const;
const JP = ['neutral', 'bases', 'belligerent'] as const;
const RES = [0.3, 0.55, 0.8] as const;
const ECON = ['low', 'high'] as const;
const AXIS = ['north', 'central', 'south', 'east'] as const;
const AUX = ['none', 'penghu', 'eastFeint', 'blockadeFirst'] as const;
const GREY = [undefined, 'low', 'mid', 'high'] as const;

function versionBytes(v: string): Uint8Array {
  // 'v0.1.0' → [0, 1, 0]
  const m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`引擎版本格式錯誤：${v}`);
  return new Uint8Array([Number(m[1]), Number(m[2]), Number(m[3])]);
}

function toBase64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeShare(a: Assumptions, seed: number, engineVersion = ENGINE_VERSION): string {
  const v = versionBytes(engineVersion);
  const p = packAssumptions(a);
  const s = new Uint8Array(4);
  new DataView(s.buffer).setUint32(0, seed >>> 0);
  const all = new Uint8Array(v.length + p.length + s.length);
  all.set(v, 0);
  all.set(p, v.length);
  all.set(s, v.length + p.length);
  return toBase64url(all);
}

export type Decoded =
  | { ok: true; engineVersion: string; assumptions: Assumptions; seed: number }
  | { ok: false; engineVersion: string | null; reason: 'badFormat' | 'oldEngine' };

export function decodeShare(code: string, currentVersion = ENGINE_VERSION): Decoded {
  let bytes: Uint8Array;
  try {
    bytes = fromBase64url(code);
  } catch {
    return { ok: false, engineVersion: null, reason: 'badFormat' };
  }
  if (bytes.length !== 11) return { ok: false, engineVersion: null, reason: 'badFormat' };
  const engineVersion = `v${bytes[0]}.${bytes[1]}.${bytes[2]}`;
  if (engineVersion !== currentVersion) return { ok: false, engineVersion, reason: 'oldEngine' };
  const b0 = bytes[3]!;
  const b1 = bytes[4]!;
  const b2 = bytes[5]!;
  const month = ((b0 & 0x0f) + 1) as Assumptions['month'];
  const scale = SCALES[(b0 >> 4) & 0x03];
  const us = US[(b0 >> 6) & 0x03];
  const japan = JP[b1 & 0x03];
  const twReserve = RES[(b1 >> 2) & 0x03];
  const econTolerance = ECON[(b1 >> 4) & 0x01];
  const mainAxis = AXIS[(b1 >> 5) & 0x03];
  const auxiliary = AUX[b2 & 0x03];
  const greyZone = GREY[(b2 >> 2) & 0x03];
  if (!scale || !us || !japan || twReserve === undefined || !econTolerance || !mainAxis || !auxiliary || month < 1 || month > 12) {
    return { ok: false, engineVersion, reason: 'badFormat' };
  }
  const assumptions: Assumptions = { month, scale, us, japan, twReserve, econTolerance, mainAxis, auxiliary };
  if (greyZone) assumptions.greyZone = greyZone;
  const seed = new DataView(bytes.buffer, bytes.byteOffset + 7, 4).getUint32(0);
  return { ok: true, engineVersion, assumptions, seed };
}
