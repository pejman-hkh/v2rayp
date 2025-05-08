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

function App() {
  const context = useContext(GlobalContext);
  const db = context?.db;

  const [status, setStatus] = useState("stopped");
  const [uris, setUris] = useState<Array<URIType>>([]);
  const [filteredUri, setFilteredUri] = useState<Array<URIType>>([]);
  const [profiles, setProfiles] = useState<ProfileType[]>([]);
  const [profile, setProfile] = useState(0);
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
    const uris = await db?.select<React.SetStateAction<URIType[]>>("select * from urls where profile_id = $1 order by CASE WHEN delay IS NULL OR delay = 0 OR delay = -1 THEN 1 ELSE 0 END,delay asc", [profile_id]);
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
    setProfile(profile_id);
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
    stopTesting.current = true;
    setIsRunningTests(false);
  };

  const startTestAll = async (uris: Array<URIType>) => {
    if (isRunningTests) {
      return;
    }
    stopTesting.current = false;
    const concurrency = 1;
    const queue = [...uris];
    const results: Promise<void>[] = [];

    const runner = async () => {
      while (queue.length > 0 && !stopTesting.current) {
        const uri = queue.shift();
        if (uri) await updateDelay(uri, true);
      }
    };

    for (let i = 0; i < concurrency; i++) {
      results.push(runner());
    }

    await Promise.all(results);
  }
  const testAllHandler = async () => {
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
      <div>
        {delay !== -2 ? delay : uri?.delay}
      </div>
      <div>
        <button className=" bg-gray-500 text-white px-4 py-2 mr-2" onClick={testHandler}>{testing ? 'Tesing...' : children}</button>
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

      set_system_proxy('127.0.0.1', 1080);
    }

    return <button className="bg-gray-500 text-white px-4 py-2 mr-2" onClick={clickHandler}>{children}</button>
  }

  return (
    <div className="p-4">
      <Profile
        setUris={setUris}
        updateProfiles={updateProfiles}
      />
      <Card>
        <h1 className="text-2xl font-bold mb-4">V2Ray Start</h1>
        <select className="border p-2 w-full mb-4" onChange={profileChangeHandler}>
          <option>Select</option>
          {profiles?.map((profile: ProfileType) => <option key={profile?.id} value={profile?.id}>{profile?.name}</option>)}
        </select>

        <button className="bg-gray-500 text-white px-4 py-2 ms-2" onClick={startV2Ray}>
          Start
        </button>
        <button className="bg-gray-500 text-white px-4 py-2 ms-2" onClick={stopV2Ray}>
          Stop
        </button>
        <button className="bg-gray-500 text-white px-4 py-2 ms-2" onClick={isRunningTests ? stopTestAll : testAllHandler}>
          {!isRunningTests ? 'Test All' : 'Stop Test All'}
        </button>
        <button className="bg-gray-500 text-white px-4 py-2 ms-2" onClick={isRunningTests ? stopTestAll : testFailedHandler}>
          {!isRunningTests ? 'Test Failed' : 'Stop Test All'}
        </button>

        <button className="bg-gray-500 text-white px-4 py-2 ms-2" onClick={() => updateUris(profile)}>
          Sort
        </button>

        <div className="mt-4">Status: {status}</div>

        <input
          placeholder="Search ..."
          type="text"
          className="border p-2 w-full mb-4"
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            const filter = uris.filter((item: URIType) => item?.uri.includes(e?.target?.value) || item?.name.includes(e?.target?.value));
            setFilteredUri(filter);
          }}
        />
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
              <tr>

                <th scope="col" className="px-6 py-3">
                  Row
                </th>
                <th scope="col" className="px-6 py-3">
                  Test
                </th>
                <th scope="col" className="px-6 py-3">
                  Connect
                </th>
                <th scope="col" className="px-6 py-3">
                  Name
                </th>
                <th scope="col" className="px-6 py-3">
                  URI
                </th>
                <th scope="col" className="px-6 py-3">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUri?.map((uri: URIType, row) => (<tr className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 border-gray-200" key={uri?.id}>
                <td className="px-6 py-4">{row + 1} - {uri?.id}</td>
                <td className="px-6 py-4">
                  <DelayButton uri={uri}>Test</DelayButton>
                </td>
                <td className="px-6 py-4">

                  <ConnectButton uri={uri}>Connect</ConnectButton>

                </td>
                <td className="px-6 py-4 max-w-[5rem]">{decodeURIComponent(uri?.name)}</td>
                <td className="px-6 py-4">
                  <div className="max-w-[10rem] whitespace-nowrap overflow-hidden text-ellipsis">{uri?.uri}</div>
                </td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default App;
