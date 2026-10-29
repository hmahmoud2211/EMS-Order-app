import { router } from 'expo-router';
import { Compass } from 'lucide-react-native';

import { Screen } from '@/components/ui/Screen';
import { EmptyState } from '@/components/ui/States';

export default function NotFound() {
  return (
    <Screen>
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        message="It may have moved, or you may not have access to it."
        actionLabel="Go home"
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}
