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
router.post("/like/:mediaId", auth, async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId);
    if (!media) return res.status(404).json({ message: "Media not found" });

    const liked = media.likes.includes(req.user._id);

    if (liked) {
      media.likes.pull(req.user._id);
    } else {
      media.likes.push(req.user._id);
      await notify(
        req,
        "like",
        media.uploadedBy,
        `${req.user.name} liked your photo`,
        media._id,
        media.event
      );
    }

    await media.save();
    res.json({ liked: !liked, count: media.likes.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET COMMENTS
router.get("/comments/:mediaId", async (req, res) => {
  try {
    const media = await Media.findById(req.params.mediaId)
      .populate("comments.user", "name email");

    if (!media) {
      return res.status(404).json({ message: "Media not found" });
    }

    res.json({ comments: media.comments || [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST COMMENT
router.post("/comment/:mediaId", auth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Text required" });
    }

    const media = await Media.findById(req.params.mediaId);
    if (!media) return res.status(404).json({ message: "Media not found" });

    media.comments.push({
      user: req.user._id,
      text: text.trim()
    });

    await media.save();

    await notify(
      req,
      "comment",
      media.uploadedBy,
      `${req.user.name} commented on your photo`,
      media._id,
      media.event
    );

    const newComment = media.comments[media.comments.length - 1];

    res.json(newComment);
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