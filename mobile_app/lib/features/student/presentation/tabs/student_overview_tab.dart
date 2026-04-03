import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../student_providers.dart';
import '../ui/student_ui_kit.dart';

class StudentOverviewTab extends ConsumerWidget {
  const StudentOverviewTab({
    super.key,
    required this.quickQrWidget,
  });

  final Widget quickQrWidget;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
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
            onRetryProfile: () => ref.invalidate(studentProfileProvider),
            onRetrySummary: () => ref.invalidate(studentAttendanceSummaryProvider),
          ),
          const SizedBox(height: 12),
          _KpiGrid(
            summaryAsync: summaryAsync,
            scheduleAsync: scheduleAsync,
            leavesAsync: leavesAsync,
            onRetrySummary: () => ref.invalidate(studentAttendanceSummaryProvider),
            onRetrySchedule: () => ref.invalidate(studentTodayScheduleProvider),
            onRetryLeaves: () => ref.invalidate(studentLeaveRequestsProvider),
          ),
          const SizedBox(height: 12),
          StudentSectionCard(
            title: 'Next Class',
            child: scheduleAsync.when(
              data: (schedule) {
                if (schedule.isEmpty) {
                  return const Text('No classes scheduled today');
                }
                final next = schedule.first;
                return ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(next.subjectName),
                  subtitle: Text('Period ${next.period} • ${next.facultyName}'),
                  trailing: next.isSubstitution
                      ? const StudentStatusChip(status: 'Substitution')
                      : null,
                );
              },
              loading: () => const StudentLoadingState(),
              error: (e, _) => StudentErrorState(
                message: e.toString(),
                onRetry: () => ref.invalidate(studentTodayScheduleProvider),
              ),
            ),
          ),
          const SizedBox(height: 12),
          quickQrWidget,
        ],
      ),
    );
  }
}

class _HeroHeader extends StatelessWidget {
  const _HeroHeader({
    required this.profileAsync,
    required this.summaryAsync,
    required this.onRetryProfile,
    required this.onRetrySummary,
  });

  final AsyncValue<dynamic> profileAsync;
  final AsyncValue<dynamic> summaryAsync;
  final VoidCallback onRetryProfile;
  final VoidCallback onRetrySummary;

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
                'Hello, ${profile.name}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                ),
              ),
              loading: () => const Text('Loading profile...', style: TextStyle(color: Colors.white70)),
              error: (e, _) => StudentErrorState(
                message: e.toString(),
                onRetry: onRetryProfile,
              ),
            ),
            const SizedBox(height: 6),
            summaryAsync.when(
              data: (bundle) => Text(
                'Attendance: ${bundle.overall.attendancePercentage.toStringAsFixed(1)}%',
                style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
              ),
              loading: () => const Text('Loading attendance...', style: TextStyle(color: Colors.white70)),
              error: (e, _) => StudentErrorState(
                message: e.toString(),
                onRetry: onRetrySummary,
              ),
            ),
          ],
        ),
      ),
    );
  }
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
            loading: () => const StudentMetricPill(label: 'Present', value: '...', color: Colors.green),
            error: (e, _) => StudentErrorState(message: e.toString(), onRetry: onRetrySummary),
          ),
          scheduleAsync.when(
            data: (schedule) => StudentMetricPill(
              label: 'Classes',
              value: '${schedule.length}',
              color: Colors.indigo,
            ),
            loading: () => const StudentMetricPill(label: 'Classes', value: '...', color: Colors.indigo),
            error: (e, _) => StudentErrorState(message: e.toString(), onRetry: onRetrySchedule),
          ),
          leavesAsync.when(
            data: (leaves) {
              final pending = leaves.where((l) => l.status.toLowerCase() == 'pending').length;
              return StudentMetricPill(label: 'Pending Leave', value: '$pending', color: Colors.orange);
            },
            loading: () => const StudentMetricPill(label: 'Pending Leave', value: '...', color: Colors.orange),
            error: (e, _) => StudentErrorState(message: e.toString(), onRetry: onRetryLeaves),
          ),
        ],
      ),
    );
  }
}
