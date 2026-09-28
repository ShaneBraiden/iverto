/**
 * Keyboard behaviour, in one place.
 *
 * Two things have to be true on every screen that holds a text field: the
 * field the cursor is in must be visible above the keyboard, and a tap on a
 * button must land the first time rather than only dismissing the keyboard.
 *
 * Scrolling the focused field into view is done by
 * `react-native-keyboard-controller`, natively, on both platforms. It used to
 * be measured by hand here, and that could not be made reliable on Android 15+:
 * an edge-to-edge window (every app targeting Android 16, with no opt-out)
 * ignores `adjustResize`, so the keyboard is simply drawn over the screen, and
 * the hand-rolled version raced its own padding — `scrollTo` ran before the
 * extra bottom space had been laid out, got clamped to the old content height,
 * and left the field under the keys. The library tracks the keyboard frame by
 * frame and the focused input's layout from native, so neither race exists.
 * `<KeyboardProvider>` in `app/_layout.tsx` is what switches it on.
 *
 * `insideModal` is the bottom sheet. The sheet lifts itself clear of the
 * keyboard (`useKeyboardOverlap`, below), so its scroller must not also make
 * room — that would pad the sheet by a whole keyboard height a second time.
 */
import React from 'react';
import { Keyboard, KeyboardEvent, Platform, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { animateLayout } from '@/components/motion';
import { spacing } from '@/theme';

const isIOS = Platform.OS === 'ios';

/** Breathing room left between the focused field and the top of the keyboard. */
const FIELD_GAP = spacing.md;

/* --------------------------------------------------------- Keyboard metrics */

/**
 * How far the software keyboard reaches up over the view in `ref`, in dp.
 * Zero while the keyboard is closed or clear of the view.
 *
 * Measured rather than taken from the event's `height`: on Android that height
 * leaves out the navigation bar, which an edge-to-edge window still draws
 * under, so lifting by it alone would leave the bottom of a sheet behind the
 * keys. The keyboard's top edge and the view's bottom edge are both in window
 * coordinates, and the gap between them is exactly the lift needed — on a
 * window that did resize, the view already ends above the keyboard and the
 * answer is zero.
 *
 * `active` is for a view that is not always mounted, like a closed sheet:
 * nothing is measured while it is false, and turning it true re-checks a
 * keyboard that is already open.
 */
export function useKeyboardOverlap(ref: React.RefObject<View | null>, active = true) {
  const [overlap, setOverlap] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setOverlap(0);
      return;
    }

    // `will*` fires before the keyboard animates on iOS; Android only has `did*`.
    const showEvent = isIOS ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIOS ? 'keyboardWillHide' : 'keyboardDidHide';

    const measure = (keyboardTop: number | undefined) => {
      const view = ref.current;
      if (keyboardTop == null || !view) return;
      view.measureInWindow((_x, top, _w, height) =>
        setOverlap(Math.max(0, top + height - keyboardTop))
      );
    };

    /* Android raises the show event only when the keyboard goes from hidden to
       shown, so a view that mounts while it is already up would never hear
       about it. */
    if (Keyboard.isVisible()) measure(Keyboard.metrics()?.screenY);

    const show = Keyboard.addListener(showEvent, (event: KeyboardEvent) =>
      measure(event.endCoordinates?.screenY)
    );
    const hide = Keyboard.addListener(hideEvent, () => setOverlap(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref, active]);

  return overlap;
}

/**
 * True while the software keyboard is on screen.
 *
 * Every change is wrapped in a layout animation, so screens that collapse
 * decoration when the keyboard appears (the login lockup, for instance) slide
 * rather than jump.
 */
export function useKeyboardVisible() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const showEvent = isIOS ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIOS ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, () => {
      animateLayout();
      setVisible(true);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      animateLayout();
      setVisible(false);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
}

/* ------------------------------------------------------ KeyboardAwareScroll */

/**
 * Scroll container for any screen that holds a text input.
 *
 * `extraBottomSpace` is the padding under the last child — on a tab screen
 * that is the room the floating tab bar needs, elsewhere it is just breathing
 * space so the final control is not flush with the edge.
 */
export function KeyboardAwareScroll({
  children,
  contentContainerStyle,
  extraBottomSpace = spacing.xxl,
  style,
  insideModal = false,
  fill = true,
  scrollEnabled = true,
  onScrollRef,
}: {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  extraBottomSpace?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * Set on a scroll view inside a `Modal`. A modal is its own window, so
   * neither Android's resize nor the iOS inset reaches it and the keyboard
   * height has to be accounted for by hand.
   */
  insideModal?: boolean;
  /**
   * True on a full screen: the scroller takes all the room it is given.
   * False in a bottom sheet, where it has to size to its content and only
   * shrink once that content runs past a `maxHeight` further up — `flex: 1`
   * there resolves against a parent with no height of its own and collapses
   * the sheet to nothing.
   */
  fill?: boolean;
  scrollEnabled?: boolean;
  /** Escape hatch for a caller that needs to drive the scroll itself. */
  onScrollRef?: (ref: ScrollView | null) => void;
}) {
  /* `collapsable={false}` keeps the wrapper as a real Android view — a view
     the platform has optimised away cannot be measured. */
  const box: ViewStyle = fill ? { flex: 1 } : { flexShrink: 1 };

  return (
    <View style={[box, style]} collapsable={false}>
      <KeyboardAwareScrollView
        ref={onScrollRef}
        style={box}
        /* The sheet has already been lifted above the keyboard; see the note
           at the top of the file. */
        enabled={!insideModal}
        bottomOffset={FIELD_GAP}
        scrollEnabled={scrollEnabled}
        showsVerticalScrollIndicator={false}
        /* A tap on a button while the keyboard is up should press the button,
           not just close the keyboard and make the user tap again. */
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={isIOS ? 'interactive' : 'on-drag'}
        contentContainerStyle={[{ paddingBottom: extraBottomSpace }, contentContainerStyle]}
      >
        {children}
      </KeyboardAwareScrollView>
    </View>
  );
}

/**
 * Hides its children while the keyboard is up.
 * Used for footers and watermarks that only steal room when typing.
 */
export function HideOnKeyboard({ children }: { children: React.ReactNode }) {
  const open = useKeyboardVisible();
  if (open) return null;
  return <View>{children}</View>;
}
