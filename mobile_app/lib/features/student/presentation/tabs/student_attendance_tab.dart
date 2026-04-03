import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../domain/student_models.dart';
import '../student_providers.dart';
import '../ui/student_ui_kit.dart';

class StudentAttendanceTab extends ConsumerWidget {
  const StudentAttendanceTab({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(studentAttendanceFilterProvider);
    final summaryAsync = ref.watch(studentFilteredAttendanceSummaryProvider);
    final recordsAsync = ref.watch(studentFilteredAttendanceRecordsProvider);

    final profileSubjects = ref.watch(studentProfileProvider).valueOrNull?.subjects ?? const <StudentSubject>[];
    final classSubjects = ref.watch(studentClassSubjectsProvider).valueOrNull ?? const <StudentSubject>[];
    final subjectOptions = _mergeSubjectOptions(profileSubjects, classSubjects);

    return StudentTabContainer(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          StudentSectionCard(
            title: 'Filters',
            child: Column(
              children: [
                Row(
                  children: [
                    ChoiceChip(
                      label: const Text('Single Date'),
                      selected: filter.mode == AttendanceFilterMode.single,
                      onSelected: (_) {
                        final day = DateTime(filter.startDate.year, filter.startDate.month, filter.startDate.day);
                        ref.read(studentAttendanceFilterProvider.notifier).state =
                            filter.copyWith(mode: AttendanceFilterMode.single, startDate: day, endDate: day);
                      },
                    ),
                    const SizedBox(width: 8),
                    ChoiceChip(
                      label: const Text('Date Range'),
                      selected: filter.mode == AttendanceFilterMode.range,
                      onSelected: (_) {
                        ref.read(studentAttendanceFilterProvider.notifier).state =
                            filter.copyWith(mode: AttendanceFilterMode.range);
                      },
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: () => _pickDates(context, ref, filter),
                        icon: const Icon(Icons.date_range),
                        label: Text(_dateFilterLabel(filter)),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    _PresetChip(label: 'Today', onTap: () => _applyPreset(ref, _AttendancePreset.today)),
                    _PresetChip(label: 'Yesterday', onTap: () => _applyPreset(ref, _AttendancePreset.yesterday)),
                    _PresetChip(label: 'Last 7 Days', onTap: () => _applyPreset(ref, _AttendancePreset.last7Days)),
                    _PresetChip(label: 'This Month', onTap: () => _applyPreset(ref, _AttendancePreset.thisMonth)),
                  ],
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  initialValue: filter.subjectId ?? '',
                  decoration: const InputDecoration(labelText: 'Subject'),
                  items: [
                    const DropdownMenuItem(value: '', child: Text('All subjects')),
                    ...subjectOptions.map(
                      (s) => DropdownMenuItem(
                        value: s.id,
                        child: Text('${s.subjectName} (${s.subjectCode})'),
                      ),
                    ),
                  ],
                  onChanged: (value) {
                    final selected = (value ?? '').trim();
                    ref.read(studentAttendanceFilterProvider.notifier).state =
                        filter.copyWith(subjectId: selected.isEmpty ? null : selected);
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          StudentSectionCard(
            title: 'Attendance Snapshot',
            child: summaryAsync.when(
              data: (bundle) {
                final records = recordsAsync.valueOrNull ?? const <AttendanceRecord>[];
                final present = records.where((r) => r.status.toLowerCase() == 'present').length;
                final absent = records.where((r) => r.status.toLowerCase() == 'absent').length;
                final late = records.where((r) => r.status.toLowerCase() == 'late').length;
                final total = records.length;

                return Wrap(
                  spacing: 12,
                  runSpacing: 12,
                  children: [
                    const StudentMetricPill(label: 'Total', value: '0', color: Colors.indigo),
                    StudentMetricPill(label: 'Present', value: '$present', color: Colors.green),
                    StudentMetricPill(label: 'Absent', value: '$absent', color: Colors.red),
                    StudentMetricPill(label: 'Late', value: '$late', color: Colors.orange),
                    StudentMetricPill(
                      label: 'Attendance %',
                      value: '${bundle.overall.attendancePercentage.toStringAsFixed(1)}%',
                      color: Colors.blue,
                    ),
                  ].map((pill) {
                    if (pill.label == 'Total') {
                      return StudentMetricPill(label: 'Total', value: '$total', color: Colors.indigo);
                    }
                    return pill;
                  }).toList(growable: false),
                );
              },
              loading: () => const StudentLoadingState(),
              error: (e, _) => StudentErrorState(message: e.toString()),
            ),
          ),
          const SizedBox(height: 12),
          StudentSectionCard(
            title: 'Records',
            child: recordsAsync.when(
              data: (records) {
                if (records.isEmpty) {
                  return const Text('No attendance records found for selected dates.');
                }

                final grouped = <String, List<AttendanceRecord>>{};
                for (final record in records) {
                  final key = record.date == null ? 'Unknown Date' : DateFormat('dd MMM yyyy').format(record.date!);
                  grouped.putIfAbsent(key, () => <AttendanceRecord>[]).add(record);
                }

                final entries = grouped.entries.toList(growable: false);
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: entries.map((entry) {
                    final dayRecords = entry.value..sort((a, b) => a.period.compareTo(b.period));
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 10),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(entry.key, style: const TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 4),
                          ...dayRecords.map(
                            (r) => ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              title: Text('${r.subjectName} (${r.subjectCode})'),
                              subtitle: Text('Period ${r.period}'),
                              trailing: StudentStatusChip(status: r.status),
                            ),
                          ),
                        ],
                      ),
                    );
                  }).toList(growable: false),
                );
              },
              loading: () => const StudentLoadingState(),
              error: (e, _) => StudentErrorState(message: e.toString()),
            ),
          ),
        ],
      ),
    );
  }

  List<StudentSubject> _mergeSubjectOptions(List<StudentSubject> a, List<StudentSubject> b) {
    final map = <String, StudentSubject>{};
    for (final s in a) {
      if (s.id.isNotEmpty) map[s.id] = s;
    }
    for (final s in b) {
      if (s.id.isNotEmpty && !map.containsKey(s.id)) map[s.id] = s;
    }
    return map.values.toList(growable: false);
  }

  Future<void> _pickDates(BuildContext context, WidgetRef ref, AttendanceFilterState filter) async {
    if (filter.mode == AttendanceFilterMode.single) {
      final picked = await showDatePicker(
        context: context,
        initialDate: filter.startDate,
        firstDate: DateTime.now().subtract(const Duration(days: 365 * 2)),
        lastDate: DateTime.now().add(const Duration(days: 365)),
      );
      if (picked == null) return;
      final day = DateTime(picked.year, picked.month, picked.day);
      ref.read(studentAttendanceFilterProvider.notifier).state = filter.copyWith(startDate: day, endDate: day);
      return;
    }

    final pickedRange = await showDateRangePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 365 * 2)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
      initialDateRange: DateTimeRange(start: filter.startDate, end: filter.endDate),
    );
    if (pickedRange == null) return;

    final start = DateTime(pickedRange.start.year, pickedRange.start.month, pickedRange.start.day);
    final end = DateTime(pickedRange.end.year, pickedRange.end.month, pickedRange.end.day);
    ref.read(studentAttendanceFilterProvider.notifier).state = filter.copyWith(startDate: start, endDate: end);
  }

  String _dateFilterLabel(AttendanceFilterState filter) {
    if (filter.mode == AttendanceFilterMode.single) {
      return DateFormat('dd MMM yyyy').format(filter.startDate);
    }
    return '${DateFormat('dd MMM').format(filter.startDate)} - ${DateFormat('dd MMM yyyy').format(filter.endDate)}';
  }

  void _applyPreset(WidgetRef ref, _AttendancePreset preset) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final current = ref.read(studentAttendanceFilterProvider);

    AttendanceFilterState next;
    switch (preset) {
      case _AttendancePreset.today:
        next = AttendanceFilterState(
          mode: AttendanceFilterMode.single,
          startDate: today,
          endDate: today,
          subjectId: current.subjectId,
        );
        break;
      case _AttendancePreset.yesterday:
        final day = today.subtract(const Duration(days: 1));
        next = AttendanceFilterState(
          mode: AttendanceFilterMode.single,
          startDate: day,
          endDate: day,
          subjectId: current.subjectId,
        );
        break;
      case _AttendancePreset.last7Days:
        next = AttendanceFilterState(
          mode: AttendanceFilterMode.range,
          startDate: today.subtract(const Duration(days: 6)),
          endDate: today,
          subjectId: current.subjectId,
        );
        break;
      case _AttendancePreset.thisMonth:
        next = AttendanceFilterState(
          mode: AttendanceFilterMode.range,
          startDate: DateTime(today.year, today.month, 1),
          endDate: today,
          subjectId: current.subjectId,
        );
        break;
    }

    ref.read(studentAttendanceFilterProvider.notifier).state = next;
  }
}

enum _AttendancePreset { today, yesterday, last7Days, thisMonth }

class _PresetChip extends StatelessWidget {
  const _PresetChip({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ActionChip(label: Text(label), onPressed: onTap);
  }
}
