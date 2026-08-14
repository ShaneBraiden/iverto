/**
 * Keyboard behaviour, in one place.
 *
 * Two things have to be true on every screen that holds a text field: the
 * field the cursor is in must be visible above the keyboard, and a tap on a
 * button must land the first time rather than only dismissing the keyboard.
 * Neither comes for free, and the platforms get there differently:
 *
 *   iOS      `automaticallyAdjustKeyboardInsets` grows the scroll view's own
 *            bottom inset by the keyboard height. No `KeyboardAvoidingView`,
 *            which would add the same offset a second time.
 *   Android  the window itself resizes (`softwareKeyboardLayoutMode: "resize"`
 *            in app.json, `adjustResize` in the manifest), so the scroll view
 *            is already shorter — but nothing scrolls the focused field into
 *            the part that is left.
 *
 * So on top of the platform mechanism this module measures: when the keyboard
 * opens, or the cursor moves to another field, it works out how far the field
 * sits below the bottom of what is still on screen and scrolls exactly that
 * far. The measurement is a no-op when the field is already visible, which is
 * what makes it safe to run on both platforms.
 *
 * `insideModal` is the one case neither platform handles. A `Modal` is its own
 * window: Android's `adjustResize` does not reach it and iOS does not inset it,
 * so the keyboard simply covers the bottom of a bottom sheet. There the
 * keyboard height is applied by hand — see `components/Sheet.tsx`.
 */
import React from 'react';
import {
  Keyboard,
  KeyboardEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  StyleProp,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { animateLayout } from '@/components/motion';
import { spacing } from '@/theme';

const isIOS = Platform.OS === 'ios';

/** Breathing room left between the focused field and the top of the keyboard. */
const FIELD_GAP = spacing.md;

/** Anything with `measureInWindow` — a View ref, or the currently focused input. */
type Measurable = {
  measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

/* ------------------------------------------------------------ ensureVisible */

/**
 * Published by the scroll container to the fields inside it.
 *
 * A `keyboardDidShow` only fires when the keyboard *opens*, so moving from one
 * field to the next while it is already up would otherwise leave the cursor
 * behind the keys. `Field` calls this on focus and the two together cover both.
 */
const EnsureVisibleContext = React.createContext<(() => void) | null>(null);

/**
 * Asks the enclosing scroll container to bring the focused field into view.
 * Returns null outside one, so a field can be used anywhere.
 */
export function useEnsureVisible() {
  return React.useContext(EnsureVisibleContext);
}

/* --------------------------------------------------------- Keyboard metrics */

/** Height of the software keyboard right now, in dp. Zero while it is closed. */
export function useKeyboardHeight() {
  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    // `will*` fires before the keyboard animates on iOS; Android only has `did*`.
    const showEvent = isIOS ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIOS ? 'keyboardWillHide' : 'keyboardDidHide';

    const show = Keyboard.addListener(showEvent, (event: KeyboardEvent) =>
      setHeight(event.endCoordinates?.height ?? 0)
    );
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
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
  const scrollRef = React.useRef<ScrollView>(null);
  /** The visible frame of the scroll view — what a field has to fit inside. */
  const frameRef = React.useRef<View>(null);
  /** Live scroll offset, so a correction can be applied on top of it. */
  const offsetY = React.useRef(0);
  const keyboardHeight = React.useRef(0);

  /* Inside a modal the window does not shrink, so the content needs enough
     padding underneath to be scrollable past the keyboard at all. */
  const [modalInset, setModalInset] = React.useState(0);

  const ensureVisible = React.useCallback(() => {
    const input = TextInput.State.currentlyFocusedInput() as Measurable | null;
    const scroll = scrollRef.current;
    const frame = frameRef.current;
    if (!input || !scroll || !frame) return;

    frame.measureInWindow((_fx, frameTop, _fw, frameHeight) => {
      input.measureInWindow((_ix, inputTop, _iw, inputHeight) => {
        /* On Android the window itself resized, so `frameHeight` already
           excludes the keyboard. In a modal it did not, so take it off here. */
        const viewportBottom =
          frameTop + frameHeight - (insideModal ? keyboardHeight.current : 0);

        const below = inputTop + inputHeight + FIELD_GAP - viewportBottom;
        if (below > 1) {
          scroll.scrollTo({ y: offsetY.current + below, animated: true });
          return;
        }

        /* The other direction: a field pushed off the *top* by the resize. */
        const above = frameTop + FIELD_GAP - inputTop;
        if (above > 1) {
          scroll.scrollTo({ y: Math.max(0, offsetY.current - above), animated: true });
        }
      });
    });
  }, [insideModal]);

  React.useEffect(() => {
    const showEvent = isIOS ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIOS ? 'keyboardWillHide' : 'keyboardDidHide';

    let settle: ReturnType<typeof setTimeout> | undefined;

    const show = Keyboard.addListener(showEvent, (event: KeyboardEvent) => {
      keyboardHeight.current = event.endCoordinates?.height ?? 0;
      if (insideModal) setModalInset(keyboardHeight.current);

      /* Measured twice on purpose. `keyboardDidShow` fires when the keyboard
         is up, but Android's window resize reaches this layout a frame or two
         later, and a measurement taken before it lands is against the old,
         full-height frame — it finds no overlap and does nothing. The second
         pass catches that; it is a no-op whenever the first one was enough. */
      requestAnimationFrame(ensureVisible);
      settle = setTimeout(ensureVisible, 150);
    });

    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardHeight.current = 0;
      if (insideModal) setModalInset(0);
    });

    return () => {
      show.remove();
      hide.remove();
      if (settle) clearTimeout(settle);
    };
  }, [ensureVisible, insideModal]);

  const onScroll = React.useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = event.nativeEvent.contentOffset.y;
  }, []);

  const setScrollRef = React.useCallback(
    (ref: ScrollView | null) => {
      (scrollRef as React.MutableRefObject<ScrollView | null>).current = ref;
      onScrollRef?.(ref);
    },
    [onScrollRef]
  );

  /* `collapsable={false}` keeps the wrapper as a real Android view — a view
     the platform has optimised away cannot be measured. */
  const box: ViewStyle = fill ? { flex: 1 } : { flexShrink: 1 };

  return (
    <EnsureVisibleContext.Provider value={ensureVisible}>
      <View ref={frameRef} style={[box, style]} collapsable={false}>
        <ScrollView
          ref={setScrollRef}
          style={box}
          scrollEnabled={scrollEnabled}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          /* A tap on a button while the keyboard is up should press the button,
             not just close the keyboard and make the user tap again. */
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={isIOS ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets={isIOS && !insideModal}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            { paddingBottom: extraBottomSpace + modalInset },
            contentContainerStyle,
          ]}
        >
          {children}
        </ScrollView>
      </View>
    </EnsureVisibleContext.Provider>
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
