import { cssInterop } from 'nativewind';
import Animated from 'react-native-reanimated';

// Let `className` style Reanimated components (used for entering/exiting animations).
cssInterop(Animated.View, { className: 'style' });
cssInterop(Animated.Text, { className: 'style' });
cssInterop(Animated.ScrollView, { className: 'style' });
