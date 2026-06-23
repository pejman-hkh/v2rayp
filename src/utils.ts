import { Buffer } from 'buffer';
import { URIType } from './types/URI';


export async function extractGroupUrls(url: string) {
    const response = await fetch(url);
    let text = await response.text();

    // If the fetched text is base64-encoded, decode it.
    const candidate = text.trim();

    function isBase64(s: string) {
        const stripped = s.replace(/\s+/g, '');
        if (!stripped || (stripped.length % 4) !== 0) return false;
        return /^[A-Za-z0-9+/=]+$/.test(stripped);
    }

    if (isBase64(candidate)) {
        try {
            const decoded = Buffer.from(candidate.replace(/\s+/g, ''), 'base64').toString();
            // simple heuristic: if decoding yields something non-empty, use it
            if (decoded) text = decoded;
        } catch (e) {
            // if decode fails, keep original text
        }
    }

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    console.log('lines', lines);

    const urlsWithNames: { url: string, name: string }[] = [];

    for (const line of lines) {
        const sp = line.split('#');
        if (sp[0]) {
            urlsWithNames.push({ url: sp[0], name: sp[1] || '' });
        }
    }

    return urlsWithNames;
}

export function makeConfigFile(outbounds: Array<any>, outboundTag: string, port = 1085, type = "socks") {
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
            streamSettings: (() => {
                // Determine network type, but avoid emitting 'reality' without proper settings.
                let net = (u.searchParams.get('type') !== 'grpc' && u.searchParams.get('type') !== 'httpupgrade' && u.searchParams.get('type') !== 'xhttp' && u.searchParams.get('type') !== 'raw') ? u.searchParams.get('type') : 'tcp';
                // security may request 'reality' even when network != 'reality'
                let security = u.searchParams.get('security') || 'none';
                // If network is 'reality' but no reality-related parameters are provided, fallback to 'tcp'
                const realityParams = ['fp', 'publicKey', 'pbk', 'publickey', 'shortId', 'shortid', 'sid', 'serverName', 'sni'];
                if (net === 'reality') {
                    const hasRealityParam = realityParams.some(p => !!u.searchParams.get(p));
                    if (!hasRealityParam) {
                        console.warn('parseV2rayURI: skipping empty realitySettings, falling back to tcp');
                        net = 'tcp';
                    }
                }

                const tlsSettings = (() => {
                    const serverName = u.searchParams.get('sni') || u.searchParams.get('host') || host;
                    const insecure = u.searchParams.get('insecure');
                    if (insecure === '1' || insecure === 'true') {
                        return {
                            serverName,
                            pinnedPeerCertSha256: [] as string[],
                        };
                    }
                    return {
                        serverName,
                    };
                })();

                const wsSettings = u.searchParams.get('type') === 'ws' ? {
                    path: u.searchParams.get('path') || '/',
                    headers: {
                        Host: u.searchParams.get('host') || ''
                    }
                } : undefined;

                // Helper to build realitySettings from params
                const buildRealitySettings = () => {
                    const publicKey = u.searchParams.get('publicKey') || u.searchParams.get('pbk') || u.searchParams.get('publickey');
                    const fp = u.searchParams.get('fp') || u.searchParams.get('fingerprint');
                    const shortIdRaw = u.searchParams.get('shortId') || u.searchParams.get('shortid') || u.searchParams.get('sid');
                    const shortIds = shortIdRaw ? shortIdRaw.split(',').map(s => s.trim()).filter(Boolean) : undefined;
                    const serverNames = (u.searchParams.get('sni') || u.searchParams.get('host')) ? [(u.searchParams.get('sni') || u.searchParams.get('host') || host)] : undefined;

                    const realitySettings: any = {};
                    if (publicKey) realitySettings.publicKey = publicKey;
                    if (shortIds && shortIds.length > 0) realitySettings.shortId = shortIds[0];
                    if (fp) realitySettings.fingerprint = fp;
                    if (serverNames && serverNames.length > 0) realitySettings.serverName = serverNames[0];

                    return realitySettings;
                };

                // If network is reality, build realitySettings from available params
                if (net === 'reality') {
                    const realitySettings = buildRealitySettings();
                    // If realitySettings ended up empty, fallback to tcp to avoid empty object.
                    if (Object.keys(realitySettings).length === 0) {
                        console.warn('parseV2rayURI: detected reality network but no usable params, falling back to tcp');
                        net = 'tcp';
                    } else {
                        return {
                            network: 'reality',
                            security: security,
                            tlsSettings: tlsSettings,
                            wsSettings: wsSettings,
                            realitySettings,
                        };
                    }
                }

                // If security explicitly requests reality (but network isn't 'reality'), try to build realitySettings
                if (security === 'reality') {
                    const realitySettings = buildRealitySettings();
                    if (Object.keys(realitySettings).length === 0) {
                        console.warn('parseV2rayURI: security=reality but no reality params; falling back to tls');
                        security = 'tls';
                    } else {
                        return {
                            network: net,
                            security: 'reality',
                            tlsSettings: tlsSettings,
                            wsSettings: wsSettings,
                            realitySettings,
                        };
                    }
                }

                return {
                    network: net,
                    security: security,
                    tlsSettings: tlsSettings,
                    wsSettings: wsSettings,
                };
            })(),
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
