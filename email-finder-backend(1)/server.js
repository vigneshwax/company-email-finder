require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const crawlRoutes = require("./routes/crawl");
const emailRoutes = require("./routes/emails");
const { closeBrowser } = require("./services/crawler");

const app = express();
const PORT = process.env.PORT || 5000;

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

app.use(cors());
app.use(express.json());

app.use("/api/crawl", crawlRoutes);
app.use("/api/emails", emailRoutes);

app.get("/", (req, res) => {
  res.send("Email Finder API is running");
});

const server = app.listen(PORT, () => {
  console.log(`Email Finder backend running on http://localhost:${PORT}`);
});

// Graceful shutdown so the Puppeteer/Chromium process doesn't linger.
process.on("SIGINT", async () => {
  await closeBrowser();
  server.close(() => process.exit(0));
});
process.on("SIGTERM", async () => {
  await closeBrowser();
  server.close(() => process.exit(0));
});
