import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { Dimensions, Keyboard, Platform, ScrollView, TextInput, type View } from 'react-native';

/**
 * Keyboard handling that works the same in Expo Go and installed builds, on Android and iOS.
 *
 * Android apps are edge-to-edge (Expo SDK 53+), so the window no longer shrinks when the keyboard
 * opens and React Native's KeyboardAvoidingView alone leaves text boxes hidden. Instead we measure
 * where the keyboard starts and move only what it would cover. If the window did shrink (older
 * setups), the measurements show nothing is covered and nothing moves, so it is never applied twice.
 */

/** Space kept between the keyboard and the text box being typed in */
const GAP = 16;
const SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/** Text boxes report focus here, so open screens can scroll the new one into view (see Input in ui.tsx). */
const focusListeners = new Set<() => void>();
export function notifyInputFocus() { focusListeners.forEach((l) => l()); }

/** The keyboard's top edge in window coordinates, or null while it is hidden. */
export function useKeyboardTop() {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const show = Keyboard.addListener(SHOW, (e) => setTop(e.endCoordinates.screenY));
    const hide = Keyboard.addListener(HIDE, () => setTop(null));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return top;
}

/**
 * How far a view at the bottom of the screen (chat box, bottom sheet) must move up so the keyboard
 * doesn't cover it. Apply it as bottom padding on the view's container.
 */
export function useKeyboardLift(ref: RefObject<View | null>) {
  const [state, setState] = useState({ lift: 0, open: false });
  useEffect(() => {
    let current = 0;
    const show = Keyboard.addListener(SHOW, (e) => {
      const top = e.endCoordinates.screenY;
      ref.current?.measureInWindow((_x, y, _w, h) => {
        // Where the view would end without any lift
        const bottom = y + h + current;
        current = Math.max(0, Math.round(bottom - top));
        setState({ lift: current, open: true });
      });
    });
    const hide = Keyboard.addListener(HIDE, () => { current = 0; setState({ lift: 0, open: false }); });
    return () => { show.remove(); hide.remove(); };
  }, [ref]);
  return state;
}

/**
 * For scrolling screens and sheets: while the keyboard is open, scrolls the focused text box into
 * view and returns extra bottom space to add to the content, so even the last field can scroll up.
 * Pass the ScrollView's ref and pipe its onScroll into `onScroll`.
 * `settled`: for content that is itself lifted above the keyboard (a bottom sheet), pass the lift,
 * so the check runs once the lift is applied rather than while the box is still under the keyboard.
 */
export function useScrollToFocusedInput(scrollRef: RefObject<ScrollView | null>, settled?: number) {
  const top = useKeyboardTop();
  const offset = useRef(0);
  const topRef = useRef<number | null>(null);
  const reveal = useCallback(() => {
    const keyboardTop = topRef.current;
    if (keyboardTop === null) return;
    const input = TextInput.State.currentlyFocusedInput() as unknown as View | null;
    input?.measureInWindow?.((_x, y, _w, h) => {
      const hidden = y + h + GAP - keyboardTop;
      if (hidden > 0) scrollRef.current?.scrollTo({ y: offset.current + hidden, animated: true });
    });
  }, [scrollRef]);
  useEffect(() => {
    topRef.current = top;
    // Wait a frame for the extra space to be laid out
    const t = setTimeout(reveal, 60);
    return () => clearTimeout(t);
  }, [top, settled, reveal]);
  useEffect(() => {
    const listener = () => { setTimeout(reveal, 120); };
    focusListeners.add(listener);
    return () => { focusListeners.delete(listener); };
  }, [reveal]);
  return {
    // The keyboard's height: room to scroll the last field above it
    extraBottom: top === null ? 0 : Math.max(0, Dimensions.get('window').height - top),
    onScroll: useCallback((y: number) => { offset.current = y; }, []),
  };
}
