/**
 * Keyboard behaviour, in one place.
 *
 * The two platforms solve this differently and mixing the solutions
 * double-compensates, so each gets exactly one mechanism:
 *
 *   iOS      `automaticallyAdjustKeyboardInsets` — the scroll view grows its
 *            own bottom inset by the keyboard height and scrolls the focused
 *            input into view. No `KeyboardAvoidingView`, which would add the
 *            same offset a second time.
 *   Android  the window itself resizes (`softwareKeyboardLayoutMode: "resize"`
 *            in app.json), so the scroll view is already shorter and nothing
 *            extra is needed.
 *
 * On both, dragging the list dismisses the keyboard and taps pass through to
 * buttons while it is open.
 */
import React from 'react';
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleProp,
  UIManager,
  View,
  ViewStyle,
} from 'react-native';
import { spacing } from '@/theme';

/* Android needs this opt-in before LayoutAnimation does anything. */
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const isIOS = Platform.OS === 'ios';

/**
 * Scroll container for any screen that holds a text input.
 *
 * `extraBottomSpace` is added on top of the keyboard inset so the field the
 * user is typing in never sits flush against the top of the keyboard.
 */
export function KeyboardAwareScroll({
  children,
  contentContainerStyle,
  extraBottomSpace = spacing.xxl,
  style,
}: {
  children: React.ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  extraBottomSpace?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <ScrollView
      style={[{ flex: 1 }, style]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode={isIOS ? 'interactive' : 'on-drag'}
      automaticallyAdjustKeyboardInsets={isIOS}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[{ paddingBottom: extraBottomSpace }, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  );
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
    // `will*` fires before the keyboard animates on iOS; Android only has `did*`.
    const showEvent = isIOS ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = isIOS ? 'keyboardWillHide' : 'keyboardDidHide';

    const animate = () =>
      LayoutAnimation.configureNext(
        LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.scaleXY)
      );

    const show = Keyboard.addListener(showEvent, () => {
      animate();
      setVisible(true);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      animate();
      setVisible(false);
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return visible;
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
