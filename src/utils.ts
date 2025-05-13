import { Buffer } from 'buffer';
import { URIType } from './types/URI';


export async function extractGroupUrls(url: string) {
    const response = await fetch(url);
    const text = await response.text();

    const lines = text.split('\n');
    const urlsWithNames: { url: string, name: string }[] = [];

    for (const line of lines) {
        const sp = line.split('#');
        if (sp[0]) {
            urlsWithNames.push({ url: sp[0], name: sp[1] });
        }
    }

    console.log('test', urlsWithNames);

    return urlsWithNames;
}

export function makeConfigFile(outbounds: Array<any>, outboundTag: string, port = 1080, type = "socks") {
    return {
        inbounds: [{
            tag: type + "-proxy1",
            port: port,
            listen: '127.0.0.1',
            protocol: type,
            settings: type === 'socks' ? {
                auth: 'noauth',
                udp: true,
            } : undefined,
        }],
        outbounds: outbounds,
        routing: {
            rules: [
                {
                    type: "field",
                    inboundTag: [type + "-proxy1"],
                    outboundTag: outboundTag
                }
            ]
        }
    }
}

export function parseV2rayURI(uri: URIType) {
    const url = uri.uri;
    if (url.startsWith('vmess://')) {
        const json = JSON.parse(Buffer.from(url.replace('vmess://', ''), 'base64').toString());
        return {
            tag: 'proxy-' + uri?.id,
            protocol: 'vmess',
            settings: {
                vnext: [{
                    address: json.add,
                    port: parseInt(json.port),
                    users: [{
                        id: json.id,
                        alterId: parseInt(json.aid || 0),
                        security: json.scy || 'auto',
                    }],
                }],
            },
            streamSettings: {
                network: json.net,
                security: json.tls === 'tls' ? 'tls' : 'none',
                wsSettings: json.net === 'ws' ? {
                    path: json.path || '/',
                    headers: {
                        Host: json.host || ''
                    }
                } : undefined,
            },
        };
    }

    if (url.startsWith('vless://')) {
        const u = new URL(url);
        const [host, port] = u.host.split(':');
        return {
            tag: 'proxy-' + uri?.id,
            protocol: 'vless',
            settings: {
                vnext: [{
                    address: host,
                    port: parseInt(port),
                    users: [{
                        id: u.username,
                        encryption: 'none',
                    }],
                }],
            },
            streamSettings: {
                network: (u.searchParams.get('type') !== 'grpc' && u.searchParams.get('type') !== 'httpupgrade' && u.searchParams.get('type') !== 'xhttp' && u.searchParams.get('type') !== 'raw') ? u.searchParams.get('type') : 'tcp',
                security: u.searchParams.get('security') || 'none',
                tlsSettings: {
                    serverName: u.searchParams.get('sni') || u.searchParams.get('host') || host,
                    allowInsecure: true,
                },
                wsSettings: u.searchParams.get('type') === 'ws' ? {
                    path: u.searchParams.get('path') || '/',
                    headers: {
                        Host: u.searchParams.get('host') || ''
                    }
                } : undefined,
            },
        };
    }

    if (url.startsWith('trojan://')) {
        const u = new URL(url);
        const [host, port] = u.host.split(':');
        return {
            tag: 'proxy-' + uri?.id,
            protocol: 'trojan',
            settings: {
                servers: [{
                    address: host,
                    port: parseInt(port),
                    password: u.username,
                }],
            },
            streamSettings: {
                network: 'tcp',
                security: 'tls',
            },
        };
    }

    if (url.startsWith('ss://')) {
        return '';
    }

    console.log('Unsupported URI scheme: ' + url);
    return '';
}
