const { Timetable, Class, User, Subject, Substitution } = require('../models');

const timetableController = {
  async create(req, res) {
    try {
        const { classId, subjectId, facultyId, day, period, department, batch, year, roomNo } = req.body;

        if (!classId || !subjectId || !facultyId || !day || !period || !department || !year) {
          return res.status(400).json({ error: 'All fields are required' });
        }

        const existingEntry = await Timetable.findOne({ class: classId, day, period });
        if (existingEntry) {
          return res.status(400).json({
            error: 'This period is already occupied for this class on ' + day
          });
        }

        const timetable = new Timetable({
          class: classId,
          department,
          batch: batch || '',
          year,
          subject: subjectId,
          faculty: facultyId,
          day,
          period,
          roomNo: roomNo || ''        });

        await timetable.save();
      const populatedTimetable = await Timetable.findById(timetable._id)
        .populate('class')
        .populate('subject')
        .populate('faculty', 'name email');

      res.status(201).json({
        message: 'Timetable entry created successfully',
        timetable: populatedTimetable
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getAll(req, res) {
    try {
      const { classId, facultyId, department, year, batch } = req.query;
      const query = {};

      if (classId) query.class = classId;
      if (facultyId) query.faculty = facultyId;
      if (department) query.department = department;
      if (year) query.year = parseInt(year);
      if (batch) query.batch = batch;

      const timetables = await Timetable.find(query)
        .populate('class')
        .populate('subject')
        .populate('faculty', 'name email')
        .sort({ department: 1, year: 1, batch: 1, day: 1, period: 1 });

      res.json({ timetables });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getByClassAndDay(req, res) {
    try {
      const { classId, day } = req.params;

      const timetables = await Timetable.find({ class: classId, day })
        .populate('subject')
        .populate('faculty', 'name')
        .sort({ period: 1 });

      res.json({ timetables });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getFacultyTimetable(req, res) {
    try {
      const { facultyId } = req.user._id;
      const { day } = req.query;

      const query = { faculty: req.user._id };
      if (day) query.day = day;

      const timetables = await Timetable.find(query)
        .populate('class', 'className department year batch')
        .populate('subject')
        .sort({ department: 1, year: 1, batch: 1, day: 1, period: 1 });

      res.json({ timetables });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async getTodayTimetable(req, res) {
    try {
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const today = days[new Date().getDay()];

      const timetables = await Timetable.find({ 
        faculty: req.user._id, 
        day: today 
      })
        .populate('class', 'className department year batch')
        .populate('subject', 'subjectName subjectCode')
        .sort({ period: 1 });

      res.json({ timetables, day: today });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const { subjectId, facultyId, day, period, department, batch, year, roomNo } = req.body;

      const timetable = await Timetable.findById(id);
      if (!timetable) {
        return res.status(404).json({ error: 'Timetable entry not found' });
      }

      if (subjectId) timetable.subject = subjectId;
      if (facultyId) timetable.faculty = facultyId;
      if (day) timetable.day = day;
      if (period) timetable.period = period;
      if (department) timetable.department = department;
      if (batch) timetable.batch = batch;
      if (year) timetable.year = year;
      if (roomNo !== undefined) timetable.roomNo = roomNo;

      await timetable.save();

      const updatedTimetable = await Timetable.findById(id)
        .populate('class')
        .populate('subject')
        .populate('faculty', 'name email');

      res.json({ 
        message: 'Timetable updated successfully', 
        timetable: updatedTimetable 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  async delete(req, res) {
    try {
      const timetable = await Timetable.findByIdAndDelete(req.params.id);
      
      if (!timetable) {
        return res.status(404).json({ error: 'Timetable entry not found' });
      }

      res.json({ message: 'Timetable entry deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // @desc    Get today's timetable for the logged-in user
  // @route   GET /api/timetable/today
  // @access  Private
  getTodayTimetable: async (req, res) => {
    try {
        const today = new Date();
        const dayOfWeek = today.toLocaleString('en-US', { weekday: 'long' });
        const isStudent = req.user.role === 'student';

        let timetableQuery = { day: dayOfWeek };
        let classId;

        if (isStudent) {
            classId = req.user.assignedClass;
            if (!classId) return res.json({ schedule: [] });
            timetableQuery.class = classId;
        } else { // faculty
            timetableQuery.faculty = req.user._id;
        }

        let timetables = await Timetable.find(timetableQuery)
            .populate('class')
            .populate('subject')
            .populate('faculty', 'name email');

        let finalSchedule = timetables.map(t => {
            const obj = t.toObject();
            if (obj.subject) obj.subject.name = obj.subject.subjectName;
            if (obj.class) obj.class.name = obj.class.className;
            return obj;
        });

        // --- Apply Substitutions ---
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const substitutionQuery = { date: { $gte: todayStart, $lte: todayEnd } };
        
        if (isStudent) {
            substitutionQuery.class = classId;
        } else { // faculty
            substitutionQuery.$or = [
                { originalFaculty: req.user._id },
                { substituteFaculty: req.user._id }
            ];
        }

        const substitutions = await Substitution.find(substitutionQuery)
            .populate('substituteFaculty', 'name')
            .populate('originalFaculty', 'name')
            .populate('class')
            .populate('subject');

        if (isStudent) {
            substitutions.forEach(sub => {
                const periodIndex = finalSchedule.findIndex(p => p.period === sub.period);
                if (periodIndex > -1) {
                    finalSchedule[periodIndex].faculty = sub.substituteFaculty;
                    finalSchedule[periodIndex].isSubstitution = true;
                }
            });
        } else { // faculty
            // Handling substitutions for faculty
            substitutions.forEach(sub => {
                // If I am being substituted by someone else
                if (sub.originalFaculty && sub.originalFaculty._id.equals(req.user._id)) {
                    const periodIndex = finalSchedule.findIndex(p => p.period === sub.period && p.class._id.equals(sub.class._id));
                    if (periodIndex > -1) {
                        finalSchedule[periodIndex].isSubstituted = true;
                        if (sub.substituteFaculty) {
                            finalSchedule[periodIndex].substitutionDetails = `Substituted by ${sub.substituteFaculty.name}`;
                        }
                    }
                }
                
                // If I am the substitute for someone else
                if (sub.substituteFaculty && sub.substituteFaculty._id.equals(req.user._id)) {
                    const subObj = sub.toObject();
                    if (subObj.subject) subObj.subject.name = subObj.subject.subjectName;
                    if (subObj.class) subObj.class.name = subObj.class.className;
                    finalSchedule.push({
                        _id: sub._id,
                        period: sub.period,
                        subject: subObj.subject,
                        faculty: subObj.substituteFaculty,
                        class: subObj.class,
                        isSubstitution: true,
                        substitutionDetails: `Substituting for ${sub.originalFaculty ? sub.originalFaculty.name : 'Unknown'}`
                    });
                }
            });
        }

        finalSchedule.sort((a, b) => {
            const periodA = Number(a.period) || 0;
            const periodB = Number(b.period) || 0;
            return periodA - periodB;
        });

        res.json({ schedule: finalSchedule });

    } catch (error) {
        console.error("Error fetching today's timetable:", error);
        res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = timetableController;

