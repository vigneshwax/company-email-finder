const express = require("express");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
const { crawlWebsite } = require("../services/crawler");
const { createJob, getJob } = require("../jobs/jobStore");
const { saveEmails } = require("../services/emailStore");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

// ---- Single URL crawl -----------------------------------------------
router.post("/single", async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "url is required" });

  try {
    const result = await crawlWebsite(url, { maxPages: 6 });
    const { saved, error: saveError } = await saveEmails(result.emails);
    res.json({ ...result, savedToDb: saved, dbError: saveError || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- Bulk CSV upload -> creates an async job -------------------------
router.post("/bulk", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "CSV file is required" });

  const urls = [];
  fs.createReadStream(req.file.path)
    .pipe(csv({ headers: false }))
    .on("data", (row) => {
      const val = Object.values(row)[0];
      if (val && val.trim() && !/^url$/i.test(val.trim())) {
        urls.push(val.trim());
      }
    })
    .on("end", () => {
      fs.unlink(req.file.path, () => {});
      if (!urls.length) {
        return res.status(400).json({ error: "No URLs found in the CSV file" });
      }
      const jobId = createJob(urls);
      res.json({ jobId, total: urls.length });
    })
    .on("error", (err) => {
      fs.unlink(req.file.path, () => {});
      res.status(500).json({ error: err.message });
    });
});

// ---- Live progress via Server-Sent Events -----------------------------
router.get("/bulk/:jobId/stream", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).end();

  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  res.flushHeaders();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Replay anything already collected before this client connected.
  job.results.forEach((r) => send("result", r));

  if (job.status === "done" || job.status === "error") {
    send("done", { total: job.urls.length });
    return res.end();
  }

  const onResult = (r) => send("result", r);
  const onDone = () => {
    send("done", { total: job.urls.length });
    res.end();
  };

  job.emitter.on("result", onResult);
  job.emitter.on("done", onDone);

  req.on("close", () => {
    job.emitter.off("result", onResult);
    job.emitter.off("done", onDone);
  });
});

// ---- Poll fallback (no SSE) --------------------------------------------
router.get("/bulk/:jobId/results", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  res.json({ status: job.status, results: job.results, total: job.urls.length });
});

// ---- Download final CSV --------------------------------------------------
router.get("/bulk/:jobId/download", (req, res) => {
  const job = getJob(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  let csvContent = "Website,Emails,Pages Visited,Status\n";
  job.results.forEach((r) => {
    const emails = (r.emails || []).join("; ");
    const safeUrl = r.url.replace(/"/g, '""');
    const safeEmails = emails.replace(/"/g, '""');
    csvContent += `"${safeUrl}","${safeEmails}",${r.pagesVisited || 0},"${r.status}"\n`;
  });

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="email-results.csv"');
  res.send(csvContent);
});

module.exports = router;
