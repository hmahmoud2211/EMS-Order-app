import { Tabs } from 'expo-router/js-tabs';
import { ClipboardList, LayoutDashboard, Settings, Store, Users } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { tabScreenOptions } from '@/components/navigation/tabOptions';

export default function AdminTabs() {
  const { t } = useTranslation();
  return (
    <Tabs screenOptions={tabScreenOptions}>
      <Tabs.Screen
        name="dashboard"
        options={{ title: t('tabs.dashboard'), tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="orders"
        options={{ title: t('tabs.orders'), tabBarIcon: ({ color, size }) => <ClipboardList color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="restaurants"
        options={{ title: t('tabs.restaurants'), tabBarIcon: ({ color, size }) => <Store color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="employees"
        options={{ title: t('tabs.employees'), tabBarIcon: ({ color, size }) => <Users color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabs.settings'), tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }}
      />
    </Tabs>
  );
}
