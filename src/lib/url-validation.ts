import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { AppError, withAbort } from './errors.js';

export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
export const resolveAddresses: Resolver = hostname => lookup(hostname, { all: true, verbatim: true });

const blocked = new BlockList();
for (const [ip, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(ip, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
for (const [ip, prefix] of [['2001::', 23], ['2001:db8::', 32], ['2002::', 16], ['3fff::', 20]] as const) blocked.addSubnet(ip, prefix, 'ipv6');

export function isPublicIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !blocked.check(address, 'ipv4');
  if (version === 6) return globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
  return false;
}

export function normalizeUrl(raw: string): URL {
  let url: URL;
  try {
    if (raw.length > 8192 || /[\x00-\x20\x7f\\]/.test(raw) || !/^https?:\/\//i.test(raw)) throw new Error();
    url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) throw new Error();
  } catch { throw new AppError('UNSAFE_URL', 'URL 必须是无用户名/密码的有效 HTTP/HTTPS 网页地址。'); }
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  if (host === 'localhost' || !host.includes('.') && !isIP(host) || /\.(localhost|local|internal|lan|home|test|invalid|onion)$/.test(host) || host.endsWith('.home.arpa') || host === 'metadata.google.internal') {
    throw new AppError('UNSAFE_URL', '拒绝本地、内部或保留主机地址。');
  }
  if (isIP(host) && !isPublicIp(host)) throw new AppError('UNSAFE_URL', '拒绝私网、环回、链路本地或保留 IP 地址。');
  url.hash = '';
  return url;
}

export async function validatePublicUrl(raw: string, resolver: Resolver = resolveAddresses, signal?: AbortSignal): Promise<string> {
  const url = normalizeUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!isIP(host)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new AppError('TIMEOUT', 'URL DNS 校验超时。')), 5000);
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    try {
      const addresses = await withAbort(resolver(host), combined);
      if (!addresses.length) throw new AppError('DNS_FAILED', '目标域名没有可用地址。');
      if (addresses.some(({ address }) => !isPublicIp(address))) throw new AppError('UNSAFE_URL', '目标域名解析到内部或保留 IP 地址。');
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('DNS_FAILED', '无法解析目标网页域名。');
    } finally { clearTimeout(timer); }
  }
  return url.href;
}
