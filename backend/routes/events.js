const router = require('express').Router();
const QRCode = require('qrcode');
const Event  = require('../models/Event');
const Media  = require('../models/Media');
const { auth, optionalAuth, requireRole } = require('../middleware/auth');

// GET /api/events
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page = 1, limit = 12, sort = 'date', category, status, search } = req.query;
    const skip = (page - 1) * limit;

    const query = {};
    if (!req.user || req.user.role === 'viewer') query.isPublic = true;
    if (category) query.category = category;
    if (status)   query.status   = status;
    if (search)   query.$text    = { $search: search };

    const sortMap = { date: { date: -1 }, name: { name: 1 }, popular: { views: -1 } };

    const [events, total] = await Promise.all([
      Event.find(query)
        .populate('createdBy', 'name avatar')
        .sort(sortMap[sort] || { date: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Event.countDocuments(query),
    ]);

    res.json({ events, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/events/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('createdBy',     'name avatar role')
      .populate('photographers', 'name avatar');

    if (!event) return res.status(404).json({ message: 'Event not found' });
    if (!event.isPublic && !req.user)
      return res.status(403).json({ message: 'Private event' });

    await Event.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/events  (admin, photographer, club_member)
router.post('/', auth, requireRole('admin', 'photographer', 'club_member'), async (req, res) => {
  try {
    const event = await Event.create({
  name: req.body.name || req.body.eventName,
  description: req.body.description,
  category: req.body.category,
  date: req.body.date,
  location: req.body.location,
  isPublic: req.body.isPublic,
  createdBy: req.user._id
});

    // Generate QR code pointing to event page
    const url = `${process.env.FRONTEND_URL}/events/${event._id}`;
    event.qrCode = await QRCode.toDataURL(url);
    await event.save();

    res.status(201).json(event);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/events/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Not found' });
    if (String(event.createdBy) !== String(req.user._id) && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    const updated = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/events/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) return res.status(404).json({ message: 'Not found' });
    if (String(event.createdBy) !== String(req.user._id) && req.user.role !== 'admin')
      return res.status(403).json({ message: 'Forbidden' });

    await Promise.all([
      Event.findByIdAndDelete(req.params.id),
      Media.deleteMany({ event: req.params.id }),
    ]);
    res.json({ message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
