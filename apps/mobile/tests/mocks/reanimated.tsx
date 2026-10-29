/* eslint-disable @typescript-eslint/no-require-imports */
// Minimal Reanimated stand-in for unit tests: renders plain React Native views and
// returns static values, covering only the API surface EMS Food uses.
const RN = require('react-native');

const chainable = (): unknown =>
  new Proxy(function builder() {}, {
    get: (_target, prop) => (prop === 'build' ? () => () => ({}) : () => chainable()),
    apply: () => chainable(),
  });

function stripAnimationProps(Component: React.ComponentType<Record<string, unknown>>) {
  return function AnimatedStub({ entering: _e, exiting: _x, layout: _l, ...props }: Record<string, unknown>) {
    return <Component {...props} />;
  };
}

const Animated = {
  View: stripAnimationProps(RN.View),
  Text: stripAnimationProps(RN.Text),
  ScrollView: stripAnimationProps(RN.ScrollView),
  createAnimatedComponent: (C: React.ComponentType<Record<string, unknown>>) => stripAnimationProps(C),
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  useSharedValue: (value: unknown) => ({ value }),
  useAnimatedStyle: (fn: () => object) => fn(),
  withTiming: (value: unknown) => value,
  withSpring: (value: unknown) => value,
  withDelay: (_ms: number, value: unknown) => value,
  withRepeat: (value: unknown) => value,
  Easing: { out: () => () => 0, cubic: () => 0, linear: () => 0 },
  FadeIn: chainable(),
  FadeInDown: chainable(),
  FadeInUp: chainable(),
  FadeOut: chainable(),
  FadeOutDown: chainable(),
  FadeOutUp: chainable(),
  SlideInDown: chainable(),
  SlideOutDown: chainable(),
  ZoomIn: chainable(),
  LinearTransition: chainable(),
};
