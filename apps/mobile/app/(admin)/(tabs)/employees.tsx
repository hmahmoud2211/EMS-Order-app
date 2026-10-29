import { router } from 'expo-router';
import { ChevronRight, FileUp, Search, UserPlus, Users } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SegmentedControl } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { ScreenHeader } from '@/components/ui/Screen';
import { SkeletonList } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { useEmployees } from '@/features/employees/api';
import { colors, shadows } from '@/theme';

type Status = 'active' | 'inactive' | 'all';

export default function EmployeesTab() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const employees = useEmployees(query.trim(), status);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <FlatList
        data={employees.data?.items ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 10, width: '100%', maxWidth: 860, alignSelf: 'center' }}
        refreshing={employees.isRefetching}
        onRefresh={() => employees.refetch()}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View className="gap-3 pb-1">
            <ScreenHeader title={t('employees.title')} subtitle={employees.data ? `${employees.data.total}` : undefined} />
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Button label={t('employees.add')} icon={UserPlus} onPress={() => router.push('/employee/new')} />
              </View>
              <View className="flex-1">
                <Button label={t('employees.import')} icon={FileUp} variant="secondary" onPress={() => router.push('/employee/import')} />
              </View>
            </View>
            <Input icon={Search} placeholder={t('employees.searchPlaceholder')} value={query} onChangeText={setQuery}
              autoCapitalize="none" />
            <SegmentedControl<Status>
              value={status}
              onChange={setStatus}
              options={[
                { value: 'active', label: t('employees.active') },
                { value: 'inactive', label: t('employees.inactive') },
                { value: 'all', label: t('common.all') },
              ]}
            />
          </View>
        }
        ListEmptyComponent={
          employees.isLoading ? (
            <SkeletonList count={6} />
          ) : employees.isError ? (
            <ErrorState error={employees.error} onRetry={() => employees.refetch()} />
          ) : (
            <EmptyState icon={Users} title={query ? t('common.noResults') : t('employees.emptyTitle')}
              message={query ? undefined : t('employees.emptyMessage')} tone="muted" />
          )
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={item.full_name}
            onPress={() => router.push({ pathname: '/employee/[id]', params: { id: item.id } })}
            className="flex-row items-center gap-3 rounded-3xl bg-surface p-3.5 active:opacity-90"
            style={shadows.card}
          >
            <Avatar name={item.full_name} size={44} muted={!item.is_active} />
            <View className="flex-1 gap-0.5">
              <Text variant="subheading" tone={item.is_active ? 'ink' : 'muted'} numberOfLines={1}>
                {item.full_name}
              </Text>
              <Text variant="small" tone="muted" numberOfLines={1}>
                @{item.username}
                {item.department ? ` · ${item.department}` : ''}
              </Text>
            </View>
            <View className="items-end gap-1">
              {item.role === 'ADMIN' ? <Badge label={t('employees.role_ADMIN')} tone="navy" size="sm" /> : null}
              {!item.is_active ? <Badge label={t('employees.inactive')} tone="neutral" size="sm" /> : null}
            </View>
            <ChevronRight size={18} color={colors.mutedLight} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
