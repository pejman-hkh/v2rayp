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

  const makeConfigs = async (file: string, outbound = 'proxy-1', port = 1080, type = 'socks') => {
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

    return <div className="flex gap-4 items-center">
      <div className="btn delay">
        {delay !== -2 ? delay : uri?.delay} ms
      </div>
      <div>
        <button className=" btn px-4 py-2 mr-2" onClick={testHandler}>{testing ? 'Tesing...' : children}</button>
      </div>
    </div>
  }

  const connectTest = async (uri: URIType) => {
    await makeConfigs('v2ray_config_test.json', 'proxy-' + uri.id, 1081, 'http');
    await stop_test_v2ray();
    await new Promise(r => setTimeout(r, 50));
    await start_test_v2ray("v2ray_config_test.json");
    await new Promise(r => setTimeout(r, 50));
  }

  const connect = async (uri: URIType) => {
    await makeConfigs('v2ray_config.json', 'proxy-' + uri.id);
    await stop_v2ray();
    await new Promise(r => setTimeout(r, 50));
    const res = await start_v2ray("v2ray_config.json");
    setStatus(res as string);
    await new Promise(r => setTimeout(r, 50));
  }

  const ConnectButton = ({ children, uri }: { children: ReactNode, uri: any }) => {
    const clickHandler = async () => {
      await connect(uri);
      connectedProfile.current.uri = uri;
      set_system_proxy('127.0.0.1', 1080);
      showDialog('Connect', 'Connected succussfully');
    }

    return <button className="btn px-4 py-2 mr-2" onClick={clickHandler}>{children}</button>
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

  return (
    <div className="p-4">
      <Modal
        title={alertData?.current?.title}
        content={alertData?.current?.content}
        fref={alertModalRef}
      />

      <Profile
        setUris={setUris}
        updateProfiles={updateProfiles}
        showDialog={showDialog}
      />
      <Card>
        <h1 className="text-2xl font-bold mb-4">V2Ray Start</h1>

        <div className="flex items-center flex-wrap">
          <button className="btn btn-success px-4 py-2 ms-2 my-2" onClick={startV2Ray}>
            Start
          </button>
          <button className="btn btn-error px-4 py-2 ms-2" onClick={stopV2Ray}>
            Stop
          </button>
          <button className="btn px-4 py-2 ms-2" onClick={isRunningTests ? stopTestAll : testAllHandler}>
            {!isRunningTests ? 'Test All' : 'Stop Test All'} {isRunningTests && ` / success: ${testAllCount?.success} - failed: ${testAllCount?.failed}`}
          </button>
          <button className="btn px-4 py-2 ms-2" onClick={isRunningTests ? stopTestAll : testFailedHandler}>
            {!isRunningTests ? 'Test Failed' : 'Stop Test All'}
          </button>

          <button className="btn px-4 py-2 ms-2" onClick={() => updateUris(profile?.id || 0)}>
            Sort
          </button>
        </div>

        <div className="my-4">Status: {status}
          {status === 'started' && <>
            <div>
              Socks Proxy : socks5://127.0.0.1:1080
            </div>
            <div>
              Test Proxy : http://127.0.0.1:1081
            </div>
          </>}
        </div>


        <select className="select w-full mb-4" onChange={profileChangeHandler}>
          <option>Select profile</option>
          {profiles?.map((profile: ProfileType) => <option key={profile?.id} value={profile?.id}>{profile?.name}</option>)}
        </select>


        <input
          placeholder="Search ..."
          type="text"
          className="input p-2 w-full mb-4"
          onChange={debounce((e: React.ChangeEvent<HTMLInputElement>) => {
            const filter = uris.filter((item: URIType) => item?.uri.includes(e?.target?.value) || item?.name.includes(e?.target?.value));
            setFilteredUri(filter);
          }, 500)}
        />

        <div className="my-2 flex gap-2 items-center flex-wrap">
          <button className="btn" onClick={() => {
            const trs = document.querySelectorAll("tr");
            trs.forEach((tr) => {
              console.log(tr);
              const delay = parseInt(tr.querySelector(".delay")?.innerHTML.replace("ms", "")!);
              if (delay && delay !== -1) {
                const checkBox = tr.querySelector("input[type='checkbox']") as HTMLInputElement
                if (checkBox) {
                  checkBox.checked = checkBox.checked ? false : true;
                }

              }
            });
          }}>Select Success Config</button>

          <button className="btn px-4 py-3" onClick={async () => {
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
          </button>
          to
          <select className="select p-2" ref={copytoSelectRef}>
            <option>Select</option>
            {profiles?.map((profile: ProfileType) => <option key={profile?.id} value={profile?.id}>{profile?.name}</option>)}
          </select>


          <button className="btn btn-error px-4 py-3" onClick={async () => {
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
          </button>

        </div>

        {profile?.id &&
          <>
            <AddConfig
              profile={profile}
              showDialog={showDialog}
              updateUris={updateUris}
            />
          </>
        }

        <div className="overflow-x-auto rounded-box border border-base-content/5 bg-base-100">
          <table className="w-full table table-zebra">
            <thead className="hidden md:table-header-group">
              <tr>
                <th>-</th>
                <th>Row</th>
                <th>Test</th>
                <th>Connect</th>
                <th>Name</th>
                <th>URI</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUri?.map((uri: URIType, row) => (
                <tr key={uri?.id} className={"block md:table-row mb-4 md:mb-0 p-2 md:p-0 rounded md:rounded-none " +
                  (connectedProfile.current?.uri?.id && connectedProfile.current.uri.id === uri.id ? '!bg-green-100' : '')}>
                  <td className="block md:table-cell">
                    <input className="checkbox" type="checkbox" name="select[]" value={uri?.id} />
                  </td>
                  <td>{row + 1} - {uri?.id}</td>

                  <td className="block md:table-cell">
                    <DelayButton uri={uri}>Test</DelayButton>
                  </td>
                  <td>
                    <ConnectButton uri={uri}>{connectedProfile.current?.uri?.id && connectedProfile.current.uri.id === uri.id ? 'Connected' : 'Connect'}</ConnectButton>
                  </td>
                  <td className="block md:table-cell">{decodeURIComponent(uri?.name)}</td>
                  <td className="block md:table-cell">
                    <div className="max-w-[16rem] whitespace-nowrap overflow-hidden text-ellipsis">
                      {uri?.uri}
                    </div>
                  </td>
                  <td className="block md:table-cell">
                    <button className="btn me-2" onClick={() => {
                      showDialog('QRCode', <div className="flex justify-center"><QRCodeSVG value={uri?.uri} level="H" /></div>);
                    }}>QRCode</button>
                    <CopyToClipboard text={uri?.uri} onCopy={() => {
                      showDialog('Copy to Clipboard', 'Copied succussfully')
                    }}>
                      <button className="btn me-2">Copy</button>
                    </CopyToClipboard>

                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default App;
