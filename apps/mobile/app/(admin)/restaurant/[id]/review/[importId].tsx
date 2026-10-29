import { router, useLocalSearchParams } from 'expo-router';
import { AlertTriangle, Ban, CheckCircle2, GitMerge, Loader, Plus, Save, Trash2, Upload } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, Switch, TextInput, useWindowDimensions, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Badge, statusTone } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { SectionTitle, SegmentedControl, SelectRow } from '@/components/ui/Controls';
import { Input } from '@/components/ui/Input';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, InlineError, Notice } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { blankDraftItem, mergeDraftItems, optionsToText, textToOptions } from '@/features/imports/draft';
import { useImportMutations, useMenuImport } from '@/features/restaurants/api';
import { colors, fonts } from '@/theme';
import type { DraftItem } from '@/types/api';
import { errorCode, errorMessage, toApiError } from '@/utils/errors';
import { isValidPriceInput } from '@/utils/money';

interface Row {
  item: DraftItem;
  price: string;
  sizes: string;
  extras: string;
}

function toRow(item: DraftItem): Row {
  return {
    item,
    price: item.base_price === null ? '' : item.base_price.replace(/\.00$/, ''),
    sizes: optionsToText(item.sizes),
    extras: optionsToText(item.extras),
  };
}

function fromRow(row: Row): DraftItem {
  return {
    ...row.item,
    base_price: isValidPriceInput(row.price) ? row.price : null,
    sizes: textToOptions(row.sizes),
    extras: textToOptions(row.extras),
  };
}

function Cell({
  value,
  onChange,
  width,
  numeric,
  multiline,
  invalid,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  width: number;
  numeric?: boolean;
  multiline?: boolean;
  invalid?: boolean;
  label: string;
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      keyboardType={numeric ? 'decimal-pad' : 'default'}
      multiline={multiline}
      style={{
        width,
        minHeight: 38,
        fontFamily: fonts.regular,
        fontSize: 13,
        color: colors.ink,
        borderWidth: 1,
        borderColor: invalid ? colors.danger : colors.line,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 6,
        backgroundColor: invalid ? colors.danger50 : colors.surface,
      }}
    />
  );
}

export default function ReviewImportScreen() {
  const { t } = useTranslation();
  const { id, importId } = useLocalSearchParams<{ id: string; importId: string }>();
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const detail = useMenuImport(id, importId);
  const { saveDraft, approve, reject } = useImportMutations(id, importId);
  // Local edits override the server draft until they are saved.
  const [edited, setEdited] = useState<Row[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'review'>('all');
  const [publishOpen, setPublishOpen] = useState(false);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [confirmReplace, setConfirmReplace] = useState<number | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [problems, setProblems] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const record = detail.data;

  const serverRows = useMemo(() => (record?.extraction_result?.items ?? []).map(toRow), [record?.extraction_result]);
  const rows = edited ?? serverRows;
  const dirty = edited !== null;
  const setRows = (change: (current: Row[]) => Row[]) => setEdited((current) => change(current ?? serverRows));

  const visible = useMemo(
    () => rows.filter((r) => filter === 'all' || r.item.status !== 'VALID' || problems.has(r.item.id)),
    [rows, filter, problems],
  );
  const categories = useMemo(() => Array.from(new Set(rows.map((r) => r.item.category))), [rows]);
  const editable = record?.status === 'NEEDS_REVIEW';

  const update = (itemId: string, patch: Partial<Row> | ((row: Row) => Row)) => {
    setRows((current) =>
      current.map((row) => (row.item.id === itemId ? (typeof patch === 'function' ? patch(row) : { ...row, ...patch }) : row)),
    );
  };
  const updateItem = (itemId: string, patch: Partial<DraftItem>) =>
    update(itemId, (row) => ({ ...row, item: { ...row.item, ...patch } }));
  const remove = (itemId: string) => {
    setRows((current) => current.filter((r) => r.item.id !== itemId));
  };
  const mergeIntoPrevious = (itemId: string) => {
    setRows((current) => {
      const index = current.findIndex((r) => r.item.id === itemId);
      if (index < 0) return current;
      const source = current[index];
      // Merge into the suspected duplicate, or into the row above.
      const targetId = source.item.duplicate_of ?? current[index - 1]?.item.id;
      if (!targetId || !current.some((r) => r.item.id === targetId)) return current;
      return current
        .filter((r) => r.item.id !== itemId)
        .map((r) => (r.item.id === targetId ? toRow(mergeDraftItems(fromRow(r), fromRow(source))) : r));
    });
  };

  const save = async (): Promise<boolean> => {
    setError(null);
    try {
      await saveDraft.mutateAsync(rows.map(fromRow));
      setEdited(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  };

  const publish = async (confirm: boolean) => {
    if (dirty && !(await save())) return;
    approve.mutate(
      { mode, confirm_replace: confirm },
      {
        onSuccess: () => {
          setPublishOpen(false);
          setConfirmReplace(null);
          toast.success(t('imports.published'));
          router.replace({ pathname: '/restaurant/[id]', params: { id } });
        },
        onError: (e) => {
          const code = errorCode(e);
          if (code === 'CONFIRM_REPLACE_REQUIRED') {
            const details = toApiError(e).details as { existing_items?: number } | null;
            setPublishOpen(false);
            setConfirmReplace(details?.existing_items ?? 0);
            return;
          }
          if (code === 'IMPORT_HAS_ERRORS') {
            const details = toApiError(e).details as { items?: { id: string }[] } | null;
            setProblems(new Set((details?.items ?? []).map((i) => i.id)));
            setFilter('review');
          }
          setPublishOpen(false);
          setConfirmReplace(null);
          setError(errorMessage(e));
        },
      },
    );
  };

  if (detail.isLoading) {
    return (
      <Screen>
        <ScreenHeader back title={t('imports.review')} />
        <SkeletonCard lines={6} />
      </Screen>
    );
  }
  if (detail.isError || !record) {
    return (
      <Screen>
        <ScreenHeader back title={t('imports.review')} />
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      </Screen>
    );
  }

  const stats = record.stats ?? {};
  const unparsed = (record.extraction_result?.meta?.unparsed_lines as string[] | undefined) ?? [];

  return (
    <Screen maxWidth={wide ? 1400 : 760} refreshing={detail.isRefetching} onRefresh={() => !dirty && detail.refetch()}>
      <ScreenHeader
        back
        title={t('imports.review')}
        subtitle={`${record.original_filename} · ${record.source_type}`}
        right={<Badge label={t(`status.${record.status}`)} tone={statusTone(record.status)} dot />}
      />

      {record.status === 'PROCESSING' ? (
        <Card>
          <EmptyState icon={Loader} title={t('imports.processing')} tone="primary" compact />
        </Card>
      ) : record.status === 'FAILED' ? (
        <View className="gap-3">
          <Notice icon={AlertTriangle} tone="warning" message={record.error_message ?? t('imports.failed')} />
          <Button label={t('imports.chooseFile')} icon={Upload} onPress={() => router.replace({ pathname: '/restaurant/[id]/import', params: { id } })} />
        </View>
      ) : (
        <View className="gap-4">
          {!editable ? <Notice icon={CheckCircle2} tone={record.status === 'APPROVED' ? 'success' : 'neutral'}
            message={t(`status.${record.status}`)} /> : <Text variant="small" tone="muted">{t('imports.reviewSubtitle')}</Text>}

          <View className="flex-row flex-wrap gap-2.5">
            {[
              [t('imports.items'), stats.items ?? rows.length, 'neutral'],
              [t('imports.needsReview'), stats.needs_review ?? 0, 'warning'],
              [t('imports.invalid'), stats.invalid ?? 0, 'danger'],
              [t('imports.avgConfidence'), `${Math.round((stats.average_confidence ?? 1) * 100)}%`, 'primary'],
            ].map(([label, value, tone]) => (
              <View key={String(label)} className="min-w-[45%] flex-1 rounded-2xl bg-surface p-3">
                <Text variant="heading">{String(value)}</Text>
                <Text variant="caption" tone={tone === 'warning' ? 'warning' : tone === 'danger' ? 'danger' : 'muted'}>
                  {String(label)}
                </Text>
              </View>
            ))}
          </View>

          {record.warnings.map((w, i) => (
            <Notice key={`${w.code}-${i}`} tone="warning" icon={AlertTriangle} message={w.message} />
          ))}

          <SegmentedControl
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('imports.filter_all'), count: rows.length },
              { value: 'review', label: t('imports.filter_review'), count: rows.filter((r) => r.item.status !== 'VALID').length },
            ]}
          />

          {wide ? (
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View className="gap-1.5">
                <View className="flex-row gap-2 px-2">
                  {[
                    [t('imports.category'), 150], [t('imports.name'), 210], [t('imports.description'), 230],
                    [t('imports.basePrice'), 90], [t('imports.sizes'), 200], [t('imports.extras'), 200],
                    [t('common.available'), 70], [t('imports.confidence'), 90], [t('common.status'), 150], ['', 80],
                  ].map(([label, w]) => (
                    <Text key={String(label) + w} variant="caption" tone="muted" style={{ width: Number(w) }}>
                      {String(label)}
                    </Text>
                  ))}
                </View>
                {visible.map((row) => {
                  const invalidPrice = !isValidPriceInput(row.price);
                  return (
                    <View key={row.item.id}
                      className={`flex-row items-start gap-2 rounded-2xl p-2 ${problems.has(row.item.id) ? 'bg-danger-50' : 'bg-surface'}`}>
                      <Cell label={t('imports.category')} width={150} value={row.item.category} onChange={(category) => updateItem(row.item.id, { category })} />
                      <Cell label={t('imports.name')} width={210} value={row.item.name} invalid={!row.item.name.trim()} onChange={(name) => updateItem(row.item.id, { name })} />
                      <Cell label={t('imports.description')} width={230} multiline value={row.item.description ?? ''} onChange={(description) => updateItem(row.item.id, { description: description || null })} />
                      <Cell label={t('imports.basePrice')} width={90} numeric value={row.price} invalid={invalidPrice} onChange={(price) => update(row.item.id, { price })} />
                      <Cell label={t('imports.sizes')} width={200} value={row.sizes} onChange={(sizes) => update(row.item.id, { sizes })} />
                      <Cell label={t('imports.extras')} width={200} value={row.extras} onChange={(extras) => update(row.item.id, { extras })} />
                      <View style={{ width: 70 }} className="items-start pt-1">
                        <Switch value={row.item.is_available} onValueChange={(is_available) => updateItem(row.item.id, { is_available })}
                          trackColor={{ true: colors.success, false: colors.lineStrong }} thumbColor={colors.white} />
                      </View>
                      <Text variant="small" style={{ width: 90 }} className="pt-2">
                        {Math.round(row.item.confidence * 100)}%
                      </Text>
                      <View style={{ width: 150 }} className="gap-1 pt-1">
                        <Badge label={t(`status.${row.item.status}`)} tone={statusTone(row.item.status)} size="sm" />
                        {row.item.issues.map((issue) => (
                          <Text key={issue} variant="caption" tone="warning">
                            {t(`imports.issue_${issue}`, { defaultValue: issue })}
                          </Text>
                        ))}
                      </View>
                      {editable ? (
                        <View style={{ width: 80 }} className="flex-row">
                          <IconButton icon={GitMerge} size={34} label={t('imports.mergeInto')} onPress={() => mergeIntoPrevious(row.item.id)} />
                          <IconButton icon={Trash2} size={34} tone="danger" label={t('imports.deleteRow')} onPress={() => remove(row.item.id)} />
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          ) : (
            <View className="gap-3">
              {visible.map((row) => (
                <Card key={row.item.id} className={`gap-3 ${problems.has(row.item.id) ? 'border border-danger' : ''}`}>
                  <View className="flex-row items-center gap-2">
                    <Badge label={t(`status.${row.item.status}`)} tone={statusTone(row.item.status)} size="sm" />
                    <Text variant="caption" tone="muted" className="flex-1">
                      {t('imports.confidence')}: {Math.round(row.item.confidence * 100)}%
                    </Text>
                    {editable ? (
                      <>
                        <IconButton icon={GitMerge} size={34} label={t('imports.mergeInto')} onPress={() => mergeIntoPrevious(row.item.id)} />
                        <IconButton icon={Trash2} size={34} tone="danger" label={t('imports.deleteRow')} onPress={() => remove(row.item.id)} />
                      </>
                    ) : null}
                  </View>
                  {row.item.issues.length ? (
                    <Text variant="caption" tone="warning">
                      {row.item.issues.map((issue) => t(`imports.issue_${issue}`, { defaultValue: issue })).join(' · ')}
                    </Text>
                  ) : null}
                  <Input label={t('imports.name')} value={row.item.name} onChangeText={(name) => updateItem(row.item.id, { name })}
                    error={row.item.name.trim() ? undefined : ' '} editable={editable} />
                  <View className="flex-row gap-2">
                    <Input containerClassName="flex-1" label={t('imports.category')} value={row.item.category}
                      onChangeText={(category) => updateItem(row.item.id, { category })} editable={editable} />
                    <Input containerClassName="w-28" label={t('imports.basePrice')} value={row.price} keyboardType="decimal-pad"
                      onChangeText={(price) => update(row.item.id, { price })} error={isValidPriceInput(row.price) ? undefined : ' '}
                      editable={editable} />
                  </View>
                  <Input label={t('imports.description')} value={row.item.description ?? ''} multiline editable={editable}
                    onChangeText={(description) => updateItem(row.item.id, { description: description || null })} />
                  <Input label={t('imports.sizes')} hint={t('imports.sizesHint')} value={row.sizes} editable={editable}
                    onChangeText={(sizes) => update(row.item.id, { sizes })} />
                  <Input label={t('imports.extras')} hint={t('imports.extrasHint')} value={row.extras} editable={editable}
                    onChangeText={(extras) => update(row.item.id, { extras })} />
                </Card>
              ))}
            </View>
          )}

          {editable ? (
            <View className="gap-3">
              <Button label={t('imports.addRow')} icon={Plus} variant="secondary"
                onPress={() => setRows((r) => [...r, toRow(blankDraftItem(categories[0]))])} />
              <InlineError message={error} />
              <Button label={t('imports.saveDraft')} icon={Save} variant="outline" disabled={!dirty} loading={saveDraft.isPending}
                onPress={save} />
              <Button label={t('imports.publish')} icon={CheckCircle2} size="lg" loading={approve.isPending}
                onPress={() => setPublishOpen(true)} />
              <Button label={t('imports.reject')} icon={Ban} variant="dangerOutline" onPress={() => setRejectOpen(true)} />
            </View>
          ) : null}

          {unparsed.length ? (
            <View>
              <SectionTitle title={`${t('imports.unparsed')} (${unparsed.length})`} />
              <Card className="gap-1">
                {unparsed.slice(0, 40).map((line, i) => (
                  <Text key={i} variant="small" tone="muted">
                    {line}
                  </Text>
                ))}
              </Card>
            </View>
          ) : null}
        </View>
      )}

      <ConfirmDialog
        visible={publishOpen}
        title={t('imports.publish')}
        message={t('imports.publishMode')}
        confirmLabel={t('imports.publish')}
        loading={approve.isPending || saveDraft.isPending}
        onCancel={() => setPublishOpen(false)}
        onConfirm={() => publish(false)}
      >
        <View className="gap-2">
          <SelectRow label={t('imports.replace')} hint={t('imports.replaceHint')} selected={mode === 'replace'} onPress={() => setMode('replace')} />
          <SelectRow label={t('imports.merge')} hint={t('imports.mergeHint')} selected={mode === 'merge'} onPress={() => setMode('merge')} />
        </View>
      </ConfirmDialog>
      <ConfirmDialog
        visible={confirmReplace !== null}
        title={t('imports.replace')}
        message={t('imports.confirmReplace', { count: confirmReplace ?? 0 })}
        destructive
        confirmLabel={t('imports.publish')}
        loading={approve.isPending}
        onCancel={() => setConfirmReplace(null)}
        onConfirm={() => publish(true)}
      />
      <ConfirmDialog
        visible={rejectOpen}
        title={t('imports.reject')}
        message={t('imports.rejectConfirm')}
        destructive
        loading={reject.isPending}
        onCancel={() => setRejectOpen(false)}
        onConfirm={() =>
          reject.mutate(undefined, {
            onSuccess: () => {
              setRejectOpen(false);
              router.back();
            },
          })
        }
      />
    </Screen>
  );
}
