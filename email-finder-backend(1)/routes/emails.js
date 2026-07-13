const express = require("express");
const { fetchEmails } = require("../services/emailStore");

const router = express.Router();

// GET /api/emails?page=1&pageSize=100&search=info@
router.get("/", async (req, res) => {
  const page = parseInt(req.query.page, 10) || 1;
  const pageSize = Math.min(parseInt(req.query.pageSize, 10) || 100, 500);
  const search = (req.query.search || "").trim();

  const { rows, total, error } = await fetchEmails({ page, pageSize, search });

  if (error) return res.status(500).json({ error });
  res.json({ rows, total, page, pageSize });
});

module.exports = router;
