import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../auth/presentation/session_controller.dart';
import '../../faculty/data/faculty_repository.dart';
import '../../faculty/domain/models/faculty_models.dart';

final facultyRepositoryProvider = Provider<FacultyRepository>(
  (ref) => FacultyRepository(),
);

class FacultyHomeScreen extends ConsumerStatefulWidget {
  const FacultyHomeScreen({super.key});

  @override
  ConsumerState<FacultyHomeScreen> createState() => _FacultyHomeScreenState();
}

class _FacultyHomeScreenState extends ConsumerState<FacultyHomeScreen> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(sessionControllerProvider).session?.user;

    final pages = <Widget>[
      _FacultyDashboardTab(userName: user?.name ?? 'Faculty'),
      const _AttendanceActionsTab(),
      const _MessagesTab(),
      const _LeaveApprovalsTab(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: Text('Facultyapp | ${user?.name ?? ''}'),
        actions: [
          IconButton(
            tooltip: 'Profile',
            onPressed: () => context.push('/profile'),
            icon: const Icon(Icons.person_outline),
          ),
          IconButton(
            tooltip: 'Logout',
            onPressed: () =>
                ref.read(sessionControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: pages[_index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (value) => setState(() => _index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.how_to_reg_outlined),
            selectedIcon: Icon(Icons.how_to_reg),
            label: 'Attendance',
          ),
          NavigationDestination(
            icon: Icon(Icons.forum_outlined),
            selectedIcon: Icon(Icons.forum),
            label: 'Messages',
          ),
          NavigationDestination(
            icon: Icon(Icons.assignment_outlined),
            selectedIcon: Icon(Icons.assignment),
            label: 'Leaves',
          ),
        ],
      ),
    );
  }
}

class _FacultyDashboardTab extends ConsumerWidget {
  const _FacultyDashboardTab({required this.userName});

  final String userName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final token = ref.watch(sessionControllerProvider).session?.accessToken;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: ListTile(
            leading: const Icon(Icons.waving_hand),
            title: Text('Welcome, $userName'),
            subtitle: const Text(
              'Faculty dashboard is now active as a separate app.',
            ),
          ),
        ),
        const SizedBox(height: 12),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Today Timetable',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
                const SizedBox(height: 8),
                if (token == null || token.isEmpty)
                  const Text('Session expired. Please login again.')
                else
                  FutureBuilder<List<FacultyTimetableItem>>(
                    future: ref
                        .read(facultyRepositoryProvider)
                        .fetchTodaySchedule(accessToken: token),
                    builder: (context, snapshot) {
                      if (snapshot.connectionState == ConnectionState.waiting) {
                        return const Padding(
                          padding: EdgeInsets.all(8),
                          child: CircularProgressIndicator(),
                        );
                      }
                      if (snapshot.hasError) {
                        return Text(snapshot.error.toString());
                      }
                      final items =
                          snapshot.data ?? const <FacultyTimetableItem>[];
                      if (items.isEmpty) {
                        return const Text('No classes scheduled today.');
                      }

                      return Column(
                        children: items
                            .map(
                              (e) => ListTile(
                                dense: true,
                                contentPadding: EdgeInsets.zero,
                                leading: CircleAvatar(
                                  radius: 14,
                                  child: Text('${e.period}'),
                                ),
                                title: Text(e.subjectName),
                                subtitle: Text(
                                  '${e.className}${e.day.isEmpty ? '' : ' | ${e.day}'}',
                                ),
                              ),
                            )
                            .toList(growable: false),
                      );
                    },
                  ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _AttendanceActionsTab extends StatelessWidget {
  const _AttendanceActionsTab();

  @override
  Widget build(BuildContext context) {
    return const _ManualAttendanceTab();
  }
}

class _ManualAttendanceTab extends ConsumerStatefulWidget {
  const _ManualAttendanceTab();

  @override
  ConsumerState<_ManualAttendanceTab> createState() =>
      _ManualAttendanceTabState();
}

class _ManualAttendanceTabState extends ConsumerState<_ManualAttendanceTab> {
  static const String _notMarked = 'not_marked';

  bool _loading = true;
  bool _saving = false;
  String? _error;
  DateTime _selectedDate = DateTime.now();
  FacultyTimetableItem? _selectedSession;
  List<FacultyTimetableItem> _sessions = const [];
  List<FacultyClassStudent> _students = const [];
  final Map<String, String> _statusByStudent = {};

  @override
  void initState() {
    super.initState();
    _loadSessions();
  }

  Future<void> _loadSessions() async {
    final session = ref.read(sessionControllerProvider).session;
    if (session == null) {
      setState(() {
        _loading = false;
        _error = 'Session expired. Please login again.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final todaySessions = await ref
          .read(facultyRepositoryProvider)
          .fetchTodaySchedule(accessToken: session.accessToken);
      if (!mounted) return;

      final selected = todaySessions.isEmpty ? null : todaySessions.first;
      setState(() {
        _sessions = todaySessions;
        _selectedSession = selected;
      });

      if (selected != null) {
        await _loadStudentsAndAttendance(selected);
      } else {
        setState(() {
          _loading = false;
          _students = const [];
          _statusByStudent.clear();
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _loadStudentsAndAttendance(FacultyTimetableItem item) async {
    final session = ref.read(sessionControllerProvider).session;
    if (session == null) return;

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final students = await ref
          .read(facultyRepositoryProvider)
          .fetchClassStudents(
            accessToken: session.accessToken,
            classId: item.classId,
          );

      final existing = await ref
          .read(facultyRepositoryProvider)
          .fetchClassAttendance(
            accessToken: session.accessToken,
            classId: item.classId,
            subjectId: item.subjectId,
            date: _selectedDate,
            period: item.period,
          );

      final existingByStudent = <String, String>{
        for (final a in existing)
          if (a.studentId.isNotEmpty) a.studentId: a.status.toLowerCase(),
      };

      if (!mounted) return;
      setState(() {
        _students = students;
        _statusByStudent
          ..clear()
          ..addEntries(
            students.map(
              (s) => MapEntry(s.id, _normalizeStatus(existingByStudent[s.id])),
            ),
          );
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now().add(const Duration(days: 1)),
      initialDate: _selectedDate,
    );
    if (picked == null) return;
    setState(() => _selectedDate = picked);
    final selected = _selectedSession;
    if (selected != null) {
      await _loadStudentsAndAttendance(selected);
    }
  }

  Future<void> _submitAttendance() async {
    final selected = _selectedSession;
    final session = ref.read(sessionControllerProvider).session;
    if (selected == null || session == null || _statusByStudent.isEmpty) {
      return;
    }

    final markedStatuses = <String, String>{};
    for (final entry in _statusByStudent.entries) {
      if (entry.value != _notMarked) {
        markedStatuses[entry.key] = entry.value;
      }
    }

    if (markedStatuses.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('No students marked yet. Choose status before saving.'),
        ),
      );
      return;
    }

    setState(() => _saving = true);
    try {
      await ref
          .read(facultyRepositoryProvider)
          .bulkMarkAttendance(
            accessToken: session.accessToken,
            classId: selected.classId,
            subjectId: selected.subjectId,
            date: _selectedDate,
            period: selected.period,
            studentStatus: markedStatuses,
          );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Attendance saved successfully.')),
      );
      await _loadStudentsAndAttendance(selected);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    } finally {
      if (mounted) {
        setState(() => _saving = false);
      }
    }
  }

  String _dateLabel(DateTime date) {
    final mm = date.month.toString().padLeft(2, '0');
    final dd = date.day.toString().padLeft(2, '0');
    return '${date.year}-$mm-$dd';
  }

  String _normalizeStatus(String? value) {
    final normalized = (value ?? '').trim().toLowerCase();
    if (normalized == 'present' ||
        normalized == 'absent' ||
        normalized == 'late') {
      return normalized;
    }
    return _notMarked;
  }

  ({int present, int absent, int late, int notMarked}) _summaryCounts() {
    var present = 0;
    var absent = 0;
    var late = 0;
    var notMarked = 0;

    for (final status in _statusByStudent.values) {
      switch (status) {
        case 'present':
          present++;
          break;
        case 'absent':
          absent++;
          break;
        case 'late':
          late++;
          break;
        default:
          notMarked++;
          break;
      }
    }

    return (present: present, absent: absent, late: late, notMarked: notMarked);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if ((_error ?? '').isNotEmpty) {
      return Center(child: Text(_error!));
    }

    return RefreshIndicator(
      onRefresh: _loadSessions,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Manual Attendance Marking',
                    style: TextStyle(fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 10),
                  if (_sessions.isEmpty)
                    const Text('No timetable sessions found for today.')
                  else
                    DropdownButtonFormField<String>(
                      initialValue: _selectedSession?.id,
                      decoration: const InputDecoration(labelText: 'Session'),
                      items: _sessions
                          .map(
                            (s) => DropdownMenuItem<String>(
                              value: s.id,
                              child: Text(
                                'P${s.period} | ${s.className} | ${s.subjectName}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          )
                          .toList(growable: false),
                      onChanged: (value) async {
                        if (value == null) return;
                        final selected = _sessions.firstWhere(
                          (s) => s.id == value,
                        );
                        setState(() => _selectedSession = selected);
                        await _loadStudentsAndAttendance(selected);
                      },
                    ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text('Date: ${_dateLabel(_selectedDate)}'),
                      const Spacer(),
                      TextButton.icon(
                        onPressed: _pickDate,
                        icon: const Icon(Icons.calendar_today_outlined),
                        label: const Text('Change'),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          if (_students.isNotEmpty)
            Builder(
              builder: (context) {
                final summary = _summaryCounts();
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        Chip(label: Text('Present: ${summary.present}')),
                        Chip(label: Text('Absent: ${summary.absent}')),
                        Chip(label: Text('Late: ${summary.late}')),
                        Chip(label: Text('Not Marked: ${summary.notMarked}')),
                      ],
                    ),
                  ),
                );
              },
            ),
          if (_students.isNotEmpty) const SizedBox(height: 8),
          if (_students.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(12),
                child: Text('No students found for this class.'),
              ),
            )
          else
            ..._students.map(
              (student) => Card(
                margin: const EdgeInsets.only(bottom: 8),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        student.name.isEmpty ? 'Student' : student.name,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        student.uniqueId.isEmpty
                            ? student.email
                            : student.uniqueId,
                        style: TextStyle(color: Colors.grey.shade700),
                      ),
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 8,
                        runSpacing: 4,
                        children: [
                          _AttendanceRadioOption(
                            label: 'Not Marked',
                            value: _notMarked,
                            groupValue:
                                _statusByStudent[student.id] ?? _notMarked,
                            onChanged: (value) => setState(() {
                              _statusByStudent[student.id] = value;
                            }),
                          ),
                          _AttendanceRadioOption(
                            label: 'Present',
                            value: 'present',
                            groupValue:
                                _statusByStudent[student.id] ?? _notMarked,
                            onChanged: (value) => setState(() {
                              _statusByStudent[student.id] = value;
                            }),
                          ),
                          _AttendanceRadioOption(
                            label: 'Absent',
                            value: 'absent',
                            groupValue:
                                _statusByStudent[student.id] ?? _notMarked,
                            onChanged: (value) => setState(() {
                              _statusByStudent[student.id] = value;
                            }),
                          ),
                          _AttendanceRadioOption(
                            label: 'Late',
                            value: 'late',
                            groupValue:
                                _statusByStudent[student.id] ?? _notMarked,
                            onChanged: (value) => setState(() {
                              _statusByStudent[student.id] = value;
                            }),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _saving || _students.isEmpty ? null : _submitAttendance,
            icon: _saving
                ? const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.save_outlined),
            label: Text(_saving ? 'Saving...' : 'Save Attendance'),
          ),
        ],
      ),
    );
  }
}

class _AttendanceRadioOption extends StatelessWidget {
  const _AttendanceRadioOption({
    required this.label,
    required this.value,
    required this.groupValue,
    required this.onChanged,
  });

  final String label;
  final String value;
  final String groupValue;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(20),
      onTap: () => onChanged(value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: groupValue == value
                ? Theme.of(context).colorScheme.primary
                : Colors.grey,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Radio<String>(
              value: value,
              groupValue: groupValue,
              visualDensity: VisualDensity.compact,
              onChanged: (selected) {
                if (selected != null) onChanged(selected);
              },
            ),
            Text(label),
          ],
        ),
      ),
    );
  }
}

class _MessagesTab extends ConsumerStatefulWidget {
  const _MessagesTab();

  @override
  ConsumerState<_MessagesTab> createState() => _MessagesTabState();
}

class _MessagesTabState extends ConsumerState<_MessagesTab> {
  bool _loading = true;
  String? _error;
  List<FacultyConversationItem> _conversations = const [];
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _loadConversations();
    _pollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      _loadConversations(silent: true);
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadConversations({bool silent = false}) async {
    final session = ref.read(sessionControllerProvider).session;
    if (session == null) {
      setState(() {
        _loading = false;
        _error = 'Session expired. Please login again.';
      });
      return;
    }

    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final items = await ref
          .read(facultyRepositoryProvider)
          .fetchConversations(
            accessToken: session.accessToken,
            currentUserId: session.user.id,
          );
      if (!mounted) return;
      setState(() {
        _conversations = items;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (!silent) {
          _loading = false;
        }
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _startConversation() async {
    final session = ref.read(sessionControllerProvider).session;
    if (session == null) return;

    try {
      final users = await ref
          .read(facultyRepositoryProvider)
          .fetchMessagableUsers(accessToken: session.accessToken);

      if (!mounted) return;

      final selected = await showModalBottomSheet<FacultyMessagableUser>(
        context: context,
        isScrollControlled: true,
        useSafeArea: true,
        builder: (ctx) => _UserPickerSheet(users: users),
      );

      if (!mounted || selected == null) return;

      final conversationId = await ref
          .read(facultyRepositoryProvider)
          .getOrCreateConversation(
            accessToken: session.accessToken,
            receiverId: selected.id,
          );

      if (!mounted) return;
      await Navigator.of(context).push(
        MaterialPageRoute<void>(
          builder: (_) => _FacultyChatPage(
            conversationId: conversationId,
            receiverId: selected.id,
            receiverName: selected.name,
          ),
        ),
      );
      await _loadConversations();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if ((_error ?? '').isNotEmpty) {
      return Center(child: Text(_error!));
    }

    return RefreshIndicator(
      onRefresh: _loadConversations,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton.icon(
              onPressed: _startConversation,
              icon: const Icon(Icons.add_comment_outlined),
              label: const Text('New Conversation'),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: _conversations.isEmpty
                  ? const Text('No conversations yet')
                  : Column(
                      children: _conversations
                          .map(
                            (c) => ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              title: Text(c.displayName),
                              subtitle: Text(
                                c.lastMessage.isEmpty
                                    ? 'No messages yet'
                                    : c.lastMessage,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                              trailing: c.unreadCount > 0
                                  ? CircleAvatar(
                                      radius: 12,
                                      child: Text(
                                        '${c.unreadCount}',
                                        style: const TextStyle(fontSize: 11),
                                      ),
                                    )
                                  : const Icon(Icons.chevron_right),
                              onTap: c.otherParticipantId.isEmpty
                                  ? null
                                  : () async {
                                      await Navigator.of(context).push(
                                        MaterialPageRoute<void>(
                                          builder: (_) => _FacultyChatPage(
                                            conversationId: c.id,
                                            receiverId: c.otherParticipantId,
                                            receiverName: c.displayName,
                                          ),
                                        ),
                                      );
                                      await _loadConversations();
                                    },
                            ),
                          )
                          .toList(growable: false),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _LeaveApprovalsTab extends ConsumerStatefulWidget {
  const _LeaveApprovalsTab();

  @override
  ConsumerState<_LeaveApprovalsTab> createState() => _LeaveApprovalsTabState();
}

class _LeaveApprovalsTabState extends ConsumerState<_LeaveApprovalsTab> {
  bool _loading = true;
  String? _error;
  List<FacultyLeaveRequestItem> _items = const [];

  @override
  void initState() {
    super.initState();
    _loadLeaves();
  }

  Future<void> _loadLeaves() async {
    final session = ref.read(sessionControllerProvider).session;
    if (session == null) {
      setState(() {
        _loading = false;
        _error = 'Session expired. Please login again.';
      });
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final data = await ref
          .read(facultyRepositoryProvider)
          .fetchLeaveRequests(accessToken: session.accessToken);
      if (!mounted) return;
      setState(() {
        _loading = false;
        _items = data;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _updateStatus({
    required FacultyLeaveRequestItem item,
    required bool approve,
  }) async {
    final session = ref.read(sessionControllerProvider).session;
    if (session == null) return;

    try {
      if (approve) {
        await ref
            .read(facultyRepositoryProvider)
            .approveLeave(accessToken: session.accessToken, leaveId: item.id);
      } else {
        await ref
            .read(facultyRepositoryProvider)
            .rejectLeave(accessToken: session.accessToken, leaveId: item.id);
      }
      await _loadLeaves();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
      );
    }
  }

  String _formatDate(DateTime? value) {
    if (value == null) return '-';
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    final day = value.day.toString().padLeft(2, '0');
    return '$day ${months[value.month - 1]} ${value.year}';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if ((_error ?? '').isNotEmpty) {
      return Center(child: Text(_error!));
    }

    return RefreshIndicator(
      onRefresh: _loadLeaves,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          if (_items.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(14),
                child: Text('No leave requests found.'),
              ),
            )
          else
            ..._items.map((item) {
              final dateLabel = _formatDate(item.date);

              final isPending = item.status.toLowerCase() == 'pending';

              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        item.studentName.isEmpty ? 'Student' : item.studentName,
                        style: const TextStyle(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Class: ${item.className.isEmpty ? '-' : item.className}',
                      ),
                      Text(
                        'Subject: ${item.subjectName.isEmpty ? '-' : item.subjectName}',
                      ),
                      Text(
                        'Date: $dateLabel | Period: ${item.period == 0 ? '-' : item.period}',
                      ),
                      const SizedBox(height: 6),
                      Text('Reason: ${item.reason}'),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          Chip(label: Text(item.status.toUpperCase())),
                          const Spacer(),
                          if (isPending) ...[
                            OutlinedButton(
                              onPressed: () =>
                                  _updateStatus(item: item, approve: false),
                              child: const Text('Reject'),
                            ),
                            const SizedBox(width: 8),
                            FilledButton(
                              onPressed: () =>
                                  _updateStatus(item: item, approve: true),
                              child: const Text('Approve'),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}

class _UserPickerSheet extends StatefulWidget {
  const _UserPickerSheet({required this.users});

  final List<FacultyMessagableUser> users;

  @override
  State<_UserPickerSheet> createState() => _UserPickerSheetState();
}

class _UserPickerSheetState extends State<_UserPickerSheet> {
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final filtered = widget.users
        .where((u) {
          final q = _search.toLowerCase();
          if (q.isEmpty) return true;
          return u.name.toLowerCase().contains(q) ||
              u.email.toLowerCase().contains(q) ||
              u.role.toLowerCase().contains(q);
        })
        .toList(growable: false);

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        top: 16,
        bottom: 16 + MediaQuery.of(context).viewInsets.bottom,
      ),
      child: SizedBox(
        height: MediaQuery.of(context).size.height * 0.72,
        child: Column(
          children: [
            TextField(
              decoration: const InputDecoration(
                hintText: 'Search user',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (value) => setState(() => _search = value.trim()),
            ),
            const SizedBox(height: 12),
            Expanded(
              child: filtered.isEmpty
                  ? const Center(child: Text('No users found'))
                  : ListView.separated(
                      itemCount: filtered.length,
                      separatorBuilder: (_, _) => const Divider(height: 1),
                      itemBuilder: (context, index) {
                        final user = filtered[index];
                        return ListTile(
                          title: Text(user.name),
                          subtitle: Text('${user.role} | ${user.email}'),
                          onTap: () => Navigator.of(context).pop(user),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FacultyChatPage extends ConsumerStatefulWidget {
  const _FacultyChatPage({
    required this.conversationId,
    required this.receiverId,
    required this.receiverName,
  });

  final String conversationId;
  final String receiverId;
  final String receiverName;

  @override
  ConsumerState<_FacultyChatPage> createState() => _FacultyChatPageState();
}

class _FacultyChatPageState extends ConsumerState<_FacultyChatPage> {
  final _messageController = TextEditingController();
  final _scrollController = ScrollController();
  bool _loading = true;
  bool _sending = false;
  String? _error;
  List<FacultyChatMessage> _messages = const [];
  Timer? _pollTimer;

  @override
  void initState() {
    super.initState();
    _loadMessages();
    _pollTimer = Timer.periodic(const Duration(seconds: 4), (_) {
      _loadMessages(silent: true);
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _messageController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMessages({bool silent = false}) async {
    final session = ref.read(sessionControllerProvider).session;
    if (session == null) return;

    if (!silent) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }

    try {
      final items = await ref
          .read(facultyRepositoryProvider)
          .fetchMessages(
            accessToken: session.accessToken,
            conversationId: widget.conversationId,
          );
      if (!mounted) return;
      setState(() {
        _messages = items;
        _loading = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_scrollController.hasClients) return;
        _scrollController.jumpTo(_scrollController.position.maxScrollExtent);
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        if (!silent) {
          _loading = false;
        }
        _error = e.toString().replaceFirst('Exception: ', '');
      });
    }
  }

  Future<void> _send() async {
    final content = _messageController.text.trim();
    if (content.isEmpty || _sending) return;
    final session = ref.read(sessionControllerProvider).session;
    if (session == null) return;

    setState(() => _sending = true);
    try {
      await ref
          .read(facultyRepositoryProvider)
          .sendMessage(
            accessToken: session.accessToken,
            conversationId: widget.conversationId,
            receiverId: widget.receiverId,
            content: content,
          );
      _messageController.clear();
      await _loadMessages();
    } finally {
      if (mounted) {
        setState(() => _sending = false);
      }
    }
  }

  String _formatTime(DateTime? value) {
    if (value == null) return '--:--';
    var hour = value.hour;
    final minute = value.minute.toString().padLeft(2, '0');
    final suffix = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour == 0) hour = 12;
    final hh = hour.toString().padLeft(2, '0');
    return '$hh:$minute $suffix';
  }

  @override
  Widget build(BuildContext context) {
    final currentUserId =
        ref.watch(sessionControllerProvider).session?.user.id ?? '';

    return Scaffold(
      appBar: AppBar(title: Text(widget.receiverName)),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : (_error != null)
                ? Center(child: Text(_error!))
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.all(12),
                    itemCount: _messages.length,
                    itemBuilder: (context, index) {
                      final message = _messages[index];
                      final isMine = message.senderId == currentUserId;
                      return Align(
                        alignment: isMine
                            ? Alignment.centerRight
                            : Alignment.centerLeft,
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 8),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: isMine
                                ? Colors.teal.shade100
                                : Colors.grey.shade200,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Column(
                            crossAxisAlignment: isMine
                                ? CrossAxisAlignment.end
                                : CrossAxisAlignment.start,
                            children: [
                              Text(
                                message.senderName.isEmpty
                                    ? (isMine ? 'You' : 'User')
                                    : message.senderName,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(message.content),
                              const SizedBox(height: 2),
                              Text(
                                _formatTime(message.createdAt),
                                style: TextStyle(
                                  fontSize: 11,
                                  color: Colors.grey.shade700,
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 10),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _messageController,
                      minLines: 1,
                      maxLines: 3,
                      decoration: const InputDecoration(
                        hintText: 'Type message...',
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                  const SizedBox(width: 8),
                  FilledButton(
                    onPressed: _sending ? null : _send,
                    child: _sending
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.send),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
