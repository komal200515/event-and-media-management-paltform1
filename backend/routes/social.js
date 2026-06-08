const router = require("express").Router();
const Media = require("../models/Media");
const User = require("../models/User");
const Notification = require("../models/Notification");
const { auth, optionalAuth } = require("../middleware/auth");

// Helper: notification
async function notify(req, type, recipientId, message, mediaId, eventId) {
  try {
    if (!recipientId) return;
    if (String(recipientId) === String(req.user._id)) return;

    const notif = await Notification.create({
      recipient: recipientId,
      sender: req.user._id,
      type,
      message,
      media: mediaId,
      event: eventId
    });

    const onlineUsers = req.app.get("onlineUsers");
    const io = req.app.get("io");

    if (onlineUsers && io) {
      const socketId = onlineUsers.get(String(recipientId));
      if (socketId) io.to(socketId).emit("notification", notif);
    }
  } catch (err) {
    console.log("Notify error:", err.message);
  }
}

// LIKE
// POST /api/social/like/:mediaId
router.post('/like/:mediaId', auth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId)
      .populate('uploadedBy', '_id name');
    if (!media) return res.status(404).json({ message: 'Media not found' });

    const userId  = String(req.user._id);
    const likeIdx = media.likes.indexOf(userId);
    let liked;

    if (likeIdx === -1) {
      media.likes.push(userId);
      liked = true;
    } else {
      media.likes.splice(likeIdx, 1);
      liked = false;
    }
    await media.save();

    // ✅ NEW: notify photo owner via Socket.IO
    if (liked && String(media.uploadedBy._id) !== userId) {
      const io = req.app.get('io');
      if (io) {
        io.to(`user_${media.uploadedBy._id}`).emit('photo_liked', {
          likedBy: req.user.name,
          mediaId: media._id,
          userId:  req.user._id
        });
      }
    }

    res.json({ liked, likes: media.likes.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET COMMENTS
// POST /api/social/comment/:mediaId
router.post('/comment/:mediaId', auth, async (req, res) => {
  try {
    const { text, mentions = [] } = req.body; // ✅ mentions array from frontend
    if (!text?.trim()) return res.status(400).json({ message: 'Comment text required' });

    const media = await Media.findById(req.params.mediaId)
      .populate('uploadedBy', '_id name');
    if (!media) return res.status(404).json({ message: 'Media not found' });

    // add comment (adjust to match your existing schema)
    const comment = {
      user:      req.user._id,
      text:      text.trim(),
      createdAt: new Date()
    };
    media.comments = media.comments || [];
    media.comments.push(comment);
    await media.save();

    const io      = req.app.get('io');
    const ownerId = String(media.uploadedBy._id);
    const selfId  = String(req.user._id);

    if (io) {
      // ✅ Notify photo owner
      if (ownerId !== selfId) {
        io.to(`user_${ownerId}`).emit('photo_commented', {
          commentedBy: req.user.name,
          text:        text.slice(0, 60),
          mediaId:     media._id
        });
      }

      // ✅ Notify @mentioned users
      if (mentions.length > 0) {
        const User = require('../models/User');
        const mentionedUsers = await User.find({
          name: { $in: mentions.map(m => new RegExp(`^${m.trim()}$`, 'i')) }
        }).select('_id name');

        for (const mu of mentionedUsers) {
          if (String(mu._id) !== selfId) {
            io.to(`user_${mu._id}`).emit('mentioned', {
              mentionedBy: req.user.name,
              text:        text.slice(0, 60),
              mediaId:     media._id
            });
          }
        }
      }

      // Broadcast to all (for open comment modals)
      io.emit('new-comment', {
        mediaId: media._id,
        text,
        userId:  req.user._id,
        user:    { name: req.user.name, _id: req.user._id }
      });
    }

    res.json({
      message: 'Comment posted',
      comment: { ...comment, user: { name: req.user.name, _id: req.user._id } }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE COMMENT
router.delete("/comment/:mediaId/:commentId", auth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId);
    if (!media) return res.status(404).json({ message: "Media not found" });

    const comment = media.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ message: "Comment not found" });
    }

    if (String(comment.user) !== String(req.user._id) && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    comment.deleteOne();
    await media.save();

    res.json({ message: "Comment deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// FAVORITE
router.post("/favorite/:mediaId", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const isFav = user.favorites.includes(req.params.mediaId);

    if (isFav) {
      user.favorites.pull(req.params.mediaId);
    } else {
      user.favorites.push(req.params.mediaId);
    }

    await user.save();
    res.json({ favorited: !isFav });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET FAVORITES
router.get("/favorites", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("favorites");
    res.json(user.favorites || []);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;