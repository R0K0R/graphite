import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'graphite_settings_provider.dart';

Future<void> showGraphiteSettingsSheet(BuildContext context) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => const _GraphiteSettingsBody(),
  );
}

class _GraphiteSettingsBody extends ConsumerWidget {
  const _GraphiteSettingsBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final settings = ref.watch(graphiteSettingsNotifierProvider);
    final notifier = ref.read(graphiteSettingsNotifierProvider.notifier);
    final lay = settings.layout;

    return Padding(
      padding: EdgeInsets.only(
        left: 20,
        right: 20,
        top: 8,
        bottom: MediaQuery.paddingOf(context).bottom + 20,
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: <Widget>[
            Text(
              'Settings',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 16),
            Text('Appearance', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            SegmentedButton<ThemeMode>(
              segments: const <ButtonSegment<ThemeMode>>[
                ButtonSegment(value: ThemeMode.system, label: Text('System')),
                ButtonSegment(value: ThemeMode.light, label: Text('Light')),
                ButtonSegment(value: ThemeMode.dark, label: Text('Dark')),
              ],
              selected: <ThemeMode>{settings.themeMode},
              onSelectionChanged: (s) {
                notifier.setThemeMode(s.first);
              },
            ),
            const SizedBox(height: 20),
            Text('Canvas repel', style: Theme.of(context).textTheme.titleSmall),
            const SizedBox(height: 8),
            Text('Min gap: ${lay.minSeparationGap.toStringAsFixed(0)} px'),
            Slider(
              value: lay.minSeparationGap.clamp(4, 120),
              min: 4,
              max: 120,
              divisions: 29,
              onChanged: (v) {
                notifier.setLayout(lay.copyWith(minSeparationGap: v));
              },
            ),
            Text('Drag iterations: ${lay.transientIterations}'),
            Slider(
              value: lay.transientIterations.toDouble(),
              min: 1,
              max: 24,
              divisions: 23,
              onChanged: (v) {
                notifier.setLayout(lay.copyWith(transientIterations: v.round()));
              },
            ),
            Text('Release iterations: ${lay.finalizeIterations}'),
            Slider(
              value: lay.finalizeIterations.toDouble(),
              min: 4,
              max: 48,
              divisions: 22,
              onChanged: (v) {
                notifier.setLayout(lay.copyWith(finalizeIterations: v.round()));
              },
            ),
            Text(
              'Pair cutoff × max diagonal: '
              '${lay.spatialCutoffMultiplier.toStringAsFixed(1)}',
            ),
            Slider(
              value: lay.spatialCutoffMultiplier.clamp(2, 20),
              min: 2,
              max: 20,
              divisions: 18,
              onChanged: (v) {
                notifier.setLayout(lay.copyWith(spatialCutoffMultiplier: v));
              },
            ),
            SwitchListTile(
              title: const Text('Treat folders as obstacles'),
              subtitle: const Text(
                'Keeps nodes from sliding under folder chrome.',
              ),
              value: lay.treatFoldersAsObstacles,
              onChanged: (v) {
                notifier.setLayout(lay.copyWith(treatFoldersAsObstacles: v));
              },
            ),
            Text(
              'Folder obstacle padding: '
              '${lay.folderExtraInflate.toStringAsFixed(0)}',
            ),
            Slider(
              value: lay.folderExtraInflate.clamp(0, 64),
              min: 0,
              max: 64,
              divisions: 32,
              onChanged: (v) {
                notifier.setLayout(lay.copyWith(folderExtraInflate: v));
              },
            ),
            const Divider(height: 32),
            SwitchListTile(
              title: const Text('Repel bounce (visual only)'),
              subtitle: const Text(
                'Short elastic animation when neighbours jump on release.',
              ),
              value: settings.enableRepelBounce,
              onChanged: notifier.setEnableRepelBounce,
            ),
          ],
        ),
      ),
    );
  }
}
