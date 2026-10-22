import React, {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { Canvas } from "./Canvas";
import { Scene } from "./Scene";
import { warmTextures } from "./textures";

/**
 * The one 3D table the app keeps alive. It mounts under the club at start-up, so shaders,
 * geometry and textures are already on the GPU by the time a match opens: the table screen
 * shows a scene that is already drawn instead of "Preparing your table…". While no game is
 * active the frame loop stops, so it costs nothing to keep.
 */
type HostState = {
  ready: boolean;
  active: boolean;
  error: string;
  compatibility: boolean;
  attempt: number;
  listeners: Set<() => void>;
};
// Kept on the global so a Fast Refresh of this module cannot orphan the mounted canvas from
// the state the table screen writes to (that showed as an empty stage in development).
const state: HostState = ((globalThis as any).__cmTableHost ??= {
  ready: false,
  active: false,
  error: "",
  compatibility: false,
  attempt: 0,
  listeners: new Set<() => void>(),
});
const notify = () => state.listeners.forEach((l) => l());
export const tableHost = {
  subscribe(l: () => void) {
    state.listeners.add(l);
    return () => void state.listeners.delete(l);
  },
  snapshot: () =>
    `${state.ready}|${state.active}|${state.error}|${state.compatibility}|${state.attempt}`,
  setActive(active: boolean) {
    if (state.active === active) return;
    state.active = active;
    notify();
  },
  retry() {
    state.compatibility = false;
    state.error = "";
    state.ready = false;
    state.attempt++;
    notify();
  },
  useCompatibility() {
    state.error = "";
    state.compatibility = true;
    notify();
  },
};
export function useTableHost() {
  useSyncExternalStore(tableHost.subscribe, tableHost.snapshot);
  return state;
}
/** Web previews keep a 16:9 stage; devices use the whole screen. */
export const stageHeight = (width: number, height: number) =>
  Platform.OS === "web" ? Math.min(height, width * 0.5625) : height;

class SceneBoundary extends React.Component<
  { children: React.ReactNode; onError: (message: string) => void },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) {
    return { error: e.message };
  }
  componentDidCatch(e: Error) {
    console.error("CueMaster table failed", e);
    this.props.onError(
      "The graphics could not start. Try loading the table again.",
    );
  }
  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

export function TableHost() {
  const host = useTableHost();
  const win = useWindowDimensions();
  const width = Math.max(win.width, win.height),
    height = Math.min(win.width, win.height);
  const mountedAt = useRef(Date.now());
  // Bake the textures in small background steps first; mounting the scene before that would
  // generate them in one blocking go on the JS thread and freeze the welcome screen.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    void warmTextures().then(() => setWarm(true));
  }, []);
  useEffect(() => {
    if (!warm || host.ready || host.error || host.compatibility) return;
    // A context that never draws falls back to the 2D table. The budget is generous because it
    // runs from app start, not from the moment a player taps Play.
    const timer = setTimeout(
      () => {
        if (Platform.OS !== "web") state.compatibility = true;
        else
          state.error =
            "The graphics did not start. Try again, and check that the browser has graphics acceleration enabled.";
        notify();
      },
      Platform.OS === "web" ? 30000 : 45000,
    );
    return () => clearTimeout(timer);
  }, [warm, host.ready, host.error, host.compatibility, host.attempt]);
  if (!warm || host.compatibility || host.error) return null;
  return (
    <View
      pointerEvents={host.active ? "auto" : "none"}
      style={[
        s.host,
        {
          height: stageHeight(width, height),
          opacity: host.active ? 1 : 0,
        },
      ]}
    >
      <SceneBoundary
        key={host.attempt}
        onError={(message) => {
          state.error = message;
          notify();
        }}
      >
        <Canvas
          frameloop={host.active || !host.ready ? "always" : "never"}
          camera={{ position: [0, 3, 0.001], fov: 19, near: 0.05, far: 40 }}
          dpr={[1, 1.7]}
          gl={{
            antialias: Platform.OS === "web",
            alpha: true,
            powerPreference: "high-performance",
          }}
        >
          <Scene
            active={host.active}
            onReady={() => {
              state.ready = true;
              notify();
              if (__DEV__)
                console.log(
                  `CueMaster 3D table ready ${Date.now() - mountedAt.current} ms after app start`,
                );
            }}
          />
        </Canvas>
      </SceneBoundary>
    </View>
  );
}
const s = StyleSheet.create({
  host: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    maxWidth: 1700,
    alignSelf: "center",
  },
});
