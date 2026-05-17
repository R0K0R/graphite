import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../domain/usecases/rectangle_layout_config.dart';
import 'graphite_settings.dart';

const _keyThemeMode = 'graphite_theme_mode';
const _keyMinGap = 'graphite_layout_min_gap';
const _keyTransientIter = 'graphite_layout_transient_iter';
const _keyFinalizeIter = 'graphite_layout_finalize_iter';
const _keyCutoffMul = 'graphite_layout_cutoff_mul';
const _keyFoldersObstacle = 'graphite_layout_folders_obstacle';
const _keyFolderInflate = 'graphite_layout_folder_inflate';
const _keyBounce = 'graphite_visual_bounce';

final graphiteSettingsNotifierProvider =
    NotifierProvider<GraphiteSettingsNotifier, GraphiteSettings>(
  GraphiteSettingsNotifier.new,
);

final rectangleLayoutConfigProvider = Provider<RectangleLayoutConfig>((ref) {
  return ref.watch(graphiteSettingsNotifierProvider).layout;
});

class GraphiteSettingsNotifier extends Notifier<GraphiteSettings> {
  SharedPreferences? _prefs;

  @override
  GraphiteSettings build() {
    Future<void>.microtask(_ensureLoaded);
    return GraphiteSettings.initial;
  }

  Future<void> _ensureLoaded() async {
    _prefs ??= await SharedPreferences.getInstance();
    state = _load(_prefs!);
  }

  GraphiteSettings _load(SharedPreferences p) {
    final int tm = p.getInt(_keyThemeMode) ?? 0;
    return GraphiteSettings(
      themeMode: switch (tm) {
        1 => ThemeMode.light,
        2 => ThemeMode.dark,
        _ => ThemeMode.system,
      },
      layout: RectangleLayoutConfig(
        minSeparationGap: p.getDouble(_keyMinGap) ?? 24,
        transientIterations:
            p.getInt(_keyTransientIter) == null
                ? RectangleLayoutConfig.defaults.transientIterations
                : p.getInt(_keyTransientIter)!.clamp(1, 32).toInt(),
        finalizeIterations:
            p.getInt(_keyFinalizeIter) == null
                ? RectangleLayoutConfig.defaults.finalizeIterations
                : p.getInt(_keyFinalizeIter)!.clamp(4, 64).toInt(),
        maxDisplacementPerIteration:
            RectangleLayoutConfig.defaults.maxDisplacementPerIteration,
        spatialCutoffMultiplier:
            p.getDouble(_keyCutoffMul) ??
            RectangleLayoutConfig.defaults.spatialCutoffMultiplier,
        treatFoldersAsObstacles: p.getBool(_keyFoldersObstacle) ??
            RectangleLayoutConfig.defaults.treatFoldersAsObstacles,
        folderExtraInflate: p.getDouble(_keyFolderInflate) ??
            RectangleLayoutConfig.defaults.folderExtraInflate,
      ),
      enableRepelBounce:
          p.getBool(_keyBounce) ?? GraphiteSettings.initial.enableRepelBounce,
    );
  }

  Future<void> refresh() async {
    _prefs ??= await SharedPreferences.getInstance();
    state = _load(_prefs!);
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    _prefs = prefs;
    final int v = switch (mode) {
      ThemeMode.light => 1,
      ThemeMode.dark => 2,
      _ => 0,
    };
    await prefs.setInt(_keyThemeMode, v);
    state = state.copyWith(themeMode: mode);
  }

  Future<void> setLayout(RectangleLayoutConfig layout) async {
    final prefs = await SharedPreferences.getInstance();
    _prefs = prefs;
    await prefs.setDouble(_keyMinGap, layout.minSeparationGap);
    await prefs.setInt(_keyTransientIter, layout.transientIterations);
    await prefs.setInt(_keyFinalizeIter, layout.finalizeIterations);
    await prefs.setDouble(_keyCutoffMul, layout.spatialCutoffMultiplier);
    await prefs.setBool(_keyFoldersObstacle, layout.treatFoldersAsObstacles);
    await prefs.setDouble(_keyFolderInflate, layout.folderExtraInflate);
    state = state.copyWith(layout: layout);
  }

  Future<void> setEnableRepelBounce(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    _prefs = prefs;
    await prefs.setBool(_keyBounce, value);
    state = state.copyWith(enableRepelBounce: value);
  }
}
