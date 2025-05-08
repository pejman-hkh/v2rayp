import { invoke } from "@tauri-apps/api/core";

export const measure_delay = async (): Promise<number> => {
  return await invoke('measure_delay');
}

export async function set_system_proxy(host: string, port: number) {

  try {
    await invoke('set_system_proxy', { host, port });
  } catch (err) {
    console.error('Failed to set proxy:', err);
  }

}

export async function start_v2ray(configPath: string) {
  try {
    const result = await invoke('start_v2ray', { configPath });
    console.log('V2Ray start result:', result);
    return result;
  } catch (err) {
    console.error('Failed to start V2Ray:', err);
  }
}

export async function stop_v2ray() {
  try {
    const result = await invoke('stop_v2ray');
    console.log('V2Ray stop result:', result);
    return result;
  } catch (err) {
    console.error('Failed to stop V2Ray:', err);
  }
}

export async function start_test_v2ray(configPath: string) {
  try {
    const result = await invoke('start_test_v2ray', { configPath });
    console.log('V2Ray start result:', result);
    return result;
  } catch (err) {
    console.error('Failed to start V2Ray:', err);
  }
}

export async function stop_test_v2ray() {
  try {
    const result = await invoke('stop_test_v2ray');
    console.log('V2Ray stop result:', result);
    return result;
  } catch (err) {
    console.error('Failed to stop V2Ray:', err);
  }
}
