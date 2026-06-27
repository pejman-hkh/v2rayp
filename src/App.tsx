import { BaseDirectory, writeTextFile } from "@tauri-apps/plugin-fs";
import { ReactNode, useContext, useEffect, useRef, useState } from "react";
import "./App.css";
import { Profile } from "./components/Profile";
import { Card } from "./components/ui/Card";
import { measure_delay, set_system_proxy, start_test_v2ray, start_v2ray, stop_test_v2ray, stop_v2ray } from "./invokes";
import { ProfileType } from "./types/Profile";
import { URIType } from "./types/URI";
import { makeConfigFile, parseV2rayURI } from "./utils";
import { GlobalContext } from "./context/Global";
import { Modal } from "./components/ui/Modal";
import { QRCodeSVG } from "qrcode.react";
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { AddConfig } from "./components/AddConfig";
import { Button } from "./components/ui/Button";

type DebouncedFunction = (...args: any[]) => void;

const debounce = (func: DebouncedFunction, delay: number) => {
  let timeout: number;

  return (...args: any[]) => {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
    }, delay);
  };
};


function App() {
  const context = useContext(GlobalContext);
  const db = context?.db;

  const [status, setStatus] = useState("stopped");
  const [uris, setUris] = useState<Array<URIType>>([]);
  const [filteredUri, setFilteredUri] = useState<Array<URIType>>([]);
  const [profiles, setProfiles] = useState<ProfileType[]>([]);
  const [profile, setProfile] = useState<ProfileType | undefined>(undefined);
  const [testAllCount, setTestAllCount] = useState({ failed: 0, success: 0 });
  const stopTesting = useRef<boolean>(false);
  const [isRunningTests, setIsRunningTests] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [activeView, setActiveView] = useState<"dashboard" | "profiles">("dashboard");
  const updateProfiles = async () => {
    const profiles = await db?.select<ProfileType[]>("select * from profiles", []);
    setProfiles(profiles as React.SetStateAction<ProfileType[]>);
  }

  useEffect(() => {
    updateProfiles();
  }, []);

  const updateUris = async (profile_id: number) => {
    const uris = await db?.select<React.SetStateAction<URIType[]>>("select * from urls where profile_id = ? order by CASE WHEN delay IS NULL OR delay = 0 OR delay = -1 THEN 1 ELSE 0 END,delay asc", [profile_id]);
    if (uris) {
      setUris(uris);
      setFilteredUri(uris);
    }
  }

  const makeConfigs = async (file: string, outbound = 'proxy-1', port = 1085, type = 'socks') => {
    const outbounds: Array<any> = [];
    uris?.map((uri: URIType) => {
      const parse = parseV2rayURI(uri);
      if (parse) {
        outbounds.push(parse);
      }
    });

    const configs = makeConfigFile(outbounds, outbound, port, type);
    await writeTextFile(file, JSON.stringify(configs, null, 2), {
      baseDir: BaseDirectory.AppConfig,
    });
  }


  const profileChangeHandler = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const profile_id = parseInt(e?.target?.value);
    updateUris(profile_id);
    const profile = (await db?.select<ProfileType[]>("select * from profiles where id = ?", [profile_id]))?.[0];
    console.log(profile);
    setProfile(profile);
  }

  const startV2Ray = async () => {
    await stop_v2ray();

    const first = uris?.[0]?.id
    await makeConfigs('v2ray_config.json', 'proxy-' + first);
    const res = await start_v2ray("v2ray_config.json");
    setStatus(res as string);
  }

  const stopV2Ray = async () => {
    const res = await stop_v2ray();
    setStatus(res as string);
  };

  const sortByDelay = (a: URIType, b: URIType) => {
    const da = a.delay ?? Infinity;
    const db = b.delay ?? Infinity;

    const isSpecial = (val: number) => val === 0 || val === -1;

    const aSpecial = isSpecial(da);
    const bSpecial = isSpecial(db);

    if (aSpecial && !bSpecial) return 1;
    if (!aSpecial && bSpecial) return -1;

    return da - db;
  };

  const updateDelay = async (uri: URIType, sort = false) => {
    await connectTest(uri);

    let delay = 0;
    try {
      delay = await measure_delay();
    } catch (_: unknown) {
      delay = 0
    }
    console.log('delay', delay);
    await db?.execute("update urls set delay = ? where id = ?", [delay, uri?.id]);

    if (sort) {
      setUris(prev => prev.map(item =>
        item.id === uri.id ? { ...item, delay } : item
      ).sort(sortByDelay));

      setFilteredUri(prev => prev.map(item =>
        item.id === uri.id ? { ...item, delay } : item
      ).sort(sortByDelay));
    }

    return delay
  }

  const stopTestAll = () => {
    setTestAllCount({ success: 0, failed: 0 });
    stopTesting.current = true;
    setIsRunningTests(false);
  };

  const startTestAll = async (uris: Array<URIType>) => {
    if (isRunningTests) {
      return;
    }
    stopTesting.current = false;
    for (const uri of uris) {
      if (stopTesting.current) {
        break;
      }
      const delay = await updateDelay(uri, true);

      setTestAllCount((prev) => {
        let ret = prev;
        if (delay === -1) {
          ret.failed = prev.failed + 1;
        } else {
          ret.success = prev.success + 1;
        }
        return ret;
      });
    }
  }

  const testAllHandler = async () => {
    setTestAllCount({ success: 0, failed: 0 });
    setIsRunningTests(true);
    await startTestAll(uris);
    setIsRunningTests(false);
  };

  const testFailedHandler = async () => {
    setIsRunningTests(true);
    await startTestAll(uris.filter((uri: URIType) => uri.delay === -1 || uri.delay === 0 || uri.delay === null));
    setIsRunningTests(false);
  }

  const DelayButton = ({ children, uri }: { children: ReactNode, uri: URIType }) => {
    const [testing, setTesting] = useState(false);
    const [delay, setDelay] = useState(-2);
    const testHandler = async () => {
      setTesting(true);
      let delay = 0;
      try {
        delay = await updateDelay(uri);
      } catch (_) {
        delay = 0;
      }
      setTesting(false);
      setDelay(delay);
    }

    return <div className="flex items-center gap-3">
      <div className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-sm font-medium text-slate-200">
        {delay !== -2 ? delay : uri?.delay} ms
      </div>
      <div>
        <Button variant="primary" className="px-3 py-2" onClick={testHandler}>{testing ? 'Testing...' : children}</Button>
      </div>
    </div>
  }

  const connectTest = async (uri: URIType) => {
    await makeConfigs('v2ray_config_test.json', 'proxy-' + uri.id, 1081, 'http');
    await stop_test_v2ray();
    await new Promise(r => setTimeout(r, 150));
    await start_test_v2ray("v2ray_config_test.json");
    await new Promise(r => setTimeout(r, 150));
  }

  const connect = async (uri: URIType) => {
    await makeConfigs('v2ray_config.json', 'proxy-' + uri.id);
    await stop_v2ray();
    await new Promise(r => setTimeout(r, 150));
    const res = await start_v2ray("v2ray_config.json");
    setStatus(res as string);
    await new Promise(r => setTimeout(r, 150));
  }

  const ConnectButton = ({ children, uri }: { children: ReactNode, uri: any }) => {
    const clickHandler = async () => {
      await connect(uri);
      connectedProfile.current.uri = uri;
      set_system_proxy('127.0.0.1', 1085);
      showDialog('Connect', 'Connected succussfully');
    }

    return <Button variant="ghost" className="px-3 py-2" onClick={clickHandler}>{children}</Button>
  }

  const copytoSelectRef = useRef<HTMLSelectElement>(null);
  const alertModalRef = useRef<HTMLDialogElement>(null);

  const [update, setUpdate] = useState(false);
  const alertData = useRef<{ title: string, content: string | ReactNode }>({ title: 'Error', content: 'Content' });
  const showDialog = (title: string, content: string | ReactNode) => {
    alertData.current = { title, content };
    alertModalRef.current?.showModal();
    setUpdate(!update);
  }

  const connectedProfile = useRef<{ uri: URIType | null }>({ uri: null });

  const isDark = theme === "dark";
  const shellClass = isDark
    ? "min-h-screen bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.16),_transparent_28%),linear-gradient(135deg,_#020617_0%,_#0f172a_100%)] p-4 text-slate-100 sm:p-6 lg:p-8"
    : "min-h-screen bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_28%),linear-gradient(135deg,_#f8fafc_0%,_#e2e8f0_100%)] p-4 text-slate-800 sm:p-6 lg:p-8";
  const mutedText = isDark ? "text-slate-400" : "text-slate-500";
  const inputClass = isDark
    ? "border-slate-700 bg-slate-900/90 text-slate-100 placeholder:text-slate-500 focus:border-sky-400"
    : "border-slate-300 bg-white text-slate-800 placeholder:text-slate-400 focus:border-sky-500";
  const tableHeaderClass = isDark ? "bg-slate-900/90 text-slate-400" : "bg-slate-100 text-slate-600";
  const sidebarButtonClass = isDark ? "bg-slate-800/85 text-slate-100 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200";

  return (
    <div className={`${shellClass} ${isDark ? "dark" : ""}`}>
      <Modal
        title={alertData?.current?.title}
        content={alertData?.current?.content}
        fref={alertModalRef}
      />

      <div className="mx-auto flex max-w-7xl flex-col gap-6 lg:grid lg:grid-cols-[280px_1fr]">
        <div className="space-y-6">
          <Card isDark={isDark}>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.35em] text-sky-400">V2Rayp</p>
                <h1 className={`mt-2 text-2xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>Proxy Control Center</h1>
              </div>
              <button
                type="button"
                className={`rounded-full p-2 transition ${isDark ? "bg-slate-800 text-slate-100 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {isDark ? "☀️" : "🌙"}
              </button>
            </div>

            <div className="space-y-2">
              <button className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${activeView === "dashboard" ? "bg-sky-500/15 text-sky-500" : sidebarButtonClass}`} onClick={() => setActiveView("dashboard")}>
                <span>◉</span>
                <span>Dashboard</span>
              </button>
              <button className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${activeView === "profiles" ? "bg-sky-500/15 text-sky-500" : sidebarButtonClass}`} onClick={() => setActiveView("profiles")}>
                <span>◌</span>
                <span>Profiles</span>
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <Button variant="success" className="w-full" onClick={startV2Ray}>▶ Start Proxy</Button>
              <Button variant="danger" className="w-full" onClick={stopV2Ray}>■ Stop Proxy</Button>
              <Button variant="primary" className="w-full" onClick={isRunningTests ? stopTestAll : testAllHandler}>
                {!isRunningTests ? '↺ Test All' : '■ Stop Test All'}
              </Button>
              <Button variant="ghost" className="w-full" onClick={isRunningTests ? stopTestAll : testFailedHandler}>
                {!isRunningTests ? '⚠ Test Failed' : '■ Stop Test All'}
              </Button>
            </div>

            <div className={`mt-6 rounded-2xl border p-4 text-sm ${isDark ? "border-slate-800 bg-slate-950/60 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              <div className={`font-medium ${isDark ? "text-slate-200" : "text-slate-800"}`}>Status: {status}</div>
              {status === 'started' && (
                <div className="mt-3 space-y-1">
                  <div>Socks Proxy : socks5://127.0.0.1:1085</div>
                  <div>Test Proxy : http://127.0.0.1:1081</div>
                </div>
              )}
            </div>
          </Card>

          {activeView === "profiles" && (
            <Profile
              setUris={setUris}
              updateProfiles={updateProfiles}
              showDialog={showDialog}
              isDark={isDark}
            />
          )}
        </div>

        <Card isDark={isDark}>
          <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className={`text-xl font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>Profiles & Configs</h2>
              <p className={`mt-1 text-sm ${mutedText}`}>Manage your proxy profiles and test latency in one place.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" onClick={() => updateUris(profile?.id || 0)}>Sort</Button>
              <div className={`rounded-2xl border px-3 py-2 text-sm ${isDark ? "border-slate-800 bg-slate-950/70 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                {testAllCount.success} passed • {testAllCount.failed} failed
              </div>
            </div>
          </div>

          <label className={`mb-4 block text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>
            <span className="mb-2 block">Select profile</span>
            <select className={`w-full rounded-2xl border px-4 py-3 outline-none ring-0 appearance-none pr-10 ${inputClass}`} onChange={profileChangeHandler}>
              <option value="">Select profile</option>
              {profiles?.map((profile: ProfileType) => <option key={profile?.id} value={profile?.id}>{profile?.name}</option>)}
            </select>
          </label>

          <input
            placeholder="Search configs..."
            type="text"
            className={`mb-4 w-full rounded-2xl border px-4 py-3 outline-none focus:border-sky-400 ${inputClass}`}
            onChange={debounce((e: React.ChangeEvent<HTMLInputElement>) => {
              const filter = uris.filter((item: URIType) => item?.uri.includes(e?.target?.value) || item?.name.includes(e?.target?.value));
              setFilteredUri(filter);
            }, 500)}
          />

          <div className="mb-6 flex flex-wrap items-center gap-3">
            <Button variant="primary" onClick={() => {
              const trs = document.querySelectorAll("tr");
              trs.forEach((tr) => {
                const delay = parseInt(tr.querySelector(".delay")?.innerHTML.replace("ms", "")!);
                if (delay && delay !== -1) {
                  const checkBox = tr.querySelector("input[type='checkbox']") as HTMLInputElement;
                  if (checkBox) {
                    checkBox.checked = !checkBox.checked;
                  }
                }
              });
            }}>Select Success Config</Button>

            <Button variant="primary" onClick={async () => {
              const checkboxs = document.querySelectorAll("[name='select[]']:checked");
              if (checkboxs.length == 0) {
                showDialog('Error', 'Please select an item');
                return;
              }

              checkboxs.forEach(async (el) => {
                const checkbox = el as HTMLInputElement;
                const id = checkbox.value;

                const item = (await db?.select<URIType[]>("select * from urls where id = ?", [id]))?.[0];
                const check = (await db?.select<URIType[]>("select * from urls where profile_id = ? and uri = ? ", [copytoSelectRef?.current?.value, item?.uri]))?.[0];
                if (!check?.id) {
                  await db?.execute("insert into urls(profile_id, name, uri) values(?, ?, ?)", [copytoSelectRef?.current?.value, item?.name, item?.uri]);
                }
              });

              showDialog('Success', 'Configs copied succussfully');
            }}>
              Copy Selected
            </Button>

            <select className={`rounded-2xl border px-3 py-2 pr-10 text-sm appearance-none bg-[url('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"%3E%3Cpolyline points="6 9 12 15 18 9"/%3E%3C/svg%3E')] bg-[length:0.9rem_0.9rem] bg-[position:right_0.7rem_center] bg-no-repeat ${inputClass}`} ref={copytoSelectRef}>
              <option value="">Select target profile</option>
              {profiles?.map((profile: ProfileType) => <option key={profile?.id} value={profile?.id}>{profile?.name}</option>)}
            </select>

            <Button variant="danger" onClick={async () => {
              const checkboxs = document.querySelectorAll("[name='select[]']:checked");
              if (checkboxs.length == 0) {
                showDialog('Error', 'Please select an item');
                return;
              }

              checkboxs.forEach(async (el) => {
                const checkbox = el as HTMLInputElement;
                const id = checkbox.value;
                await db?.execute("delete from urls where id = ?", [id]);
              });

              showDialog('Success', 'Selected configs deleted succussfully');
              setTimeout(() => {
                updateUris(profile?.id || 0);
              }, 100);
            }}>
              Delete Selected
            </Button>
          </div>

          {profile?.id && (
            <div className="mb-6">
              <AddConfig
                profile={profile}
                showDialog={showDialog}
                updateUris={updateUris}
              />
            </div>
          )}

          <div className={`overflow-hidden rounded-[1.5rem] border ${isDark ? "border-slate-800 bg-slate-950/70" : "border-slate-200 bg-white/80"}`}>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-sm">
                <thead className={tableHeaderClass}>
                  <tr>
                    <th className="px-4 py-3">Select</th>
                    <th className="px-4 py-3">Row</th>
                    <th className="px-4 py-3">Test</th>
                    <th className="px-4 py-3">Connect</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">URI</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-slate-800/80 bg-slate-950/60 text-slate-300" : "divide-slate-200 bg-white text-slate-700"}`}>
                  {filteredUri?.map((uri: URIType, row) => (
                    <tr key={uri?.id} className={connectedProfile.current?.uri?.id && connectedProfile.current.uri.id === uri.id ? "bg-emerald-500/10" : ""}>
                      <td className="px-4 py-3">
                        <input className="h-4 w-4 rounded border-slate-700 bg-slate-900" type="checkbox" name="select[]" value={uri?.id} />
                      </td>
                      <td className="px-4 py-3">{row + 1} • {uri?.id}</td>
                      <td className="px-4 py-3">
                        <DelayButton uri={uri}>Test</DelayButton>
                      </td>
                      <td className="px-4 py-3">
                        <ConnectButton uri={uri}>{connectedProfile.current?.uri?.id && connectedProfile.current.uri.id === uri.id ? 'Connected' : 'Connect'}</ConnectButton>
                      </td>
                      <td className={`px-4 py-3 font-medium ${isDark ? "text-slate-100" : "text-slate-800"}`}>{decodeURIComponent(uri?.name)}</td>
                      <td className="max-w-[18rem] px-4 py-3">
                        <div className={`truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>{uri?.uri}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button variant="primary" className="px-3 py-2" onClick={() => {
                            showDialog('QRCode', <div className="flex justify-center"><QRCodeSVG value={uri?.uri} level="H" /></div>);
                          }}>QRCode</Button>
                          <CopyToClipboard text={uri?.uri} onCopy={() => {
                            showDialog('Copy to Clipboard', 'Copied succussfully');
                          }}>
                            <Button variant="ghost" className="px-3 py-2">Copy</Button>
                          </CopyToClipboard>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default App;
