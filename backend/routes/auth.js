const router = require('express').Router();
const jwt    = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User   = require('../models/User');
const { auth } = require('../middleware/auth');

const genToken = (id) =>
  jwt.sign({ userId: id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /api/auth/register
router.post('/register',
  [body('name').notEmpty(), body('email').isEmail(), body('password').isLength({ min: 6 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, role, club } = req.body;
    try {
      if (await User.findOne({ email }))
        return res.status(400).json({ message: 'Email already registered' });

      const user = await User.create({ name, email, password, role: role || 'viewer', club });
      res.status(201).json({ token: genToken(user._id), user });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// POST /api/auth/login
router.post('/login',
  [body('email').isEmail(), body('password').notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    try {
      const user = await User.findOne({ email });
      if (!user || !(await user.comparePassword(password)))
        return res.status(401).json({ message: 'Invalid email or password' });

      res.json({ token: genToken(user._id), user });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// GET /api/auth/me
router.get('/me', auth, (req, res) => res.json(req.user));

// PUT /api/auth/update-profile
router.put('/update-profile', auth, async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.user._id, req.body, { new: true });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PUT /api/auth/upload-selfie  (for facial recognition)
router.put('/upload-selfie', auth, async (req, res) => {
  try {
    const { selfieUrl, faceDescriptor } = req.body;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { referenceSelfie: selfieUrl, faceDescriptor },
      { new: true }
    );
    res.json({ message: 'Selfie saved', user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;