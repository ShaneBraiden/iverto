/**
 * Renders a subtree somewhere else in the same window — above the navigator,
 * rather than inside the screen that owns it.
 *
 * Exists for the bottom sheet on Android. A `Modal` there is a separate dialog
 * window, and in an edge-to-edge app neither `adjustResize` nor React Native's
 * keyboard events reach it: the keyboard opens over the sheet and nothing in
 * JS is told. A sheet drawn into the activity's own window through a portal
 * gets the same keyboard events as every other screen, so it can lift itself
 * above the keys.
 *
 * Hosts nest, and a portal renders into the nearest one. That matters for
 * context: the portalled subtree only sees providers *above its host*, so the
 * role shells (admin, parent, student) each place a host inside their own
 * provider — a sheet on a guardian tab can still read the selected ward.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';

type PortalApi = {
  mount: (key: string, node: React.ReactNode) => void;
  unmount: (key: string) => void;
};

const PortalContext = React.createContext<PortalApi | null>(null);

export function PortalHost({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = React.useState<ReadonlyMap<string, React.ReactNode>>(
    () => new Map()
  );

  /* Stable for the life of the host, so publishing it never re-renders the
     screens underneath — only the host itself updates when a portal does. */
  const api = React.useMemo<PortalApi>(
    () => ({
      mount: (key, node) =>
        setEntries((prev) => {
          const next = new Map(prev);
          next.set(key, node);
          return next;
        }),
      unmount: (key) =>
        setEntries((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        }),
    }),
    []
  );

  return (
    <PortalContext.Provider value={api}>
      <View style={styles.fill}>{children}</View>
      {[...entries].map(([key, node]) => (
        <View key={key} style={StyleSheet.absoluteFill} pointerEvents="box-none">
          {node}
        </View>
      ))}
    </PortalContext.Provider>
  );
}

export function Portal({ children }: { children: React.ReactNode }) {
  const host = React.useContext(PortalContext);
  const key = React.useId();

  /* Every render, and in a layout effect: an update queued here is flushed
     before paint, so a controlled input inside the portal shows each
     keystroke in the same frame it would have in place. */
  React.useLayoutEffect(() => {
    host?.mount(key, children);
  });
  React.useLayoutEffect(() => () => host?.unmount(key), [host, key]);

  /* No host above — render in place rather than not at all. */
  return host ? null : <>{children}</>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
