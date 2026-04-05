import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../student_providers.dart';
import '../ui/student_ui_kit.dart';

class StudentOverviewTab extends ConsumerStatefulWidget {
  const StudentOverviewTab({
    super.key,
    required this.quickQrWidget,
    required this.onQuickScanQr,
    required this.onOpenTab,
  });

  final Widget quickQrWidget;
  final VoidCallback onQuickScanQr;
  final ValueChanged<int> onOpenTab;

  @override
  ConsumerState<StudentOverviewTab> createState() => _StudentOverviewTabState();
}

class _StudentOverviewTabState extends ConsumerState<StudentOverviewTab> {
  static const _quickActionPrefKey = 'student_home_quick_actions';
  static const List<String> _defaultQuickActionIds = [
    'scan_qr',
    'today_schedule',
    'attendance',
  ];

  static const List<_QuickActionOption> _allQuickActionOptions = [
    _QuickActionOption(
      id: 'scan_qr',
      label: 'Scan QR',
      icon: Icons.qr_code_scanner,
    ),
    _QuickActionOption(
      id: 'today_schedule',
      label: 'Today Schedule',
      icon: Icons.schedule,
    ),
    _QuickActionOption(
      id: 'attendance',
      label: 'Attendance',
      icon: Icons.analytics,
    ),
    _QuickActionOption(
      id: 'timetable',
      label: 'Timetable',
      icon: Icons.calendar_month,
    ),
    _QuickActionOption(id: 'messages', label: 'Messages', icon: Icons.forum),
    _QuickActionOption(id: 'leave', label: 'Leave', icon: Icons.assignment),
  ];

  List<String> _selectedQuickActionIds = _defaultQuickActionIds;

  @override
  void initState() {
    super.initState();
    _loadQuickActionPrefs();
  }

  Future<void> _loadQuickActionPrefs() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getStringList(_quickActionPrefKey);
    if (stored == null || stored.isEmpty) return;

    final validIds = _allQuickActionOptions.map((e) => e.id).toSet();
    final filtered = stored.where(validIds.contains).toList(growable: false);
    if (filtered.isEmpty) return;

    if (!mounted) return;
    setState(() {
      _selectedQuickActionIds = filtered;
    });
  }

  Future<void> _saveQuickActionPrefs(List<String> ids) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_quickActionPrefKey, ids);
  }

  void _handleQuickActionTap(String actionId) {
    switch (actionId) {
      case 'scan_qr':
        widget.onQuickScanQr();
        break;
      case 'today_schedule':
      case 'timetable':
        widget.onOpenTab(2);
        break;
      case 'attendance':
        widget.onOpenTab(1);
        break;
      case 'messages':
        widget.onOpenTab(4);
        break;
      case 'leave':
        widget.onOpenTab(5);
        break;
      default:
        break;
    }
  }

  _QuickActionOption? _optionById(String id) {
    for (final option in _allQuickActionOptions) {
      if (option.id == id) return option;
    }
    return null;
  }

  Future<void> _openQuickActionCustomizer() async {
    final tempSelection = List<String>.from(_selectedQuickActionIds);

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setModalState) {
            return Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Customize Quick Actions',
                    style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'Pick actions to show on Home. At least one action is required.',
                  ),
                  const SizedBox(height: 12),
                  ..._allQuickActionOptions.map((option) {
                    final selected = tempSelection.contains(option.id);
                    return CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: selected,
                      title: Text(option.label),
                      secondary: Icon(option.icon),
                      onChanged: (checked) {
                        setModalState(() {
                          if (checked == true) {
                            if (!tempSelection.contains(option.id)) {
                              tempSelection.add(option.id);
                            }
                          } else {
                            tempSelection.remove(option.id);
                          }
                        });
                      },
                    );
                  }),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.of(ctx).pop(),
                          child: const Text('Cancel'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: FilledButton(
                          onPressed: tempSelection.isEmpty
                              ? null
                              : () async {
                                  setState(() {
                                    _selectedQuickActionIds = List<String>.from(
                                      tempSelection,
                                    );
                                  });
                                  await _saveQuickActionPrefs(
                                    _selectedQuickActionIds,
                                  );
                                  if (!ctx.mounted) return;
                                  Navigator.of(ctx).pop();
                                },
                          child: const Text('Save'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            );
          },
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(studentProfileProvider);
    final summaryAsync = ref.watch(studentAttendanceSummaryProvider);
    final scheduleAsync = ref.watch(studentTodayScheduleProvider);
    final leavesAsync = ref.watch(studentLeaveRequestsProvider);

    return StudentTabContainer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _HeroHeader(
            profileAsync: profileAsync,
            summaryAsync: summaryAsync,
            scheduleAsync: scheduleAsync,
            onRetryProfile: () => ref.invalidate(studentProfileProvider),
            onRetrySummary: () =>
                ref.invalidate(studentAttendanceSummaryProvider),
            onRetrySchedule: () => ref.invalidate(studentTodayScheduleProvider),
          ),
          const SizedBox(height: 12),
          StudentSectionCard(
            title: 'Quick Actions',
            trailing: IconButton(
              tooltip: 'Customize Quick Actions',
              onPressed: _openQuickActionCustomizer,
              icon: const Icon(Icons.tune),
            ),
            child: Wrap(
              spacing: 10,
              runSpacing: 10,
              children: _selectedQuickActionIds
                  .map((id) {
                    final option = _optionById(id);
                    if (option == null) {
                      return const SizedBox.shrink();
                    }
                    return _QuickActionChip(
                      icon: option.icon,
                      label: option.label,
                      onTap: () => _handleQuickActionTap(option.id),
                    );
                  })
                  .toList(growable: false),
            ),
          ),
          const SizedBox(height: 12),
          _KpiGrid(
            summaryAsync: summaryAsync,
            scheduleAsync: scheduleAsync,
            leavesAsync: leavesAsync,
            onRetrySummary: () =>
                ref.invalidate(studentAttendanceSummaryProvider),
            onRetrySchedule: () => ref.invalidate(studentTodayScheduleProvider),
            onRetryLeaves: () => ref.invalidate(studentLeaveRequestsProvider),
          ),
          const SizedBox(height: 12),
          _TodayCompleteScheduleSection(
            scheduleAsync: scheduleAsync,
            onRetrySchedule: () => ref.invalidate(studentTodayScheduleProvider),
          ),
          const SizedBox(height: 12),
          widget.quickQrWidget,
        ],
      ),
    );
  }
}

class _HeroHeader extends StatelessWidget {
  const _HeroHeader({
    required this.profileAsync,
    required this.summaryAsync,
    required this.scheduleAsync,
    required this.onRetryProfile,
    required this.onRetrySummary,
    required this.onRetrySchedule,
  });

  final AsyncValue<dynamic> profileAsync;
  final AsyncValue<dynamic> summaryAsync;
  final AsyncValue<dynamic> scheduleAsync;
  final VoidCallback onRetryProfile;
  final VoidCallback onRetrySummary;
  final VoidCallback onRetrySchedule;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [Color(0xFF007BFF), Color(0xFF005FCC)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            profileAsync.when(
              data: (profile) => Text(
                '${_greetingForNow()}, ${profile.name}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              loading: () => const Text(
                'Loading profile...',
                style: TextStyle(color: Colors.white70),
              ),
              error: (e, _) => StudentErrorState(
                message: e.toString(),
                onRetry: onRetryProfile,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Stay consistent today. Your dashboard is ready.',
              style: TextStyle(color: Colors.white.withValues(alpha: 0.88)),
            ),
            const SizedBox(height: 10),
            summaryAsync.when(
              data: (bundle) => Text(
                'Attendance: ${bundle.overall.attendancePercentage.toStringAsFixed(1)}%',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w600,
                ),
              ),
              loading: () => const Text(
                'Loading attendance...',
                style: TextStyle(color: Colors.white70),
              ),
              error: (e, _) => StudentErrorState(
                message: e.toString(),
                onRetry: onRetrySummary,
              ),
            ),
            const SizedBox(height: 6),
            scheduleAsync.when(
              data: (schedule) => Text(
                schedule.isEmpty
                    ? 'No classes scheduled for today.'
                    : 'You have ${schedule.length} class(es) today.',
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.9),
                  fontWeight: FontWeight.w500,
                ),
              ),
              loading: () => const Text(
                'Loading schedule...',
                style: TextStyle(color: Colors.white70),
              ),
              error: (e, _) => StudentErrorState(
                message: e.toString(),
                onRetry: onRetrySchedule,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TodayCompleteScheduleSection extends StatelessWidget {
  const _TodayCompleteScheduleSection({
    required this.scheduleAsync,
    required this.onRetrySchedule,
  });

  final AsyncValue<dynamic> scheduleAsync;
  final VoidCallback onRetrySchedule;

  @override
  Widget build(BuildContext context) {
    return StudentSectionCard(
      title: 'Today\'s Complete Schedule',
      child: scheduleAsync.when(
        data: (schedule) {
          if (schedule.isEmpty) {
            return const Text('No classes scheduled today');
          }

          return Column(
            children: (schedule as List)
                .map(
                  (item) => Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Colors.indigo.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: Colors.indigo.withValues(alpha: 0.15),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        CircleAvatar(
                          radius: 16,
                          backgroundColor: Colors.indigo.withValues(
                            alpha: 0.14,
                          ),
                          child: Text(
                            '${item.period}',
                            style: const TextStyle(fontWeight: FontWeight.w700),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.subjectName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text('Faculty: ${item.facultyName}'),
                              if ((item.subjectCode as String).isNotEmpty)
                                Text(
                                  item.subjectCode,
                                  style: TextStyle(color: Colors.grey.shade700),
                                ),
                            ],
                          ),
                        ),
                        if (item.isSubstitution == true)
                          const StudentStatusChip(status: 'Substitution'),
                      ],
                    ),
                  ),
                )
                .toList(growable: false),
          );
        },
        loading: () => const StudentLoadingState(),
        error: (e, _) =>
            StudentErrorState(message: e.toString(), onRetry: onRetrySchedule),
      ),
    );
  }
}

class _QuickActionChip extends StatelessWidget {
  const _QuickActionChip({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(999),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.blueGrey.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.blueGrey.withValues(alpha: 0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 16),
            const SizedBox(width: 6),
            Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ),
      ),
    );
  }
}

class _QuickActionOption {
  const _QuickActionOption({
    required this.id,
    required this.label,
    required this.icon,
  });

  final String id;
  final String label;
  final IconData icon;
}

String _greetingForNow() {
  final hour = DateTime.now().hour;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

class _KpiGrid extends StatelessWidget {
  const _KpiGrid({
    required this.summaryAsync,
    required this.scheduleAsync,
    required this.leavesAsync,
    required this.onRetrySummary,
    required this.onRetrySchedule,
    required this.onRetryLeaves,
  });

  final AsyncValue<dynamic> summaryAsync;
  final AsyncValue<dynamic> scheduleAsync;
  final AsyncValue<dynamic> leavesAsync;
  final VoidCallback onRetrySummary;
  final VoidCallback onRetrySchedule;
  final VoidCallback onRetryLeaves;

  @override
  Widget build(BuildContext context) {
    return StudentSectionCard(
      title: 'Today Overview',
      child: Wrap(
        spacing: 10,
        runSpacing: 10,
        children: [
          summaryAsync.when(
            data: (bundle) => StudentMetricPill(
              label: 'Present',
              value: '${bundle.overall.totalPresent}',
              color: Colors.green,
            ),
            loading: () => const StudentMetricPill(
              label: 'Present',
              value: '...',
              color: Colors.green,
            ),
            error: (e, _) => StudentErrorState(
              message: e.toString(),
              onRetry: onRetrySummary,
            ),
          ),
          scheduleAsync.when(
            data: (schedule) => StudentMetricPill(
              label: 'Classes',
              value: '${schedule.length}',
              color: Colors.indigo,
            ),
            loading: () => const StudentMetricPill(
              label: 'Classes',
              value: '...',
              color: Colors.indigo,
            ),
            error: (e, _) => StudentErrorState(
              message: e.toString(),
              onRetry: onRetrySchedule,
            ),
          ),
          leavesAsync.when(
            data: (leaves) {
              final pending = leaves
                  .where((l) => l.status.toLowerCase() == 'pending')
                  .length;
              return StudentMetricPill(
                label: 'Pending Leave',
                value: '$pending',
                color: Colors.orange,
              );
            },
            loading: () => const StudentMetricPill(
              label: 'Pending Leave',
              value: '...',
              color: Colors.orange,
            ),
            error: (e, _) => StudentErrorState(
              message: e.toString(),
              onRetry: onRetryLeaves,
            ),
          ),
        ],
      ),
    );
  }
}
